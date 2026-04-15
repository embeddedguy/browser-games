import { describe, it, expect } from 'vitest';
import {
  buildCycleSequence,
  getTodaySession,
  nextCycleDay,
  getSessionLabel,
  getSessionFocus,
  getTrainingDays,
} from '../src/js/session.js';

// ── buildCycleSequence ────────────────────────────────────────────────────────

describe('buildCycleSequence', () => {
  it('returns an array of exactly 8 entries', () => {
    expect(buildCycleSequence('push')).toHaveLength(8);
    expect(buildCycleSequence('pull')).toHaveLength(8);
    expect(buildCycleSequence('legs')).toHaveLength(8);
  });

  it('builds correct sequence starting with push', () => {
    const seq = buildCycleSequence('push');
    expect(seq).toEqual([
      { type: 'push', variant: 'A' },
      { type: 'pull', variant: 'A' },
      { type: 'legs', variant: 'A' },
      { type: 'rest', variant: 'rest' },
      { type: 'push', variant: 'B' },
      { type: 'pull', variant: 'B' },
      { type: 'legs', variant: 'B' },
      { type: 'rest', variant: 'rest' },
    ]);
  });

  it('builds correct sequence starting with pull', () => {
    const seq = buildCycleSequence('pull');
    expect(seq[0]).toEqual({ type: 'pull', variant: 'A' });
    expect(seq[1]).toEqual({ type: 'legs', variant: 'A' });
    expect(seq[2]).toEqual({ type: 'push', variant: 'A' });
    expect(seq[4]).toEqual({ type: 'pull', variant: 'B' });
    expect(seq[5]).toEqual({ type: 'legs', variant: 'B' });
    expect(seq[6]).toEqual({ type: 'push', variant: 'B' });
  });

  it('builds correct sequence starting with legs', () => {
    const seq = buildCycleSequence('legs');
    expect(seq[0]).toEqual({ type: 'legs', variant: 'A' });
    expect(seq[1]).toEqual({ type: 'push', variant: 'A' });
    expect(seq[2]).toEqual({ type: 'pull', variant: 'A' });
    expect(seq[4]).toEqual({ type: 'legs', variant: 'B' });
    expect(seq[5]).toEqual({ type: 'push', variant: 'B' });
    expect(seq[6]).toEqual({ type: 'pull', variant: 'B' });
  });

  it('always places rest at positions 4 and 8 (1-indexed) for all start types', () => {
    for (const start of ['push', 'pull', 'legs']) {
      const seq = buildCycleSequence(start);
      expect(seq[3].type).toBe('rest'); // position 4
      expect(seq[7].type).toBe('rest'); // position 8
    }
  });

  it('A and B rounds contain the same session types in the same order', () => {
    for (const start of ['push', 'pull', 'legs']) {
      const seq = buildCycleSequence(start);
      const roundA = seq.slice(0, 3);
      const roundB = seq.slice(4, 7);
      roundA.forEach((s, i) => {
        expect(roundB[i].type).toBe(s.type);
        expect(roundB[i].variant).toBe('B');
      });
    }
  });

  it('throws on an invalid start type', () => {
    expect(() => buildCycleSequence('chest')).toThrow();
    expect(() => buildCycleSequence('')).toThrow();
    expect(() => buildCycleSequence(null)).toThrow();
  });

  it('each of push/pull/legs appears exactly twice (once A, once B)', () => {
    const seq = buildCycleSequence('push');
    const training = seq.filter(s => s.type !== 'rest');
    for (const type of ['push', 'pull', 'legs']) {
      const matches = training.filter(s => s.type === type);
      expect(matches).toHaveLength(2);
      expect(matches[0].variant).toBe('A');
      expect(matches[1].variant).toBe('B');
    }
  });
});

// ── getTodaySession ───────────────────────────────────────────────────────────

