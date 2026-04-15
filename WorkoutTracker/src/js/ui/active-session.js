/**
 * active-session.js — Guided set-by-set workout logging screen.
 *
 * State machine phases per set:
 *   'logging'   → trainee enters reps and adjusts weight
 *   'post-set'  → trainee logs RPE (1–10) and set feeling
 *   'rest'      → advisory rest timer; trainee starts next set manually
 *
 * After all sets for an exercise → evaluateProgression → move to next exercise.
 * After all exercises → navigate to /session/complete.
 */

import { buildCycleSequence, getTodaySession, getSessionLabel } from '../session.js';
import { evaluateProgression }              from '../progression.js';
import { getExercisesBySession, getSessionByTypeAndVariant,
         getExerciseState, upsertExerciseState,
         getSubstitutions, createWorkoutLog, completeWorkoutLog,
         saveSetLog, getProgramByGym, updateTraineeCycleDay }   from '../db.js';
import { nextCycleDay }                     from '../session.js';
import { escHtml, formatTimer }             from './utils.js';

// ── Session state (module-level, reset on each session start) ─────────────────
let sessionState = null;

export async function renderActiveSession(container, state, navigate) {
  const { trainee } = state;
  const sequence    = buildCycleSequence(trainee.cycle_start_session);
  const today       = getTodaySession(trainee.cycle_day, sequence);

  if (today.type === 'rest') { navigate('/dashboard'); return; }

  // Load program → session template → exercises
  const program    = await getProgramByGym(trainee.gym_id);
  if (!program) { navigate('/dashboard'); return; }

  const template   = await getSessionByTypeAndVariant(program.id, today.type, today.variant);
  if (!template) { navigate('/dashboard'); return; }

  const exercises  = await getExercisesBySession(template.id);
  if (!exercises.length) { navigate('/dashboard'); return; }

  // Load substitutions and exercise states in parallel
  const [allSubs, allStates] = await Promise.all([
    Promise.all(exercises.map(ex => getSubstitutions(ex.id))),
    Promise.all(exercises.map(ex => getExerciseState(trainee.id, ex.id))),
  ]);

  // Create a workout log record immediately (save progress even if app closes)
  const workoutLogId = await createWorkoutLog({
    trainee_id:    trainee.id,
    session_id:    template.id,
    session_label: getSessionLabel(today),
    date:          new Date().toISOString(),
  });
  state.activeSessionLog = workoutLogId;

  // Build session state
  sessionState = {
    trainee,
    today,
    exercises,
    subs:              allSubs,     // allSubs[i] = substitutions for exercises[i]
    exStates:          allStates,   // allStates[i] = TraineeExerciseState for exercises[i]
    workoutLogId,
    currentExIdx:      0,
    currentSetIdx:     0,
    phase:             'logging',   // 'logging' | 'post-set' | 'rest'
    collectedSets:     exercises.map(ex => []), // [exIdx][setIdx] = SetLog data
    progressionResults:[],
    restTimer:         null,        // setInterval handle
    sessionStartTime:  Date.now(),
    navigate,
    state,
  };

  renderExercise(container);
}

// ── Main renderer (called on every state transition) ──────────────────────────

