import { describe, it, expect } from 'vitest';
import { evaluateProgression, WEIGHT_INCREMENTS } from '../src/js/progression.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const bench = {
  sets: 3,
  rep_min: 8,
  rep_max: 12,
  target_rpe: 8,
  increment_type: 'compound',
};

const lateralRaise = {
  sets: 3,
  rep_min: 12,
  rep_max: 15,
  target_rpe: 7,
  increment_type: 'isolation',
};

const baseState = { current_weight: 135, consecutive_below_sessions: 0 };

const smooth = (reps, rpe = 7) => ({ reps, rpe_actual: rpe, set_feeling: 'smooth' });
const hard   = (reps, rpe = 9) => ({ reps, rpe_actual: rpe, set_feeling: 'hard' });
const missed = (reps, rpe = 10) => ({ reps, rpe_actual: rpe, set_feeling: 'missed' });

// ── Weight increase ───────────────────────────────────────────────────────────

describe('weight increase', () => {
  it('increases weight when all sets hit top, RPE at target, feeling smooth', () => {
    const logs = [smooth(12, 8), smooth(12, 7), smooth(12, 8)];
    const result = evaluateProgression(bench, logs, baseState);
    expect(result.progression).toBe('weight');
    expect(result.next_weight).toBe(140); // +5 compound
    expect(result.next_consecutive_below).toBe(0);
  });

  it('increases weight when RPE is below target (easy session at top)', () => {
    const logs = [smooth(12, 5), smooth(12, 6), smooth(12, 6)];
    const result = evaluateProgression(bench, logs, baseState);
    expect(result.progression).toBe('weight');
    expect(result.next_weight).toBe(140);
  });

  it('applies +2.5 lbs increment for isolation exercises', () => {
    const logs = [smooth(15, 6), smooth(15, 6), smooth(15, 7)];
    const result = evaluateProgression(lateralRaise, logs, { current_weight: 20, consecutive_below_sessions: 0 });
    expect(result.progression).toBe('weight');
    expect(result.next_weight).toBe(22.5);
  });

  it('applies +5 lbs increment for compound exercises', () => {
    expect(WEIGHT_INCREMENTS.compound).toBe(5);
    expect(WEIGHT_INCREMENTS.isolation).toBe(2.5);
  });

  it('resets consecutive_below counter to 0 on weight increase', () => {
    const logs = [smooth(12, 8), smooth(12, 7), smooth(12, 8)];
    const state = { current_weight: 135, consecutive_below_sessions: 1 };
    const result = evaluateProgression(bench, logs, state);
    expect(result.next_consecutive_below).toBe(0);
  });

  it('increases weight for exactly target RPE (boundary: <=)', () => {
    // RPE exactly equal to target_rpe should still trigger weight increase
    const logs = [smooth(12, 8), smooth(12, 8), smooth(12, 8)];
    const result = evaluateProgression(bench, logs, baseState);
    expect(result.progression).toBe('weight');
  });
});

// ── Reps progression (hold weight) ───────────────────────────────────────────

describe('reps progression (hold weight)', () => {
  it('holds weight when all sets hit top but avg RPE exceeds target', () => {
    const logs = [smooth(12, 9), smooth(12, 9), smooth(12, 10)];
    const result = evaluateProgression(bench, logs, baseState);
    expect(result.progression).toBe('reps');
    expect(result.next_weight).toBe(135);
  });

  it('holds weight when all sets hit top but feeling is mostly hard', () => {
    const logs = [hard(12, 8), hard(12, 8), smooth(12, 7)];
    // 2 hard out of 3 → not mostly smooth
    const result = evaluateProgression(bench, logs, baseState);
    expect(result.progression).toBe('reps');
    expect(result.next_weight).toBe(135);
  });

  it('holds weight when all sets hit top with a missed-rep feeling', () => {
    const logs = [smooth(12, 7), smooth(12, 7), missed(12, 10)];
    const result = evaluateProgression(bench, logs, baseState);
    expect(result.progression).toBe('reps');
  });

  it('holds weight when all sets hit top: RPE over target AND hard feeling', () => {
    const logs = [hard(12, 9), hard(12, 10), hard(12, 9)];
    const result = evaluateProgression(bench, logs, baseState);
    expect(result.progression).toBe('reps');
  });

  it('resets consecutive_below counter to 0 on reps progression', () => {
    const logs = [hard(12, 9), hard(12, 10), hard(12, 9)];
    const state = { current_weight: 135, consecutive_below_sessions: 1 };
    const result = evaluateProgression(bench, logs, state);
    expect(result.next_consecutive_below).toBe(0);
  });
});

// ── Hold ─────────────────────────────────────────────────────────────────────

describe('hold', () => {
  it('holds when rep target not reached and RPE is appropriate', () => {
    const logs = [hard(9, 8), hard(8, 9), hard(8, 8)];
    const result = evaluateProgression(bench, logs, baseState);
    expect(result.progression).toBe('hold');
    expect(result.next_weight).toBe(135);
  });

  it('holds when rep target not reached, RPE at target, feeling mostly hard', () => {
    const logs = [hard(10, 8), hard(9, 8), hard(10, 8)];
    const result = evaluateProgression(bench, logs, baseState);
    expect(result.progression).toBe('hold');
  });

  it('holds when exactly at target RPE but not hitting top of range', () => {
    const logs = [smooth(10, 8), smooth(10, 8), smooth(11, 8)];
    const result = evaluateProgression(bench, logs, baseState);
    // avgRpe === target_rpe (8), not strictly below target, so not flag_low
    expect(result.progression).toBe('hold');
  });
});

