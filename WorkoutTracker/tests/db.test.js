/**
 * db.test.js
 *
 * Uses fake-indexeddb to run Dexie in Node without a real browser.
 * Each test suite gets a fresh DB instance to avoid cross-test contamination.
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/js/db.js';
import {
  saveGym, getGym,
  saveCoach, getCoachByEmail,
  saveProgram, getProgramByGym,
  saveSession, getSessionsByProgram, getSessionByTypeAndVariant,
  saveExercise, getExercisesBySession, deleteExercise,
  saveSubstitution, getSubstitutions,
  saveTrainee, getTraineeByEmail, getTraineesByGym, updateTraineeCycleDay,
  getExerciseState, upsertExerciseState, getFlaggedStates,
  createWorkoutLog, completeWorkoutLog, getWorkoutLogs,
  saveSetLog, getSetLogs, getSetLogHistory,
} from '../src/js/db.js';

// Reset the database before each test to ensure isolation
beforeEach(async () => {
  await db.delete();
  await db.open();
});

// ── Gym ───────────────────────────────────────────────────────────────────────

describe('Gym', () => {
  it('saves and retrieves a gym', async () => {
    const id = await saveGym({ name: 'Iron Temple' });
    const gym = await getGym(id);
    expect(gym.name).toBe('Iron Temple');
  });
});

// ── Coaches ───────────────────────────────────────────────────────────────────

describe('Coaches', () => {
  it('saves and retrieves a coach by email', async () => {
    await saveCoach({ gym_id: 1, name: 'Coach Mike', email: 'mike@gym.com' });
    const coach = await getCoachByEmail('mike@gym.com');
    expect(coach).toBeDefined();
    expect(coach.name).toBe('Coach Mike');
  });

  it('returns undefined for unknown email', async () => {
    const coach = await getCoachByEmail('nobody@gym.com');
    expect(coach).toBeUndefined();
  });
});

// ── Program / Sessions / Exercises ───────────────────────────────────────────

describe('Program', () => {
  it('saves a program and retrieves it by gym', async () => {
    const progId = await saveProgram({ gym_id: 1, name: 'PPL v1', version: 1 });
    const prog = await getProgramByGym(1);
    expect(prog).toBeDefined();
    expect(prog.id).toBe(progId);
    expect(prog.name).toBe('PPL v1');
  });
});

describe('Sessions', () => {
  it('saves multiple sessions and retrieves them by program', async () => {
    const progId = await saveProgram({ gym_id: 1, name: 'PPL v1', version: 1 });
    await saveSession({ program_id: progId, type: 'push', variant: 'A' });
    await saveSession({ program_id: progId, type: 'pull', variant: 'A' });
    await saveSession({ program_id: progId, type: 'legs', variant: 'A' });

    const sessions = await getSessionsByProgram(progId);
    expect(sessions).toHaveLength(3);
  });

  it('retrieves a session by type and variant', async () => {
    const progId = await saveProgram({ gym_id: 1, name: 'PPL v1', version: 1 });
    await saveSession({ program_id: progId, type: 'push', variant: 'A' });

    const session = await getSessionByTypeAndVariant(progId, 'push', 'A');
    expect(session).toBeDefined();
    expect(session.type).toBe('push');
    expect(session.variant).toBe('A');
  });
});

describe('Exercises', () => {
  it('saves exercises and retrieves them sorted by display_order', async () => {
    const sessionId = 1;
    await saveExercise({ session_id: sessionId, name: 'Incline DB Press', sets: 3, rep_min: 8, rep_max: 12, rest_seconds_suggested: 180, target_rpe: 8, increment_type: 'compound', display_order: 2 });
    await saveExercise({ session_id: sessionId, name: 'Bench Press',      sets: 3, rep_min: 8, rep_max: 12, rest_seconds_suggested: 180, target_rpe: 8, increment_type: 'compound', display_order: 1 });

    const exercises = await getExercisesBySession(sessionId);
    expect(exercises).toHaveLength(2);
    expect(exercises[0].name).toBe('Bench Press');       // display_order 1 first
    expect(exercises[1].name).toBe('Incline DB Press');  // display_order 2 second
  });

  it('deletes an exercise and its substitutions', async () => {
    const exId = await saveExercise({ session_id: 1, name: 'Bench Press', sets: 3, rep_min: 8, rep_max: 12, rest_seconds_suggested: 180, target_rpe: 8, increment_type: 'compound', display_order: 1 });
    await saveSubstitution({ exercise_id: exId, name: 'DB Bench Press', notes: '' });

    await deleteExercise(exId);

    const exercises = await getExercisesBySession(1);
    expect(exercises).toHaveLength(0);

    const subs = await getSubstitutions(exId);
    expect(subs).toHaveLength(0);
  });
});

describe('Substitutions', () => {
  it('saves and retrieves substitutions for an exercise', async () => {
    const exId = await saveExercise({ session_id: 1, name: 'OHP', sets: 3, rep_min: 8, rep_max: 12, rest_seconds_suggested: 150, target_rpe: 8, increment_type: 'compound', display_order: 1 });
    await saveSubstitution({ exercise_id: exId, name: 'DB Shoulder Press', notes: 'Use if rack is taken' });
    await saveSubstitution({ exercise_id: exId, name: 'Machine OHP',       notes: 'Shoulder pain alternative' });

    const subs = await getSubstitutions(exId);
    expect(subs).toHaveLength(2);
    expect(subs.map(s => s.name)).toContain('DB Shoulder Press');
  });
});

// ── Trainees ──────────────────────────────────────────────────────────────────

describe('Trainees', () => {
  it('saves and retrieves a trainee by email', async () => {
    await saveTrainee({ gym_id: 1, name: 'Alice', email: 'alice@test.com', cycle_day: 1, cycle_start_session: 'push' });
    const trainee = await getTraineeByEmail('alice@test.com');
    expect(trainee).toBeDefined();
    expect(trainee.name).toBe('Alice');
    expect(trainee.cycle_start_session).toBe('push');
  });

  it('returns undefined for unknown trainee email', async () => {
    const trainee = await getTraineeByEmail('ghost@test.com');
    expect(trainee).toBeUndefined();
  });

  it('retrieves all trainees for a gym', async () => {
    await saveTrainee({ gym_id: 1, name: 'Alice', email: 'alice@test.com', cycle_day: 1, cycle_start_session: 'push' });
    await saveTrainee({ gym_id: 1, name: 'Bob',   email: 'bob@test.com',   cycle_day: 3, cycle_start_session: 'legs' });
    await saveTrainee({ gym_id: 2, name: 'Carol', email: 'carol@test.com', cycle_day: 1, cycle_start_session: 'pull' });

    const gym1Trainees = await getTraineesByGym(1);
    expect(gym1Trainees).toHaveLength(2);
    expect(gym1Trainees.map(t => t.name)).toContain('Alice');
    expect(gym1Trainees.map(t => t.name)).toContain('Bob');
  });

  it('updates cycle day', async () => {
    const id = await saveTrainee({ gym_id: 1, name: 'Alice', email: 'alice@test.com', cycle_day: 1, cycle_start_session: 'push' });
    await updateTraineeCycleDay(id, 5);
    const trainee = await getTraineeByEmail('alice@test.com');
    expect(trainee.cycle_day).toBe(5);
  });
});

// ── Trainee Exercise State ────────────────────────────────────────────────────

describe('TraineeExerciseState', () => {
  it('creates a new exercise state', async () => {
    await upsertExerciseState({
      trainee_id: 1, exercise_id: 10,
      current_weight: 135, consecutive_below_sessions: 0,
      last_progression_type: null, flagged: false,
    });
    const state = await getExerciseState(1, 10);
    expect(state).toBeDefined();
    expect(state.current_weight).toBe(135);
    expect(state.flagged).toBe(false);
  });

  it('upserts (updates) an existing exercise state', async () => {
    await upsertExerciseState({ trainee_id: 1, exercise_id: 10, current_weight: 135, consecutive_below_sessions: 0, last_progression_type: null, flagged: false });
    await upsertExerciseState({ trainee_id: 1, exercise_id: 10, current_weight: 140, consecutive_below_sessions: 0, last_progression_type: 'weight', flagged: false });

    const state = await getExerciseState(1, 10);
    expect(state.current_weight).toBe(140);
    expect(state.last_progression_type).toBe('weight');
  });

  it('returns flagged states for a trainee', async () => {
    await upsertExerciseState({ trainee_id: 1, exercise_id: 10, current_weight: 135, consecutive_below_sessions: 2, last_progression_type: 'flag_regression', flagged: true });
    await upsertExerciseState({ trainee_id: 1, exercise_id: 11, current_weight: 50,  consecutive_below_sessions: 0, last_progression_type: 'hold',             flagged: false });

    const flagged = await getFlaggedStates(1);
    expect(flagged).toHaveLength(1);
    expect(flagged[0].exercise_id).toBe(10);
  });

  it('returns undefined for an exercise state that does not exist', async () => {
    const state = await getExerciseState(999, 999);
    expect(state).toBeUndefined();
  });
});

// ── Workout Logs ──────────────────────────────────────────────────────────────

describe('WorkoutLog', () => {
  it('creates a workout log with completed=false by default', async () => {
    const id = await createWorkoutLog({ trainee_id: 1, session_id: 2, date: '2026-04-14T10:00:00Z' });
    const logs = await getWorkoutLogs(1);
    expect(logs).toHaveLength(1);
    expect(logs[0].completed).toBe(false);
    expect(logs[0].id).toBe(id);
  });

  it('marks a workout log as complete with duration', async () => {
    const id = await createWorkoutLog({ trainee_id: 1, session_id: 2, date: '2026-04-14T10:00:00Z' });
    await completeWorkoutLog(id, 58);

    const logs = await getWorkoutLogs(1);
    expect(logs[0].completed).toBe(true);
    expect(logs[0].duration_minutes).toBe(58);
  });

  it('respects the limit parameter', async () => {
    for (let i = 0; i < 5; i++) {
      await createWorkoutLog({ trainee_id: 1, session_id: i, date: `2026-04-${14 + i}T10:00:00Z` });
    }
    const logs = await getWorkoutLogs(1, 3);
    expect(logs).toHaveLength(3);
  });
});

// ── Set Logs ──────────────────────────────────────────────────────────────────

describe('SetLog', () => {
  it('saves a set log with all fields including RPE and feeling', async () => {
    const logId = await createWorkoutLog({ trainee_id: 1, session_id: 1, date: '2026-04-14T10:00:00Z' });
    await saveSetLog({ workout_log_id: logId, exercise_id: 10, set_number: 1, weight: 135, reps: 10, rpe_actual: 7, set_feeling: 'smooth', substitution_used: false });

    const sets = await getSetLogs(logId);
    expect(sets).toHaveLength(1);
    expect(sets[0].rpe_actual).toBe(7);
    expect(sets[0].set_feeling).toBe('smooth');
    expect(sets[0].substitution_used).toBe(false);
  });

  it('saves multiple sets for a workout log', async () => {
    const logId = await createWorkoutLog({ trainee_id: 1, session_id: 1, date: '2026-04-14T10:00:00Z' });
    await saveSetLog({ workout_log_id: logId, exercise_id: 10, set_number: 1, weight: 135, reps: 10, rpe_actual: 7, set_feeling: 'smooth', substitution_used: false });
    await saveSetLog({ workout_log_id: logId, exercise_id: 10, set_number: 2, weight: 135, reps: 11, rpe_actual: 8, set_feeling: 'smooth', substitution_used: false });
    await saveSetLog({ workout_log_id: logId, exercise_id: 10, set_number: 3, weight: 135, reps: 12, rpe_actual: 8, set_feeling: 'hard',   substitution_used: false });

    const sets = await getSetLogs(logId);
    expect(sets).toHaveLength(3);
  });

  it('tracks substitution usage', async () => {
    const logId = await createWorkoutLog({ trainee_id: 1, session_id: 1, date: '2026-04-14T10:00:00Z' });
    await saveSetLog({ workout_log_id: logId, exercise_id: 10, set_number: 1, weight: 100, reps: 10, rpe_actual: 7, set_feeling: 'smooth', substitution_used: true });

    const sets = await getSetLogs(logId);
    expect(sets[0].substitution_used).toBe(true);
  });

  it('getSetLogHistory returns sets across multiple sessions for one exercise', async () => {
    const log1 = await createWorkoutLog({ trainee_id: 1, session_id: 1, date: '2026-04-07T10:00:00Z' });
    const log2 = await createWorkoutLog({ trainee_id: 1, session_id: 1, date: '2026-04-14T10:00:00Z' });

    await saveSetLog({ workout_log_id: log1, exercise_id: 10, set_number: 1, weight: 130, reps: 12, rpe_actual: 8, set_feeling: 'smooth', substitution_used: false });
    await saveSetLog({ workout_log_id: log2, exercise_id: 10, set_number: 1, weight: 135, reps: 10, rpe_actual: 7, set_feeling: 'smooth', substitution_used: false });
    // Different exercise — should NOT appear
    await saveSetLog({ workout_log_id: log2, exercise_id: 99, set_number: 1, weight: 50,  reps: 15, rpe_actual: 6, set_feeling: 'smooth', substitution_used: false });

    const history = await getSetLogHistory(1, 10);
    expect(history).toHaveLength(2);
    expect(history.every(s => s.exercise_id === 10)).toBe(true);
  });

  it('getSetLogHistory returns empty array when trainee has no logs', async () => {
    const history = await getSetLogHistory(999, 10);
    expect(history).toEqual([]);
  });
});