function renderExercise(container) {
  const { exercises, currentExIdx, currentSetIdx, phase, subs, exStates } = sessionState;
  const ex          = exercises[currentExIdx];
  const exState     = exStates[currentExIdx];
  const currentWeight = exState?.current_weight ?? ex.starting_weight ?? 0;
  const substitutions = subs[currentExIdx] ?? [];
  const totalExercises = exercises.length;
  const setCircles  = buildSetCircles(ex.sets, currentSetIdx, phase);
  const showSubBtn  = substitutions.length > 0;

  container.innerHTML = `
    <div class="screen session-screen">
      <header class="session-header">
        <button class="back-btn ghost-btn" id="end-early-btn">End Early</button>
        <div class="session-progress">
          Exercise ${currentExIdx + 1} of ${totalExercises}
        </div>
        <div class="session-label">${escHtml(getSessionLabel(sessionState.today))}</div>
      </header>

      <main class="session-main">
        <div class="exercise-card">
          <div class="exercise-header">
            <h2 class="exercise-name" id="exercise-name">${escHtml(ex.name)}</h2>
            ${showSubBtn ? `<button class="sub-btn ghost-btn" id="sub-btn">Swap</button>` : ''}
          </div>
          <div class="exercise-targets">
            <span class="target-chip">${ex.sets} × ${ex.rep_min}–${ex.rep_max} reps</span>
            <span class="target-chip">RPE target: ${ex.target_rpe}</span>
          </div>

          <div class="set-circles" role="list" aria-label="Sets">
            ${setCircles}
          </div>

          <!-- Phase: logging -->
          <div id="phase-logging" class="${phase !== 'logging' ? 'hidden' : ''}">
            <p class="set-prompt">Set ${currentSetIdx + 1}</p>

            <div class="stepper-group">
              <label class="stepper-label">Weight (lbs)</label>
              <div class="weight-stepper">
                <button class="stepper-btn" data-target="weight" data-step="-5">−5</button>
                <button class="stepper-btn" data-target="weight" data-step="-2.5">−2.5</button>
                <span class="stepper-value" id="weight-display">${currentWeight}</span>
                <button class="stepper-btn" data-target="weight" data-step="2.5">+2.5</button>
                <button class="stepper-btn" data-target="weight" data-step="5">+5</button>
              </div>
            </div>

            <div class="stepper-group">
              <label class="stepper-label">Reps completed</label>
              <div class="reps-stepper">
                <button class="stepper-btn" data-target="reps" data-step="-1">−</button>
                <span class="stepper-value" id="reps-display">0</span>
                <button class="stepper-btn" data-target="reps" data-step="1">+</button>
              </div>
            </div>

            <button class="btn-primary btn-full" id="log-set-btn">Log Set</button>
          </div>

          <!-- Phase: post-set feedback -->
          <div id="phase-post-set" class="${phase !== 'post-set' ? 'hidden' : ''}">
            <p class="set-prompt">How was Set ${currentSetIdx + 1}?</p>

            <div class="rpe-section">
              <div class="rpe-header">
                <label>Effort (RPE)</label>
                <span class="rpe-value-display" id="rpe-display">7</span>
              </div>
              <input type="range" min="1" max="10" step="1" value="7"
                     class="rpe-slider" id="rpe-slider">
              <div class="rpe-scale">
                <span>1 Easy</span>
                <span>5 Moderate</span>
                <span>10 Max</span>
              </div>
            </div>

            <div class="feeling-section">
              <label>How did it feel?</label>
              <div class="feeling-btns" id="feeling-btns">
                <button class="feeling-btn" data-feeling="smooth">Smooth</button>
                <button class="feeling-btn" data-feeling="hard">Hard but complete</button>
                <button class="feeling-btn" data-feeling="missed">Missed a rep</button>
              </div>
            </div>

            <button class="btn-primary btn-full" id="submit-feedback-btn" disabled>
              Done
            </button>
          </div>

          <!-- Phase: rest timer -->
          <div id="phase-rest" class="${phase !== 'rest' ? 'hidden' : ''}">
            <p class="rest-label">Rest</p>
            <div class="timer-display" id="timer-display">
              ${formatTimer(ex.rest_seconds_suggested ?? 180)}
            </div>
            <p class="timer-hint">Suggested rest: ${formatRestHint(ex.rest_seconds_suggested)}</p>
            <button class="btn-primary btn-full" id="next-set-btn">
              ${currentSetIdx + 1 < ex.sets ? 'Start Next Set' : 'Next Exercise'}
            </button>
          </div>
        </div>

        <!-- Substitution picker (hidden by default) -->
        ${showSubBtn ? renderSubPicker(substitutions) : ''}

        <!-- Notes -->
        <div class="notes-section">
          <textarea class="notes-input" id="exercise-notes"
                    placeholder="Notes for this exercise (optional)…"
                    rows="2"></textarea>
        </div>
      </main>
    </div>
  `;

  // Initialise phase-specific logic
  initSteppers(container);
  if (phase === 'logging')  initLoggingPhase(container);
  if (phase === 'post-set') initPostSetPhase(container);
  if (phase === 'rest')     initRestPhase(container);

  container.querySelector('#end-early-btn').addEventListener('click', () => endSessionEarly(container));
  if (showSubBtn) initSubPicker(container);
}

