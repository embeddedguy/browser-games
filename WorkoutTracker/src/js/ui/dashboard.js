/**
 * dashboard.js — Trainee home screen.
 *
 * Shows today's session card with a prominent "Start Session" CTA,
 * or a rest day card with the next training session preview.
 */

import { buildCycleSequence, getTodaySession,
         getSessionLabel, getSessionFocus }   from '../session.js';
import { getWorkoutLogs }                     from '../db.js';
import { escHtml, formatDate, daysSince }     from './utils.js';
import { logout }                             from '../auth.js';

export async function renderDashboard(container, state, navigate) {
  const { trainee } = state;
  const sequence    = buildCycleSequence(trainee.cycle_start_session);
  const today       = getTodaySession(trainee.cycle_day, sequence);
  const recentLogs  = await getWorkoutLogs(trainee.id, 3);
  const lastLog     = recentLogs[0] ?? null;
  const dayCount    = daysSince(lastLog?.date);

  container.innerHTML = `
    <div class="screen dashboard-screen">
      <header class="app-bar">
        <div class="app-bar-title">
          <span class="greeting">Hey, ${escHtml(trainee.name)}</span>
          <span class="cycle-position">Cycle Day ${trainee.cycle_day} of 8</span>
        </div>
        <button class="icon-btn" id="logout-btn" title="Sign out">&#x2715;</button>
      </header>

      <main class="dashboard-main">
        ${today.type === 'rest' ? renderRestCard(sequence, trainee) : renderSessionCard(today, trainee, dayCount)}

        ${recentLogs.length > 0 ? renderRecentActivity(recentLogs, sequence) : ''}
      </main>

      <nav class="bottom-nav">
        <button class="nav-btn active" data-route="/dashboard">Home</button>
        <button class="nav-btn"        data-route="/history">History</button>
        <button class="nav-btn"        data-route="/progress">Progress</button>
      </nav>
    </div>
  `;

  // Start session
  container.querySelector('#start-session-btn')?.addEventListener('click', () => {
    navigate('/session');
  });

  // Bottom nav
  container.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.route));
  });

  // Logout
  container.querySelector('#logout-btn').addEventListener('click', async () => {
    await logout();
    state.user = null; state.trainee = null; state.coach = null;
    navigate('/login');
  });
}

// ── Sub-renderers ─────────────────────────────────────────────────────────────

function renderSessionCard(session, trainee, daysSinceLastSession) {
  const label = getSessionLabel(session);
  const focus = getSessionFocus(session);
  const lastSessionText = daysSinceLastSession === null
    ? 'First session!'
    : daysSinceLastSession === 0 ? 'Last session: today'
    : daysSinceLastSession === 1 ? 'Last session: yesterday'
    : `Last session: ${daysSinceLastSession} days ago`;

  return `
    <div class="session-card">
      <div class="session-card-header">
        <div>
          <h2 class="session-card-title">${escHtml(label)}</h2>
          <p class="session-card-focus">${escHtml(focus)}</p>
        </div>
        <span class="session-badge">Today</span>
      </div>
      <p class="last-session-text">${escHtml(lastSessionText)}</p>
      <button class="btn-primary btn-full btn-large" id="start-session-btn">
        Start Session
      </button>
    </div>
  `;
}

function renderRestCard(sequence, trainee) {
  // Show the next training session (skip rest days)
  let nextDay = trainee.cycle_day % 8 + 1;
  while (sequence[nextDay - 1].type === 'rest') nextDay = nextDay % 8 + 1;
  const nextSession = sequence[nextDay - 1];

  return `
    <div class="session-card rest-card">
      <div class="session-card-header">
        <div>
          <h2 class="session-card-title">Rest Day</h2>
          <p class="session-card-focus">Recovery is part of the program</p>
        </div>
        <span class="session-badge rest-badge">Rest</span>
      </div>
      <p class="next-session-text">
        Up next: <strong>${escHtml(getSessionLabel(nextSession))}</strong> — ${escHtml(getSessionFocus(nextSession))}
      </p>
    </div>
  `;
}

function renderRecentActivity(logs, sequence) {
  const items = logs.map(log => {
    const sessionInfo = sequence.find((_, i) => i + 1 === log.session_id) ?? null;
    return `
      <div class="history-item">
        <span class="history-label">${escHtml(log.session_label ?? 'Session')}</span>
        <span class="history-meta">${formatDate(log.date)} · ${log.duration_minutes ? log.duration_minutes + ' min' : 'Incomplete'}</span>
      </div>
    `;
  }).join('');

  return `
    <section class="recent-section">
      <h3 class="section-title">Recent Sessions</h3>
      <div class="history-list">${items}</div>
    </section>
  `;
}
