/**
 * progress.js — Per-exercise progress charts.
 *
 * Uses Chart.js (loaded via CDN in index.html) to render line charts
 * for working weight and session volume over time.
 */

import { getExercisesBySession, getSessionsByProgram,
         getProgramByGym, getSetLogHistory,
         getWorkoutLogs }                         from '../db.js';
import { buildCycleSequence }                     from '../session.js';
import { escHtml, formatDate }                    from './utils.js';

export async function renderProgress(container, state, navigate) {
  const { trainee } = state;

  const program = await getProgramByGym(trainee.gym_id);
  if (!program) {
    renderEmpty(container, navigate);
    return;
  }

  const sessions   = await getSessionsByProgram(program.id);
  const allExs     = (await Promise.all(sessions.map(s => getExercisesBySession(s.id)))).flat();

  if (!allExs.length) {
    renderEmpty(container, navigate);
    return;
  }

  // Build exercise select options
  const options = allExs.map(ex => `<option value="${ex.id}">${escHtml(ex.name)}</option>`).join('');

  container.innerHTML = `
    <div class="screen progress-screen">
      <header class="app-bar">
        <button class="back-btn ghost-btn" id="back-btn">&#8592;</button>
        <h1>Progress</h1>
        <span></span>
      </header>

      <main class="progress-main">
        <div class="exercise-selector-group">
          <label for="exercise-select">Exercise</label>
          <select id="exercise-select" class="exercise-select">
            ${options}
          </select>
        </div>

        <div class="chart-tabs">
          <button class="chart-tab active" data-chart="weight">Weight</button>
          <button class="chart-tab"        data-chart="volume">Volume</button>
          <button class="chart-tab"        data-chart="rpe">RPE Trend</button>
        </div>

        <div class="chart-container">
          <canvas id="progress-chart" role="img" aria-label="Progress chart"></canvas>
        </div>

        <div class="stats-row" id="stats-row"></div>
      </main>

      <nav class="bottom-nav">
        <button class="nav-btn"        data-route="/dashboard">Home</button>
        <button class="nav-btn"        data-route="/history">History</button>
        <button class="nav-btn active" data-route="/progress">Progress</button>
      </nav>
    </div>
  `;

  container.querySelector('#back-btn').addEventListener('click', () => navigate('/dashboard'));
  container.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.route));
  });

  let activeChart  = 'weight';
  let activeExId   = allExs[0]?.id;
  let chartInstance = null;

  async function refreshChart() {
    const exId = parseInt(container.querySelector('#exercise-select').value, 10);
    const sets = await getSetLogHistory(trainee.id, exId, 50);

    if (!sets.length) {
      renderNoData(container);
      return;
    }

    const chartData = buildChartData(sets, activeChart);
    renderChart(container, chartData, activeChart, chartInstance, (instance) => {
      chartInstance = instance;
    });
    renderStats(container, sets);
  }

  container.querySelector('#exercise-select').addEventListener('change', refreshChart);

  container.querySelectorAll('.chart-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      container.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeChart = tab.dataset.chart;
      refreshChart();
    });
  });

  await refreshChart();
}

// ── Chart helpers ─────────────────────────────────────────────────────────────

function buildChartData(sets, type) {
  // Group sets by workout_log_id to get per-session aggregates
  const bySession = sets.reduce((acc, s) => {
    (acc[s.workout_log_id] = acc[s.workout_log_id] ?? []).push(s);
    return acc;
  }, {});

  const sessions = Object.values(bySession).reverse(); // oldest first

  const labels = sessions.map((_, i) => `Session ${i + 1}`);

  let data;
  if (type === 'weight') {
    data = sessions.map(s => Math.max(...s.map(set => set.weight)));
  } else if (type === 'volume') {
    // Total volume = sum(weight × reps) per session
    data = sessions.map(s => s.reduce((sum, set) => sum + set.weight * set.reps, 0));
  } else {
    // RPE average per session
    data = sessions.map(s => {
      const avg = s.reduce((sum, set) => sum + set.rpe_actual, 0) / s.length;
      return Math.round(avg * 10) / 10;
    });
  }

  return { labels, data };
}

function renderChart(container, { labels, data }, type, existingInstance, setInstance) {
  if (existingInstance) existingInstance.destroy();

  const ctx = container.querySelector('#progress-chart').getContext('2d');
  const yLabel = type === 'weight' ? 'lbs' : type === 'volume' ? 'lbs × reps' : 'RPE';

  const instance = new window.Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: yLabel,
        data,
        borderColor:     '#FF6B35',
        backgroundColor: 'rgba(255, 107, 53, 0.15)',
        borderWidth:     2,
        pointRadius:     4,
        pointBackgroundColor: '#FF6B35',
        tension:         0.3,
        fill:            true,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#a0a0a0' }, grid: { color: '#333' } },
        y: { ticks: { color: '#a0a0a0' }, grid: { color: '#333' } },
      },
    },
  });

  setInstance(instance);
}

function renderStats(container, sets) {
  const weights = sets.map(s => s.weight);
  const maxWeight = Math.max(...weights);
  const totalSets = sets.length;
  const avgRpe    = sets.reduce((sum, s) => sum + s.rpe_actual, 0) / totalSets;

  container.querySelector('#stats-row').innerHTML = `
    <div class="stat-chip">
      <span class="stat-value">${maxWeight} lbs</span>
      <span class="stat-label">Best weight</span>
    </div>
    <div class="stat-chip">
      <span class="stat-value">${totalSets}</span>
      <span class="stat-label">Total sets</span>
    </div>
    <div class="stat-chip">
      <span class="stat-value">${avgRpe.toFixed(1)}</span>
      <span class="stat-label">Avg RPE</span>
    </div>
  `;
}

function renderEmpty(container, navigate) {
  container.innerHTML = `
    <div class="screen progress-screen">
      <header class="app-bar">
        <button class="ghost-btn" id="back-btn">&#8592;</button>
        <h1>Progress</h1>
        <span></span>
      </header>
      <main>
        <p class="empty-state">No program set up yet. Ask your coach to build your program.</p>
      </main>
    </div>
  `;
  container.querySelector('#back-btn').addEventListener('click', () => navigate('/dashboard'));
}

function renderNoData(container) {
  const canvas = container.querySelector('#progress-chart');
  if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  container.querySelector('#stats-row').innerHTML = '<p class="empty-state">No data yet for this exercise.</p>';
}