// ── Steppers ──────────────────────────────────────────────────────────────────

function initSteppers(container) {
  // Weight stepper
  const weightDisplay = container.querySelector('#weight-display');
  let weight = parseFloat(weightDisplay.textContent);

  container.querySelectorAll('[data-target="weight"]').forEach(btn => {
    btn.addEventListener('click', () => {
      weight = Math.max(0, weight + parseFloat(btn.dataset.step));
      weightDisplay.textContent = weight % 1 === 0 ? weight : weight.toFixed(1);
    });
  });

  // Reps stepper
  const repsDisplay = container.querySelector('#reps-display');
  let reps = 0;

  container.querySelectorAll('[data-target="reps"]').forEach(btn => {
    btn.addEventListener('click', () => {
      reps = Math.max(0, reps + parseInt(btn.dataset.step, 10));
      repsDisplay.textContent = reps;
    });
  });

  // Expose to other init functions via closure on the container element
  container._getWeight = () => weight;
  container._getReps   = () => reps;
}

// ── Logging phase ─────────────────────────────────────────────────────────────

function initLoggingPhase(container) {
  container.querySelector('#log-set-btn').addEventListener('click', () => {
    const reps   = container._getReps();
    const weight = container._getWeight();

    // Store partial set data; will be completed with RPE + feeling in post-set phase
    sessionState._pendingSet = { reps, weight };
    sessionState.phase = 'post-set';
    renderExercise(container);
  });
}

// ── Post-set phase ────────────────────────────────────────────────────────────

function initPostSetPhase(container) {
  const slider     = container.querySelector('#rpe-slider');
  const rpeDisplay = container.querySelector('#rpe-display');
  const submitBtn  = container.querySelector('#submit-feedback-btn');
  let selectedFeeling = null;

  slider.addEventListener('input', () => {
    rpeDisplay.textContent = slider.value;
  });

  container.querySelectorAll('.feeling-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.feeling-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedFeeling = btn.dataset.feeling;
      submitBtn.disabled = false;
    });
  });

  submitBtn.addEventListener('click', async () => {
    submitBtn.disabled = true;

    const { currentExIdx, currentSetIdx, workoutLogId, exercises, _pendingSet } = sessionState;
    const ex = exercises[currentExIdx];

    // Build and persist the completed set log
    const setLog = {
      workout_log_id:   workoutLogId,
      exercise_id:      ex.id,
      set_number:       currentSetIdx + 1,
      weight:           _pendingSet.weight,
      reps:             _pendingSet.reps,
      rpe_actual:       parseInt(slider.value, 10),
      set_feeling:      selectedFeeling,
      substitution_used: sessionState._usingSubstitution ?? false,
    };

    await saveSetLog(setLog);
    sessionState.collectedSets[currentExIdx].push(setLog);

    sessionState._pendingSet = null;
    sessionState._usingSubstitution = false;
    sessionState.phase = 'rest';
    renderExercise(container);
  });
}

// ── Rest phase ────────────────────────────────────────────────────────────────

function initRestPhase(container) {
  const { exercises, currentExIdx } = sessionState;
  const ex = exercises[currentExIdx];
  const totalSeconds = ex.rest_seconds_suggested ?? 180;
  let secondsLeft    = totalSeconds;

  const timerDisplay = container.querySelector('#timer-display');

  // Countdown — advisory only; trainee advances manually
  const handle = setInterval(() => {
    secondsLeft = Math.max(0, secondsLeft - 1);
    timerDisplay.textContent = formatTimer(secondsLeft);
    if (secondsLeft === 0) clearInterval(handle);
  }, 1000);
  sessionState.restTimer = handle;

  container.querySelector('#next-set-btn').addEventListener('click', () => {
    clearInterval(handle);
    advanceSet(container);
  });
}

// ── Set / Exercise advancement ────────────────────────────────────────────────

