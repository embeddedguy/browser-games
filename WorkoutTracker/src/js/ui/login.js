/**
 * login.js — Login / Register screen.
 */

import { signIn, register } from '../auth.js';
import { escHtml }          from './utils.js';

export function renderLogin(container, state, navigate) {
  container.innerHTML = `
    <div class="auth-screen">
      <div class="auth-logo">
        <h1 class="app-title">WorkoutTracker</h1>
        <p class="app-subtitle">Guided progressive overload</p>
      </div>

      <div class="auth-tabs" role="tablist">
        <button class="auth-tab active" data-tab="login"    role="tab">Sign In</button>
        <button class="auth-tab"        data-tab="register" role="tab">Register</button>
      </div>

      <form class="auth-form" id="auth-form" novalidate>
        <div class="form-group">
          <label for="email">Email</label>
          <input type="email" id="email" name="email"
                 autocomplete="email" inputmode="email"
                 placeholder="you@example.com" required>
        </div>

        <div class="form-group">
          <label for="password">Password</label>
          <input type="password" id="password" name="password"
                 autocomplete="current-password"
                 placeholder="••••••••" required minlength="6">
        </div>

        <p class="auth-error hidden" id="auth-error" role="alert"></p>

        <button type="submit" class="btn-primary btn-full" id="submit-btn">
          Sign In
        </button>
      </form>
    </div>
  `;

  const tabs      = container.querySelectorAll('.auth-tab');
  const form      = container.querySelector('#auth-form');
  const submitBtn = container.querySelector('#submit-btn');
  const errorEl   = container.querySelector('#auth-error');
  let   mode      = 'login';

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      mode = tab.dataset.tab;
      tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === mode));
      submitBtn.textContent = mode === 'login' ? 'Sign In' : 'Create Account';
      errorEl.classList.add('hidden');
      errorEl.textContent = '';
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email    = form.email.value.trim();
    const password = form.password.value;

    submitBtn.disabled    = true;
    submitBtn.textContent = mode === 'login' ? 'Signing in…' : 'Creating account…';
    errorEl.classList.add('hidden');

    try {
      if (mode === 'login') {
        await signIn(email, password);
      } else {
        await register(email, password);
      }
      // onAuthChange in app.js will handle the redirect
    } catch (err) {
      console.error('[auth] error code:', err.code, err.message);
      errorEl.textContent = friendlyAuthError(err.code, err.message);
      errorEl.classList.remove('hidden');
      submitBtn.disabled    = false;
      submitBtn.textContent = mode === 'login' ? 'Sign In' : 'Create Account';
    }
  });
}

function friendlyAuthError(code, message) {
  const map = {
    'auth/invalid-credential':        'Incorrect email or password.',
    'auth/user-not-found':            'No account found with that email.',
    'auth/wrong-password':            'Incorrect password.',
    'auth/email-already-in-use':      'An account with that email already exists.',
    'auth/weak-password':             'Password must be at least 6 characters.',
    'auth/invalid-email':             'Please enter a valid email address.',
    'auth/too-many-requests':         'Too many attempts — please try again later.',
    'auth/operation-not-allowed':     'Email/password sign-in is not enabled. Enable it in the Firebase Console under Authentication → Sign-in method.',
    'auth/configuration-not-found':   'Firebase Authentication is not set up yet. Enable Email/Password in the Firebase Console under Authentication → Sign-in method.',
  };
  return map[code] ?? `Error (${code ?? 'unknown'}): ${message ?? 'Please try again.'}`;
}