// ── Flag: weight too low ──────────────────────────────────────────────────────

describe('flag_low', () => {
  it('flags when all sets in range, RPE below target, feeling smooth', () => {
    // rep_min=8, rep_max=12, target_rpe=8
    // All reps between 8 and 11 (didn't hit 12), RPE=5 (below 8), smooth
    const logs = [smooth(10, 5), smooth(11, 5), smooth(10, 5)];
    const result = evaluateProgression(bench, logs, baseState);
    expect(result.progression).toBe('flag_low');
  });

  it('does NOT flag_low when RPE equals target (boundary)', () => {
    const logs = [smooth(10, 8), smooth(11, 8), smooth(10, 8)];
    const result = evaluateProgression(bench, logs, baseState);
    // avgRpe === 8 === target_rpe → flag_low requires avgRpe < target_rpe
    expect(result.progression).not.toBe('flag_low');
  });

  it('does NOT flag_low when feeling is not mostly smooth', () => {
    const logs = [smooth(10, 5), hard(11, 5), hard(10, 5)];
    const result = evaluateProgression(bench, logs, baseState);
    expect(result.progression).not.toBe('flag_low');
  });

  it('does NOT flag_low when any set is below rep_min', () => {
    // belowRange > 0 disqualifies flag_low
    const logs = [smooth(7, 4), smooth(10, 5), smooth(10, 5)];
    const result = evaluateProgression(bench, logs, baseState);
    expect(result.progression).not.toBe('flag_low');
  });
});

// ── Regression detection ──────────────────────────────────────────────────────

describe('flag_regression', () => {
  it('flags regression when 2+ below-range sets occur in 2 consecutive sessions', () => {
    const logs = [missed(5, 10), missed(4, 10), smooth(8, 8)];
    const state = { current_weight: 135, consecutive_below_sessions: 1 };
    const result = evaluateProgression(bench, logs, state);
    expect(result.progression).toBe('flag_regression');
    expect(result.next_consecutive_below).toBe(2);
  });

  it('does NOT flag regression on the first session with below-range sets', () => {
    const logs = [missed(5, 10), missed(4, 10), smooth(8, 8)];
    const result = evaluateProgression(bench, logs, baseState);
    expect(result.progression).not.toBe('flag_regression');
    expect(result.next_consecutive_below).toBe(1);
  });

  it('does NOT flag regression if only one set is below bottom (needs 2+)', () => {
    const logs = [missed(5, 10), smooth(9, 8), smooth(10, 8)];
    const state = { current_weight: 135, consecutive_below_sessions: 1 };
    const result = evaluateProgression(bench, logs, state);
    expect(result.progression).not.toBe('flag_regression');
  });

  it('resets consecutive_below counter when session has no below-range sets', () => {
    const logs = [smooth(12, 8), smooth(12, 7), smooth(12, 8)];
    const state = { current_weight: 135, consecutive_below_sessions: 1 };
    const result = evaluateProgression(bench, logs, state);
    expect(result.next_consecutive_below).toBe(0);
  });

  it('accumulates consecutive_below across sessions correctly', () => {
    const badLogs = [missed(5, 10), missed(4, 10), smooth(8, 8)];
    // Session 1: consecutive_below goes 0 → 1
    const r1 = evaluateProgression(bench, badLogs, { current_weight: 135, consecutive_below_sessions: 0 });
    expect(r1.next_consecutive_below).toBe(1);
    // Session 2: consecutive_below goes 1 → 2 → flag_regression
    const r2 = evaluateProgression(bench, badLogs, { current_weight: 135, consecutive_below_sessions: r1.next_consecutive_below });
    expect(r2.progression).toBe('flag_regression');
  });
});

// ── Guard: invalid input ──────────────────────────────────────────────────────

describe('input validation', () => {
  it('throws when setLogs is empty', () => {
    expect(() => evaluateProgression(bench, [], baseState)).toThrow();
  });

  it('throws when setLogs is null', () => {
    expect(() => evaluateProgression(bench, null, baseState)).toThrow();
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('handles a single-set exercise correctly', () => {
    const singleSet = { ...bench, sets: 1 };
    const logs = [smooth(12, 7)];
    const result = evaluateProgression(singleSet, logs, baseState);
    expect(result.progression).toBe('weight');
  });

  it('holds weight when any set is hard, even with good RPE', () => {
    // hasHardOrMissed=true blocks weight increase regardless of RPE
    const twoSets = { ...bench, sets: 2 };
    const logs = [smooth(12, 7), hard(12, 7)];
    const result = evaluateProgression(twoSets, logs, baseState);
    expect(result.progression).toBe('reps'); // all at top but hard feeling present
  });

  it('uses compound increment as fallback for unknown increment_type', () => {
    const unknownType = { ...bench, increment_type: 'unknown' };
    const logs = [smooth(12, 8), smooth(12, 7), smooth(12, 8)];
    const result = evaluateProgression(unknownType, logs, baseState);
    expect(result.next_weight).toBe(135 + WEIGHT_INCREMENTS.compound);
  });
});
