/**
 * admin/program-builder.js — Coach program setup screen.
 *
 * Lets the coach build all 6 session templates.
 * Each session contains 4–6 exercises with full parameters.
 */

import { getProgramByGym, saveProgram, saveSession,
         getSessionsByProgram, getExercisesBySession,
         saveExercise, deleteExercise,
         getSubstitutions, saveSubstitution, deleteSubstitution,
         getSessionByTypeAndVariant }               from '../../db.js';
import { escHtml }                                  from '../utils.js';

const SESSION_DEFS = [
  { type: 'push', variant: 'A', label: 'Push A', focus: 'Chest Focus' },
  { type: 'pull', variant: 'A', label: 'Pull A', focus: 'Vertical Pull' },
  { type: 'legs', variant: 'A', label: 'Legs A', focus: 'Squat Pattern' },
  { type: 'push', variant: 'B', label: 'Push B', focus: 'Shoulder Focus' },
  { type: 'pull', variant: 'B', label: 'Pull B', focus: 'Horizontal Pull' },
  { type: 'legs', variant: 'B', label: 'Legs B', focus: 'Hip Hinge' },
];

export async function renderProgramBuilder(container, state, navigate) {
  const { coach } = state;

  let program = await getProgramByGym(coach.gym_id);
  if (!program) {
    const progId = await saveProgram({ gym_id: coach.gym_id, name: 'PPL Program', version: 1 });
    program = await getProgramByGym(coach.gym_id);
    // Create the 6 session templates
    for (const def of SESSION_DEFS) {
      await saveSession({ program_id: progId, type: def.type, variant: def.variant });
    }
  }

  const sessions = await getSessionsByProgram(program.id);
  const sessionMap = Object.fromEntries(sessions.map(s => [`${s.type}_${s.variant}`, s]));

  renderSessionList(container, sessionMap, program, state, navigate);
}

function renderSessionList(container, sessionMap, program, state, navigate) {
  const tabs = SESSION_DEFS.map(def => {
    const session = sessionMap[`${def.type}_${def.variant}`];
    return `
      <button class="session-tab" data-type="${def.type}" data-variant="${def.variant}"
              data-session-id="${session?.id ?? ''}">
        <span class="tab-label">${def.label}</span>
        <span class="tab-focus">${def.focus}</span>
      </button>
    `;
  }).join('');

  container.innerHTML = `
    <div class="screen admin-screen">
      <header class="app-bar">
        <button class="ghost-btn" id="back-btn">&#8592;</button>
        <h1>Program Builder</h1>
        <span></span>
      </header>

      <main class="program-builder-main">
        <div class="session-tabs">${tabs}</div>
        <div class="session-editor" id="session-editor">
          <p class="empty-state">Select a session to edit its exercises.</p>
        </div>
      </main>
    </div>
  `;

  container.querySelector('#back-btn').addEventListener('click', () => navigate('/admin'));

  container.querySelectorAll('.session-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      container.querySelectorAll('.session-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const sessionId = parseInt(tab.dataset.sessionId, 10);
      renderSessionEditor(container.querySelector('#session-editor'), sessionId, program);
    });
  });
}

async function renderSessionEditor(editorEl, sessionId, program) {
  if (!sessionId) {
    editorEl.innerHTML = '<p class="empty-state">Session not found.</p>';
    return;
  }

  const exercises = await getExercisesBySession(sessionId);

  const exerciseHtml = exercises.length === 0
    ? '<p class="empty-state">No exercises yet. Add your first one below.</p>'
    : exercises.map((ex, i) => renderExerciseRow(ex, i)).join('');

  editorEl.innerHTML = `
    <div class="exercise-list" id="exercise-list">
      ${exerciseHtml}
    </div>
    <button class="btn-secondary btn-full" id="add-exercise-btn">+ Add Exercise</button>
    <div class="exercise-form hidden" id="exercise-form">
      ${renderExerciseForm()}
    </div>
  `;

  editorEl.querySelectorAll('.delete-exercise-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const exId = parseInt(btn.dataset.exId, 10);
      await deleteExercise(exId);
      renderSessionEditor(editorEl, sessionId, program);
    });
  });

  editorEl.querySelectorAll('.edit-exercise-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const exId = parseInt(btn.dataset.exId, 10);
      const ex = exercises.find(e => e.id === exId);
      if (ex) showExerciseForm(editorEl, sessionId, program, ex);
    });
  });

  editorEl.querySelector('#add-exercise-btn').addEventListener('click', () => {
    showExerciseForm(editorEl, sessionId, program, null);
  });
}

function renderExerciseRow(ex, index) {
  return `
    <div class="exercise-row" data-ex-id="${ex.id}">
      <div class="exercise-row-info">
        <span class="exercise-row-name">${escHtml(ex.name)}</span>
        <span class="exercise-row-meta">
          ${ex.sets}×${ex.rep_min}–${ex.rep_max} · RPE ${ex.target_rpe} · ${ex.increment_type}
        </span>
      </div>
      <div class="exercise-row-actions">
        <button class="icon-btn edit-exercise-btn" data-ex-id="${ex.id}" title="Edit">&#9998;</button>
        <button class="icon-btn delete-exercise-btn" data-ex-id="${ex.id}" title="Delete">&#x2715;</button>
      </div>
    </div>
  `;
}

