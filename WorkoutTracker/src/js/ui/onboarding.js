/**
 * onboarding.js — First-time cycle start selection for new trainees.
 *
 * Shown once when a trainee's cycle_start_session is null.
 * The trainee picks which session type to begin their 8-day cycle with.
 */

import { saveTrainee }                     from '../db.js';
import { buildCycleSequence, getSessionLabel, getSessionFocus } from '../session.js';
import { escHtml }                         from './utils.js';

export function renderOnboarding(container, state, navigate) {
  const { trainee } = state;

  container.innerHTML = `
    <div class="onboarding-screen">
      <header class="app-bar">
        <h1>Welcome, ${escHtml(trainee?.name ?? 'Athlete')}</h1>
      </header>

      <div class="onboarding-body">
        <h2>Where would you like to start?</h2>
        <p class="onboarding-hint">
          Your program follows an 8-day Push / Pull / Legs cycle.
          Pick which session type kicks things off. The order after that is fixed.
        </p>

        <div class="start-options">
          ${renderStartOption('push', 'push')}
          ${renderStartOption('pull', 'pull')}
          ${renderStartOption('legs', 'legs')}
        </div>

        <p class="onboarding-preview" id="cycle-preview"></p>

        <button class="btn-primary btn-full hidden" id="confirm-start">
          Start my program
        </button>
      </div>
    </div>
  `;

  let selected = null;
  const confirmBtn = container.querySelector('#confirm-start');
  const preview    = container.querySelector('#cycle-preview');

  container.querySelectorAll('.start-option').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.start-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selected = btn.dataset.type;

      const seq = buildCycleSequence(selected);
      preview.textContent = `Your cycle: ${seq.filter(s => s.type !== 'rest').map(s => getSessionLabel(s)).join(' → ')} → Rest → Repeat`;
      confirmBtn.classList.remove('hidden');
    });
  });

  confirmBtn.addEventListener('click', async () => {
    if (!selected) return;
    confirmBtn.disabled    = true;
    confirmBtn.textContent = 'Saving…';

    await saveTrainee({ ...trainee, cycle_start_session: selected, cycle_day: 1 });
    state.trainee = { ...trainee, cycle_start_session: selected, cycle_day: 1 };
    navigate('/dashboard');
  });
}

function renderStartOption(type, label) {
  const focuses = {
    push: 'Chest Focus (A) · Shoulder Focus (B)',
    pull: 'Vertical Pull (A) · Horizontal Pull (B)',
    legs: 'Squat Pattern (A) · Hip Hinge (B)',
  };
  return `
    <button class="start-option" data-type="${type}">
      <span class="start-option-label">${label.charAt(0).toUpperCase() + label.slice(1)}</span>
      <span class="start-option-sub">${focuses[type]}</span>
    </button>
  `;
}