describe('getTodaySession', () => {
  const seq = buildCycleSequence('push');

  it('returns the correct session for day 1', () => {
    expect(getTodaySession(1, seq)).toEqual({ type: 'push', variant: 'A' });
  });

  it('returns rest for day 4', () => {
    expect(getTodaySession(4, seq)).toEqual({ type: 'rest', variant: 'rest' });
  });

  it('returns the correct session for day 5 (Push B)', () => {
    expect(getTodaySession(5, seq)).toEqual({ type: 'push', variant: 'B' });
  });

  it('returns rest for day 8', () => {
    expect(getTodaySession(8, seq)).toEqual({ type: 'rest', variant: 'rest' });
  });

  it('returns correct session for every day 1–8 without error', () => {
    for (let day = 1; day <= 8; day++) {
      expect(() => getTodaySession(day, seq)).not.toThrow();
    }
  });

  it('throws on cycle day 0', () => {
    expect(() => getTodaySession(0, seq)).toThrow();
  });

  it('throws on cycle day 9', () => {
    expect(() => getTodaySession(9, seq)).toThrow();
  });

  it('throws on non-integer cycle day', () => {
    expect(() => getTodaySession(1.5, seq)).toThrow();
  });
});

// ── nextCycleDay ──────────────────────────────────────────────────────────────

describe('nextCycleDay', () => {
  it('increments from day 1 to 2', () => {
    expect(nextCycleDay(1)).toBe(2);
  });

  it('increments from day 7 to 8', () => {
    expect(nextCycleDay(7)).toBe(8);
  });

  it('wraps from day 8 back to 1', () => {
    expect(nextCycleDay(8)).toBe(1);
  });

  it('full cycle: 1 → 2 → ... → 8 → 1 loops correctly', () => {
    let day = 1;
    for (let i = 0; i < 8; i++) day = nextCycleDay(day);
    expect(day).toBe(1); // back to start after full cycle
  });
});

// ── getSessionLabel ───────────────────────────────────────────────────────────

describe('getSessionLabel', () => {
  it('returns formatted label for Push A', () => {
    expect(getSessionLabel({ type: 'push', variant: 'A' })).toBe('Push A');
  });

  it('returns formatted label for Legs B', () => {
    expect(getSessionLabel({ type: 'legs', variant: 'B' })).toBe('Legs B');
  });

  it('returns formatted label for Pull A', () => {
    expect(getSessionLabel({ type: 'pull', variant: 'A' })).toBe('Pull A');
  });

  it('returns "Rest Day" for rest sessions', () => {
    expect(getSessionLabel({ type: 'rest', variant: 'rest' })).toBe('Rest Day');
  });
});

// ── getSessionFocus ───────────────────────────────────────────────────────────

describe('getSessionFocus', () => {
  it('returns "Chest Focus" for Push A', () => {
    expect(getSessionFocus({ type: 'push', variant: 'A' })).toBe('Chest Focus');
  });

  it('returns "Shoulder Focus" for Push B', () => {
    expect(getSessionFocus({ type: 'push', variant: 'B' })).toBe('Shoulder Focus');
  });

  it('returns "Hip Hinge Focus" for Legs B', () => {
    expect(getSessionFocus({ type: 'legs', variant: 'B' })).toBe('Hip Hinge Focus');
  });

  it('returns "Squat Pattern Focus" for Legs A', () => {
    expect(getSessionFocus({ type: 'legs', variant: 'A' })).toBe('Squat Pattern Focus');
  });
});

// ── getTrainingDays ───────────────────────────────────────────────────────────

describe('getTrainingDays', () => {
  it('returns 6 training days (excludes 2 rest days)', () => {
    const seq = buildCycleSequence('push');
    const training = getTrainingDays(seq);
    expect(training).toHaveLength(6);
  });

  it('contains no rest entries', () => {
    const seq = buildCycleSequence('push');
    const training = getTrainingDays(seq);
    expect(training.every(d => d.session.type !== 'rest')).toBe(true);
  });

  it('cycle days are 1-indexed and correct', () => {
    const seq = buildCycleSequence('push');
    const training = getTrainingDays(seq);
    const days = training.map(d => d.cycleDay);
    expect(days).toEqual([1, 2, 3, 5, 6, 7]);
  });
});
