/**
 * app.js — Application entry point, router, and shared state.
 *
 * Boot sequence:
 *   1. Initialise Firebase (offline-safe)
 *   2. Listen for auth state changes
 *   3. Load the user's profile (trainee or coach) from Dexie
 *   4. Route to the correct screen
 */

import { initFirebase }         from './firebase.js';
import { onAuthChange }         from './auth.js';
import { getTraineeByEmail,
         getCoachByEmail }      from './db.js';
import { renderLogin }          from './ui/login.js';
import { renderOnboarding }     from './ui/onboarding.js';
import { renderDashboard }      from './ui/dashboard.js';
import { renderActiveSession }  from './ui/active-session.js';
import { renderSessionComplete} from './ui/session-complete.js';
import { renderHistory }        from './ui/history.js';
import { renderProgress }       from './ui/progress.js';
import { renderAdminDashboard } from './ui/admin/dashboard.js';
import { renderProgramBuilder } from './ui/admin/program-builder.js';
import { renderTraineeManager } from './ui/admin/trainee-manager.js';

// ── Shared application state ──────────────────────────────────────────────────
export const state = {
  user:             null,   // Firebase auth user
  trainee:          null,   // Dexie trainee record
  coach:            null,   // Dexie coach record
  activeSessionLog: null,   // WorkoutLog ID for the in-progress session
  sessionResults:   null,   // Progression results from last completed session
};

// ── Navigation ────────────────────────────────────────────────────────────────
export function navigate(path) {
  window.location.hash = path;
}

// ── Router ────────────────────────────────────────────────────────────────────
async function route() {
  const hash = window.location.hash || '#/login';
  const path = hash.replace(/^#/, '');
  const root = document.getElementById('app');

  // Auth guard — redirect to login if no user
  if (!state.user && path !== '/login') {
    navigate('/login');
    return;
  }

  // No-profile guard — user is authenticated but not yet in the local DB.
  // This happens the first time someone signs in on a new device before
  // the coach has added them, or before Firestore has synced their record.
  if (state.user && !state.trainee && !state.coach && path !== '/login') {
    renderNoProfile(root, state, navigate);
    return;
  }

  // Coach guard — trainees can't access admin routes
  if (path.startsWith('/admin') && !state.coach) {
    navigate('/dashboard');
    return;
  }

  // Onboarding guard — trainee must pick cycle start before using the app
  if (state.trainee && !state.trainee.cycle_start_session && path !== '/onboarding') {
    navigate('/onboarding');
    return;
  }

  switch (path) {
    case '/login':
      renderLogin(root, state, navigate);
      break;

    case '/onboarding':
      renderOnboarding(root, state, navigate);
      break;

    case '/dashboard':
      await renderDashboard(root, state, navigate);
      break;

    case '/session':
      await renderActiveSession(root, state, navigate);
      break;

    case '/session/complete':
      renderSessionComplete(root, state, navigate);
      break;

    case '/history':
      await renderHistory(root, state, navigate);
      break;

    case '/progress':
      await renderProgress(root, state, navigate);
      break;

    case '/admin':
    case '/admin/':
      await renderAdminDashboard(root, state, navigate);
      break;

    case '/admin/program':
      await renderProgramBuilder(root, state, navigate);
      break;

    case '/admin/trainees':
      await renderTraineeManager(root, state, navigate);
      break;

    default:
      navigate(state.coach ? '/admin' : '/dashboard');
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────
async function boot() {
  await initFirebase();

  onAuthChange(async (user) => {
    state.user    = user;
    state.trainee = null;
    state.coach   = null;

    try {
      if (user) {
        // Determine role by checking both tables
        const [trainee, coach] = await Promise.all([
          getTraineeByEmail(user.email),
          getCoachByEmail(user.email),
        ]);
        state.trainee = trainee ?? null;
        state.coach   = coach   ?? null;
      }

      await route();
    } catch (err) {
      console.error('[app] routing error:', err);
      document.getElementById('app').innerHTML = `
        <div style="padding:32px;text-align:center;color:#f44336;font-family:sans-serif">
          <p style="font-size:1.1rem;font-weight:600">Something went wrong</p>
          <p style="color:#a0a0a0;margin-top:8px;font-size:0.9rem">${err.message}</p>
          <button onclick="location.reload()"
                  style="margin-top:24px;background:#FF6B35;color:#fff;border:none;
                         padding:12px 24px;border-radius:8px;font-size:1rem;cursor:pointer">
            Reload
          </button>
        </div>`;
    }
  });

  window.addEventListener('hashchange', route);
}

// ── No-profile screen ────────────────────────────────────────────────────────
// Shown when a Firebase Auth user has no matching record in Dexie yet.
// The first user can self-register as coach; subsequent users must be added
// by the coach via the Trainee Manager.
function renderNoProfile(root, state, navigate) {
  import('./db.js').then(({ saveCoach, getCoachByEmail: _gc }) => {
    // Check if any coaches exist — if not, this must be the first user (the coach)
    import('./db.js').then(async ({ db }) => {
      const coachCount = await db.coaches.count();

      root.innerHTML = `
        <div class="auth-screen">
          <div class="auth-logo">
            <h1 class="app-title">WorkoutTracker</h1>
          </div>
          <div style="text-align:center;display:flex;flex-direction:column;gap:16px;width:100%;max-width:340px">
            ${coachCount === 0 ? `
              <p style="color:#a0a0a0;font-size:0.95rem;line-height:1.5">
                No gym is set up yet. Register as the coach to get started.
              </p>
              <button class="btn-primary btn-full" id="setup-coach-btn">
                Set up as Coach
              </button>
            ` : `
              <p style="color:#a0a0a0;font-size:0.95rem;line-height:1.5">
                Your account (<strong style="color:#fff">${state.user.email}</strong>) hasn't been
                added to the gym yet. Ask your coach to add you in the Trainee Manager.
              </p>
            `}
            <button class="ghost-btn" id="signout-no-profile">Sign out</button>
          </div>
        </div>
      `;

      root.querySelector('#setup-coach-btn')?.addEventListener('click', async () => {
        const gymId = await import('./db.js').then(({ saveGym }) =>
          saveGym({ name: 'My Gym', created_at: new Date().toISOString() })
        );
        await saveCoach({ gym_id: gymId, name: 'Coach', email: state.user.email });
        const coach = await import('./db.js').then(({ getCoachByEmail }) =>
          getCoachByEmail(state.user.email)
        );
        state.coach = coach;
        navigate('/admin');
      });

      root.querySelector('#signout-no-profile')?.addEventListener('click', async () => {
        await import('./auth.js').then(({ logout }) => logout());
        state.user = null;
        navigate('/login');
      });
    });
  });
}

boot();