function renderExerciseForm(ex = null) {
  const v = (field, def = '') => ex ? escHtml(ex[field] ?? def) : def;
  return `
    <form class="exercise-form-inner" id="exercise-form-inner" novalidate>
      <h3>${ex ? 'Edit Exercise' : 'Add Exercise'}</h3>

      <div class="form-group">
        <label>Exercise name</label>
        <input type="text" name="name" value="${v('name')}" placeholder="e.g. Bench Press" required>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Sets</label>
          <input type="number" name="sets" value="${v('sets', '3')}" min="1" max="10" required>
        </div>
        <div class="form-group">
          <label>Rep min</label>
          <input type="number" name="rep_min" value="${v('rep_min', '8')}" min="1" required>
        </div>
        <div class="form-group">
          <label>Rep max</label>
          <input type="number" name="rep_max" value="${v('rep_max', '12')}" min="1" required>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Target RPE</label>
          <input type="number" name="target_rpe" value="${v('target_rpe', '8')}" min="1" max="10" required>
        </div>
        <div class="form-group">
          <label>Rest (seconds)</label>
          <input type="number" name="rest_seconds_suggested" value="${v('rest_seconds_suggested', '180')}" min="0">
        </div>
      </div>

      <div class="form-group">
        <label>Type</label>
        <select name="increment_type">
          <option value="compound" ${(!ex || ex.increment_type === 'compound') ? 'selected' : ''}>Compound (+5 lbs)</option>
          <option value="isolation" ${ex?.increment_type === 'isolation' ? 'selected' : ''}>Isolation (+2.5 lbs)</option>
        </select>
      </div>

      <div class="form-group">
        <label>Starting weight (lbs)</label>
        <input type="number" name="starting_weight" value="${v('starting_weight', '45')}" min="0" step="2.5">
      </div>

      <div class="form-group">
        <label>Substitution 1 (optional)</label>
        <input type="text" name="sub1_name" value="${v('_sub1', '')}" placeholder="e.g. DB Bench Press">
        <input type="text" name="sub1_notes" value="${v('_sub1_notes', '')}" placeholder="Notes (optional)" class="mt-xs">
      </div>
      <div class="form-group">
        <label>Substitution 2 (optional)</label>
        <input type="text" name="sub2_name" value="${v('_sub2', '')}" placeholder="e.g. Machine Press">
        <input type="text" name="sub2_notes" value="${v('_sub2_notes', '')}" placeholder="Notes (optional)" class="mt-xs">
      </div>

      <div class="form-actions">
        <button type="submit" class="btn-primary">${ex ? 'Save Changes' : 'Add Exercise'}</button>
        <button type="button" class="ghost-btn" id="cancel-form-btn">Cancel</button>
      </div>

      <p class="form-error hidden" id="form-error"></p>
    </form>
  `;
}

function showExerciseForm(editorEl, sessionId, program, ex) {
  const formEl = editorEl.querySelector('#exercise-form');
  formEl.innerHTML = renderExerciseForm(ex);
  formEl.classList.remove('hidden');

  formEl.querySelector('#cancel-form-btn').addEventListener('click', () => {
    formEl.classList.add('hidden');
    formEl.innerHTML = '';
  });

  formEl.querySelector('#exercise-form-inner').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd      = new FormData(e.target);
    const errorEl = formEl.querySelector('#form-error');

    const repMin = parseInt(fd.get('rep_min'), 10);
    const repMax = parseInt(fd.get('rep_max'), 10);
    if (repMax <= repMin) {
      errorEl.textContent = 'Rep max must be greater than rep min.';
      errorEl.classList.remove('hidden');
      return;
    }

    const exercises = await getExercisesBySession(sessionId);
    const displayOrder = ex ? ex.display_order : (exercises.length + 1);

    const exId = await saveExercise({
      id:                   ex?.id,
      session_id:           sessionId,
      name:                 fd.get('name').trim(),
      sets:                 parseInt(fd.get('sets'), 10),
      rep_min:              repMin,
      rep_max:              repMax,
      target_rpe:           parseInt(fd.get('target_rpe'), 10),
      rest_seconds_suggested: parseInt(fd.get('rest_seconds_suggested'), 10) || 180,
      increment_type:       fd.get('increment_type'),
      starting_weight:      parseFloat(fd.get('starting_weight')) || 45,
      display_order:        displayOrder,
    });

    // Save substitutions (delete existing first if editing)
    if (ex) {
      const oldSubs = await getSubstitutions(ex.id);
      await Promise.all(oldSubs.map(s => deleteSubstitution(s.id)));
    }

    const sub1Name = fd.get('sub1_name')?.trim();
    const sub2Name = fd.get('sub2_name')?.trim();
    if (sub1Name) await saveSubstitution({ exercise_id: exId, name: sub1Name, notes: fd.get('sub1_notes')?.trim() ?? '' });
    if (sub2Name) await saveSubstitution({ exercise_id: exId, name: sub2Name, notes: fd.get('sub2_notes')?.trim() ?? '' });

    formEl.classList.add('hidden');
    formEl.innerHTML = '';
    renderSessionEditor(editorEl, sessionId, program);
  });
}
