/**
 * history.js — Session history list screen.
 */

import { getWorkoutLogs, getSetLogs }  from '../db.js';
import { escHtml, formatDate,
         formatDuration }              from './utils.js';

export async function renderHistory(container, state, navigate) {
  const { trainee } = state;
  const logs = await getWorkoutLogs(trainee.id, 30);

  container.innerHTML = `
    <div class="screen history-screen">
      <header class="app-bar">
        <button class="back-btn ghost-btn" id="back-btn">&#8592;</button>
        <h1>History</h1>
        <span></span>
      </header>

      <main class="history-main">
        ${logs.length === 0
          ? '<p class="empty-state">No sessions logged yet. Start your first session!</p>'
          : logs.map(log => renderLogItem(log)).join('')}
      </main>

      <nav class="bottom-nav">
        <button class="nav-btn"        data-route="/dashboard">Home</button>
        <button class="nav-btn active" data-route="/history">History</button>
        <button class="nav-btn"        data-route="/progress">Progress</button>
      </nav>
    </div>
  `;

  container.querySelector('#back-btn').addEventListener('click', () => navigate('/dashboard'));
  container.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.route));
  });

  // Expand set details on tap
  container.querySelectorAll('.log-item').forEach(item => {
    item.addEventListener('click', () => expandLog(item, trainee.id));
  });
}

function renderLogItem(log) {
  return `
    <div class="log-item" data-log-id="${log.id}">
      <div class="log-item-header">
        <span class="log-session-label">${escHtml(log.session_label ?? 'Session')}</span>
        <span class="log-badge ${log.completed ? 'badge-success' : 'badge-neutral'}">
          ${log.completed ? 'Complete' : 'Partial'}
        </span>
      </div>
      <div class="log-item-meta">
        <span>${formatDate(log.date)}</span>
        <span>${formatDuration(log.duration_minutes)}</span>
      </div>
      <div class="log-detail hidden" data-detail="${log.id}">
        <p class="loading-text">Loading…</p>
      </div>
    </div>
  `;
}

async function expandLog(item, traineeId) {
  const detail = item.querySelector('.log-detail');
  if (!detail) return;

  if (!detail.classList.contains('hidden')) {
    detail.classList.add('hidden');
    return;
  }

  const logId = parseInt(item.dataset.logId, 10);
  const sets  = await getSetLogs(logId);

  if (!sets.length) {
    detail.innerHTML = '<p class="empty-state">No sets recorded.</p>';
  } else {
    // Group by exercise_id
    const byExercise = sets.reduce((acc, s) => {
      (acc[s.exercise_id] = acc[s.exercise_id] ?? []).push(s);
      return acc;
    }, {});

    detail.innerHTML = Object.entries(byExercise).map(([, exSets]) => `
      <div class="detail-exercise">
        <p class="detail-sets">
          ${exSets.map(s =>
            `Set ${s.set_number}: ${s.reps} reps @ ${s.weight} lbs — RPE ${s.rpe_actual} (${s.set_feeling})`
          ).join('<br>')}
        </p>
      </div>
    `).join('');
  }

  detail.classList.remove('hidden');
}
