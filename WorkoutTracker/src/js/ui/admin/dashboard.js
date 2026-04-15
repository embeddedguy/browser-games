/**
 * admin/dashboard.js — Coach overview screen.
 *
 * Shows flagged regressions across all trainees plus quick links
 * to Program Builder and Trainee Manager.
 */

import { getTraineesByGym, getFlaggedStates,
         getExercisesBySession, getSessionsByProgram,
         getProgramByGym }                from '../../db.js';
import { logout }                         from '../../auth.js';
import { escHtml }                        from '../utils.js';

export async function renderAdminDashboard(container, state, navigate) {
  const { coach } = state;
  const gymId     = coach.gym_id;

  const [trainees, program] = await Promise.all([
    getTraineesByGym(gymId),
    getProgramByGym(gymId),
  ]);

  // Collect all flags across all trainees
  const flagData = await collectFlags(trainees, program);

  container.innerHTML = `
    <div class="screen admin-screen">
      <header class="app-bar">
        <h1>Coach Dashboard</h1>
        <button class="ghost-btn" id="logout-btn">Sign out</button>
      </header>

      <main class="admin-main">
        <div class="admin-cards">
          <button class="admin-card" data-route="/admin/program">
            <span class="admin-card-icon">&#128196;</span>
            <span class="admin-card-title">Program Builder</span>
            <span class="admin-card-sub">${program ? '6 sessions configured' : 'Not set up yet'}</span>
          </button>

          <button class="admin-card" data-route="/admin/trainees">
            <span class="admin-card-icon">&#128100;</span>
            <span class="admin-card-title">Trainees</span>
            <span class="admin-card-sub">${trainees.length} registered</span>
          </button>
        </div>

        ${flagData.length > 0 ? renderFlagSection(flagData) : ''}

        <section class="trainee-list-section">
          <h2 class="section-title">All Trainees</h2>
          ${trainees.length === 0
            ? '<p class="empty-state">No trainees yet. Go to Trainee Manager to add them.</p>'
            : trainees.map(t => renderTraineeRow(t)).join('')}
        </section>
      </main>
    </div>
  `;

  container.querySelectorAll('.admin-card').forEach(card => {
    card.addEventListener('click', () => navigate(card.dataset.route));
  });

  container.querySelector('#logout-btn').addEventListener('click', async () => {
    await logout();
    state.user = null; state.trainee = null; state.coach = null;
    navigate('/login');
  });
}

async function collectFlags(trainees, program) {
  if (!program || !trainees.length) return [];

  const sessions  = await getSessionsByProgram(program.id);
  const exercises = (await Promise.all(sessions.map(s => getExercisesBySession(s.id)))).flat();
  const exMap     = Object.fromEntries(exercises.map(e => [e.id, e]));

  const flagged = [];
  for (const trainee of trainees) {
    const flags = await getFlaggedStates(trainee.id);
    flags.forEach(f => {
      flagged.push({ trainee, flag: f, exercise: exMap[f.exercise_id] });
    });
  }
  return flagged;
}

function renderFlagSection(flags) {
  const items = flags.map(({ trainee, flag, exercise }) => `
    <div class="flag-item">
      <div class="flag-header">
        <span class="flag-trainee">${escHtml(trainee.name)}</span>
        <span class="flag-badge ${flag.last_progression_type === 'flag_regression' ? 'badge-error' : 'badge-warning'}">
          ${flag.last_progression_type === 'flag_regression' ? 'Regression' : 'Low Weight'}
        </span>
      </div>
      <span class="flag-exercise">${escHtml(exercise?.name ?? 'Unknown exercise')}</span>
    </div>
  `).join('');

  return `
    <section class="flags-section">
      <h2 class="section-title">Flags Requiring Attention</h2>
      <div class="flags-list">${items}</div>
    </section>
  `;
}

function renderTraineeRow(trainee) {
  return `
    <div class="trainee-row">
      <span class="trainee-name">${escHtml(trainee.name)}</span>
      <span class="trainee-meta">Day ${trainee.cycle_day ?? 1} of 8</span>
    </div>
  `;
}
