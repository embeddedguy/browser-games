/**
 * session-complete.js — Post-session summary screen.
 *
 * Shows progression decisions per exercise (weight up / reps / hold / flag),
 * total session duration, and a "Done" button back to the dashboard.
 */

import { escHtml, formatDuration } from './utils.js';

const PROGRESSION_LABELS = {
  weight:           { label: 'Weight Up',   cls: 'badge-success'  },
  reps:             { label: 'Reps Up',     cls: 'badge-info'     },
  hold:             { label: 'Hold',        cls: 'badge-neutral'  },
  flag_low:         { label: 'Check Weight',cls: 'badge-warning'  },
  flag_regression:  { label: 'See Coach',   cls: 'badge-error'    },
};

export function renderSessionComplete(container, state, navigate) {
  const { sessionResults } = state;

  if (!sessionResults) { navigate('/dashboard'); return; }

  const { progressionResults, durationMinutes } = sessionResults;

  const resultRows = progressionResults.map(({ exercise, result }) => {
    const { label, cls } = PROGRESSION_LABELS[result.progression] ?? { label: result.progression, cls: 'badge-neutral' };
    return `
      <div class="result-row">
        <div class="result-exercise">
          <span class="result-name">${escHtml(exercise.name)}</span>
          <span class="result-weight">${result.next_weight} lbs</span>
        </div>
        <span class="progression-badge ${cls}">${label}</span>
      </div>
      <p class="result-message">${escHtml(result.message)}</p>
    `;
  }).join('');

  container.innerHTML = `
    <div class="screen complete-screen">
      <header class="app-bar">
        <h1>Session Complete</h1>
      </header>

      <main class="complete-main">
        <div class="complete-hero">
          <p class="duration-display">${formatDuration(durationMinutes)}</p>
          <p class="duration-label">Total time</p>
        </div>

        <section class="results-section">
          <h2 class="section-title">Progression Summary</h2>
          <div class="results-list">
            ${resultRows || '<p class="empty-state">No sets logged.</p>'}
          </div>
        </section>

        <button class="btn-primary btn-full btn-large" id="done-btn">
          Back to Dashboard
        </button>
      </main>
    </div>
  `;

  container.querySelector('#done-btn').addEventListener('click', () => {
    state.sessionResults = null;
    navigate('/dashboard');
  });
}