async function advanceSet(container) {
  const { exercises, currentExIdx, currentSetIdx } = sessionState;
  const ex = exercises[currentExIdx];

  if (currentSetIdx + 1 < ex.sets) {
    // More sets in this exercise
    sessionState.currentSetIdx++;
    sessionState.phase = 'logging';
    renderExercise(container);
  } else {
    // All sets done — evaluate progression for this exercise
    await finalizeExercise(currentExIdx);

    if (currentExIdx + 1 < exercises.length) {
      // Move to next exercise
      sessionState.currentExIdx++;
      sessionState.currentSetIdx = 0;
      sessionState.phase = 'logging';
      renderExercise(container);
    } else {
      // Session complete
      await finalizeSession();
    }
  }
}

async function finalizeExercise(exIdx) {
  const { exercises, exStates, collectedSets, trainee } = sessionState;
  const ex       = exercises[exIdx];
  const state    = exStates[exIdx] ?? { current_weight: ex.starting_weight ?? 0, consecutive_below_sessions: 0 };
  const setLogs  = collectedSets[exIdx];

  if (!setLogs.length) return;

  const result = evaluateProgression(ex, setLogs, state);
  sessionState.progressionResults.push({ exercise: ex, result });

  // Persist updated exercise state
  await upsertExerciseState({
    trainee_id:                 trainee.id,
    exercise_id:                ex.id,
    current_weight:             result.next_weight,
    consecutive_below_sessions: result.next_consecutive_below,
    last_progression_type:      result.progression,
    flagged: result.progression === 'flag_regression' || result.progression === 'flag_low',
  });
}

async function finalizeSession() {
  const { workoutLogId, sessionStartTime, trainee, navigate, state } = sessionState;
  const durationMinutes = Math.round((Date.now() - sessionStartTime) / 60000);

  await completeWorkoutLog(workoutLogId, durationMinutes);

  const newCycleDay = nextCycleDay(trainee.cycle_day);
  await updateTraineeCycleDay(trainee.id, newCycleDay);
  state.trainee = { ...trainee, cycle_day: newCycleDay };

  state.sessionResults = {
    progressionResults: sessionState.progressionResults,
    durationMinutes,
  };
  state.activeSessionLog = null;

  navigate('/session/complete');
}

async function endSessionEarly(container) {
  if (sessionState.restTimer) clearInterval(sessionState.restTimer);
  // Finalize any exercises that have collected sets
  for (let i = 0; i <= sessionState.currentExIdx; i++) {
    if (sessionState.collectedSets[i]?.length) await finalizeExercise(i);
  }
  await finalizeSession();
}

// ── Substitution picker ───────────────────────────────────────────────────────

function renderSubPicker(substitutions) {
  const options = substitutions.map(s => `
    <button class="sub-option" data-name="${escHtml(s.name)}">
      <span class="sub-name">${escHtml(s.name)}</span>
      ${s.notes ? `<span class="sub-notes">${escHtml(s.notes)}</span>` : ''}
    </button>
  `).join('');

  return `
    <div class="sub-picker hidden" id="sub-picker">
      <h3 class="sub-picker-title">Swap exercise</h3>
      ${options}
      <button class="ghost-btn" id="cancel-sub-btn">Cancel</button>
    </div>
  `;
}

function initSubPicker(container) {
  const picker = container.querySelector('#sub-picker');

  container.querySelector('#sub-btn')?.addEventListener('click', () => {
    picker?.classList.remove('hidden');
  });

  container.querySelector('#cancel-sub-btn')?.addEventListener('click', () => {
    picker?.classList.add('hidden');
  });

  container.querySelectorAll('.sub-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.name;
      container.querySelector('#exercise-name').textContent = name;
      sessionState._usingSubstitution = true;
      picker?.classList.add('hidden');
    });
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildSetCircles(totalSets, currentSetIdx, phase) {
  return Array.from({ length: totalSets }, (_, i) => {
    let cls = 'set-circle';
    if (i < currentSetIdx)                          cls += ' completed';
    else if (i === currentSetIdx && phase !== 'rest') cls += ' active';
    return `<div class="${cls}" role="listitem">${i + 1}</div>`;
  }).join('');
}

function formatRestHint(seconds) {
  if (!seconds) return '3 min';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m} min`;
}
