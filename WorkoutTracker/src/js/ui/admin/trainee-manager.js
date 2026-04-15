/**
 * admin/trainee-manager.js — Coach trainee management screen.
 *
 * Add trainees, view their working weights per exercise,
 * reset cycle positions, and see flagged regressions.
 */

import { getTraineesByGym, saveTrainee,
         getProgramByGym, getSessionsByProgram,
         getExercisesBySession, getExerciseState,
         upsertExerciseState, getFlaggedStates,
         updateTraineeCycleDay, getWorkoutLogs }  from '../../db.js';
import { escHtml, formatDate }                   from '../utils.js';

export async function renderTraineeManager(container, state, navigate) {
  const { coach } = state;
  const trainees  = await getTraineesByGym(coach.gym_id);

  container.innerHTML = `
    <div class="screen admin-screen">
      <header class="app-bar">
        <button class="ghost-btn" id="back-btn">&#8592;</button>
        <h1>Trainees</h1>
        <button class="ghost-btn" id="add-trainee-btn">+ Add</button>
      </header>

      <main class="trainee-manager-main">
        <div class="add-trainee-form hidden" id="add-trainee-form">
          ${renderAddTraineeForm()}
        </div>

        ${trainees.length === 0
          ? '<p class="empty-state">No trainees yet. Tap "+ Add" to invite someone.</p>'
          : '<div class="trainee-list" id="trainee-list">' + trainees.map(t => renderTraineeCard(t)).join('') + '</div>'}
      </main>
    </div>
  `;

  container.querySelector('#back-btn').addEventListener('click', () => navigate('/admin'));

  // Toggle add form
  container.querySelector('#add-trainee-btn').addEventListener('click', () => {
    container.querySelector('#add-trainee-form').classList.toggle('hidden');
  });

  // Add form submit
  container.querySelector('#add-trainee-form form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await saveTrainee({
      gym_id:              coach.gym_id,
      name:                fd.get('name').trim(),
      email:               fd.get('email').trim().toLowerCase(),
      cycle_day:           1,
      cycle_start_session: null, // set during trainee onboarding
    });
    navigate('/admin/trainees'); // refresh
  });

  // Expand trainee details on tap
  container.querySelectorAll('.trainee-card').forEach(card => {
    card.addEventListener('click', async () => {
      const traineeId = parseInt(card.dataset.traineeId, 10);
      const trainee   = trainees.find(t => t.id === traineeId);
      await expandTraineeCard(card, trainee, coach.gym_id);
    });
  });
}

async function expandTraineeCard(card, trainee, gymId) {
  const detail = card.querySelector('.trainee-detail');
  if (!detail) return;

  if (!detail.classList.contains('hidden')) {
    detail.classList.add('hidden');
    return;
  }

  detail.innerHTML = '<p class="loading-text">Loading…</p>';
  detail.classList.remove('hidden');

  const [program, logs, flagged] = await Promise.all([
    getProgramByGym(gymId),
    getWorkoutLogs(trainee.id, 1),
    getFlaggedStates(trainee.id),
  ]);

  if (!program) {
    detail.innerHTML = '<p class="empty-state">No program configured.</p>';
    return;
  }

  const sessions  = await getSessionsByProgram(program.id);
  const allExs    = (await Promise.all(sessions.map(s => getExercisesBySession(s.id)))).flat();
  const states    = await Promise.all(allExs.map(ex => getExerciseState(trainee.id, ex.id)));

  const weightRows = allExs.map((ex, i) => {
    const s = states[i];
    return `
      <div class="weight-row">
        <span class="weight-ex-name">${escHtml(ex.name)}</span>
        <span class="weight-current">${s?.current_weight ?? ex.starting_weight ?? '—'} lbs</span>
      </div>
    `;
  }).join('');

  const flagHtml = flagged.length > 0
    ? `<p class="flag-notice badge-error">⚠ ${flagged.length} flagged exercise(s)</p>`
    : '';

  const lastSession = logs[0];

  detail.innerHTML = `
    <div class="trainee-detail-inner">
      <div class="detail-stats">
        <span>Cycle Day: ${trainee.cycle_day ?? 1} of 8</span>
        <span>Last session: ${lastSession ? formatDate(lastSession.date) : 'Never'}</span>
      </div>
      ${flagHtml}
      <div class="weight-table">
        <h4>Working Weights</h4>
        ${weightRows || '<p class="empty-state">No weights recorded yet.</p>'}
      </div>
      <button class="btn-secondary reset-cycle-btn" data-trainee-id="${trainee.id}">
        Reset to Cycle Day 1
      </button>
    </div>
  `;

  detail.querySelector('.reset-cycle-btn')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    await updateTraineeCycleDay(trainee.id, 1);
    detail.querySelector('.detail-stats span').textContent = 'Cycle Day: 1 of 8';
  });
}

function renderTraineeCard(trainee) {
  return `
    <div class="trainee-card" data-trainee-id="${trainee.id}">
      <div class="trainee-card-header">
        <span class="trainee-card-name">${escHtml(trainee.name)}</span>
        <span class="trainee-card-email">${escHtml(trainee.email)}</span>
      </div>
      <div class="trainee-detail hidden"></div>
    </div>
  `;
}

function renderAddTraineeForm() {
  return `
    <form class="add-form" novalidate>
      <h3>Add Trainee</h3>
      <div class="form-group">
        <label>Full name</label>
        <input type="text" name="name" placeholder="e.g. Alex Johnson" required>
      </div>
      <div class="form-group">
        <label>Email address</label>
        <input type="email" name="email" placeholder="alex@example.com" required>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn-primary">Add Trainee</button>
      </div>
    </form>
  `;
}
