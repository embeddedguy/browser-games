/**
 * progression.js — RPE-adjusted double progression engine.
 *
 * Pure functions: no side effects, no external dependencies.
 * All progression decisions for the workout tracker flow through here.
 */

export const WEIGHT_INCREMENTS = {
  compound: 5,    // lbs — Squat, Bench, Row, Deadlift, OHP
  isolation: 2.5, // lbs — Curl, Lateral Raise, Tricep Ext, etc.
};

/**
 * Evaluate a completed exercise and determine what changes next session.
 *
 * @param {Object} exercise
 *   @param {number} exercise.sets          - Prescribed number of sets
 *   @param {number} exercise.rep_min       - Bottom of rep range
 *   @param {number} exercise.rep_max       - Top of rep range (trigger for progression)
 *   @param {number} exercise.target_rpe    - Coach-assigned RPE target (1–10)
 *   @param {string} exercise.increment_type - 'compound' | 'isolation'
 *
 * @param {Array<Object>} setLogs           - One entry per logged set
 *   @param {number} setLogs[].reps         - Actual reps completed
 *   @param {number} setLogs[].rpe_actual   - Trainee-reported RPE (1–10)
 *   @param {string} setLogs[].set_feeling  - 'smooth' | 'hard' | 'missed'
 *
 * @param {Object} state                    - Current trainee state for this exercise
 *   @param {number} state.current_weight              - Current working weight (lbs)
 *   @param {number} state.consecutive_below_sessions  - Sessions with 2+ sets below rep_min
 *
 * @returns {{
 *   progression: 'weight'|'reps'|'hold'|'flag_low'|'flag_regression',
 *   next_weight: number,
 *   next_consecutive_below: number,
 *   message: string
 * }}
 */
export function evaluateProgression(exercise, setLogs, state) {
  const { rep_min, rep_max, target_rpe, increment_type } = exercise;
  const { current_weight, consecutive_below_sessions } = state;

  if (!setLogs || setLogs.length === 0) {
    throw new Error('evaluateProgression: setLogs must be a non-empty array');
  }

  const n = setLogs.length;

  const belowRange      = setLogs.filter(s => s.reps < rep_min).length;
  const atTop           = setLogs.filter(s => s.reps >= rep_max).length;
  const avgRpe          = setLogs.reduce((sum, s) => sum + s.rpe_actual, 0) / n;
  // Any hard or missed feeling blocks weight increase — even one missed rep signals
  // the trainee is at their limit and shouldn't add load yet.
  const hasHardOrMissed = setLogs.some(s => s.set_feeling === 'hard' || s.set_feeling === 'missed');

  // ── Regression check (evaluated before anything else) ──────────────────────
  // Two or more sets below the bottom of the rep range, two sessions in a row.
  const newConsecutiveBelow = belowRange >= 2
    ? consecutive_below_sessions + 1
    : 0;

  if (newConsecutiveBelow >= 2) {
    return {
      progression: 'flag_regression',
      next_weight: current_weight,
      next_consecutive_below: newConsecutiveBelow,
      message: 'Regression flagged — please check in with your coach before the next session.',
    };
  }

  const allAtTop = atTop === n;

  // ── All sets hit top of rep range ──────────────────────────────────────────
  if (allAtTop) {
    // RPE at or below target AND majority of sets felt smooth → add weight
    if (avgRpe <= target_rpe && !hasHardOrMissed) {
      const increment = WEIGHT_INCREMENTS[increment_type] ?? WEIGHT_INCREMENTS.compound;
      return {
        progression: 'weight',
        next_weight: current_weight + increment,
        next_consecutive_below: 0,
        message: `Weight increases to ${current_weight + increment} lbs next session. Great work.`,
      };
    }

    // Hit reps but RPE was high or sets felt hard — not ready for load increase
    return {
      progression: 'reps',
      next_weight: current_weight,
      next_consecutive_below: 0,
      message: 'Rep target hit but effort was high. Push reps beyond the target before adding weight.',
    };
  }

  // ── Did NOT hit top of rep range ──────────────────────────────────────────
  // All sets in range, RPE below target, mostly smooth → weight is probably too light
  if (belowRange === 0 && avgRpe < target_rpe && !hasHardOrMissed) {
    return {
      progression: 'flag_low',
      next_weight: current_weight,
      next_consecutive_below: newConsecutiveBelow,
      message: 'Sets felt easy but the rep target was not reached. Starting weight may be set too low — check with your coach.',
    };
  }

  // Default: keep working
  return {
    progression: 'hold',
    next_weight: current_weight,
    next_consecutive_below: newConsecutiveBelow,
    message: 'Keep working at current weight and rep range.',
  };
}
