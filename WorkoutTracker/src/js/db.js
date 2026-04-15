/**
 * db.js — Local-first database layer using Dexie (IndexedDB wrapper).
 *
 * All reads and writes go here first. The sync layer (sync.js) pushes
 * changes to Firestore when connectivity is available.
 */

import Dexie from 'dexie';

// ── Schema ───────────────────────────────────────────────────────────────────

export const db = new Dexie('WorkoutTracker');

db.version(1).stores({
  // Gym & program setup
  gyms:                  '++id, name',
  coaches:               '++id, gym_id, &email',
  programs:              '++id, gym_id',
  sessions:              '++id, program_id, type, variant',
  exercises:             '++id, session_id, display_order',
  substitutions:         '++id, exercise_id',

  // Trainees
  trainees:              '++id, gym_id, &email',

  // Per-trainee exercise state (working weight, progression tracking)
  // Compound primary key: [trainee_id, exercise_id]
  traineeExerciseStates: '[trainee_id+exercise_id], trainee_id, flagged',

  // Workout history
  workoutLogs:           '++id, trainee_id, session_id, date',
  setLogs:               '++id, workout_log_id, exercise_id',
});

// ── Gym ──────────────────────────────────────────────────────────────────────

export async function saveGym(data) {
  return db.gyms.put(data);
}

export async function getGym(id) {
  return db.gyms.get(id);
}

// ── Coaches ──────────────────────────────────────────────────────────────────

export async function saveCoach(data) {
  return db.coaches.put(data);
}

export async function getCoachByEmail(email) {
  return db.coaches.where('email').equals(email).first();
}

// ── Program ──────────────────────────────────────────────────────────────────

export async function saveProgram(data) {
  return db.programs.put(data);
}

export async function getProgramByGym(gymId) {
  return db.programs.where('gym_id').equals(gymId).first();
}

// ── Sessions (Push A/B, Pull A/B, Legs A/B) ──────────────────────────────────

export async function saveSession(data) {
  return db.sessions.put(data);
}

export async function getSessionsByProgram(programId) {
  return db.sessions.where('program_id').equals(programId).toArray();
}

export async function getSessionByTypeAndVariant(programId, type, variant) {
  return db.sessions
    .where('program_id').equals(programId)
    .and(s => s.type === type && s.variant === variant)
    .first();
}

// ── Exercises ─────────────────────────────────────────────────────────────────

export async function saveExercise(data) {
  return db.exercises.put(data);
}

export async function getExercisesBySession(sessionId) {
  return db.exercises
    .where('session_id').equals(sessionId)
    .sortBy('display_order');
}

export async function deleteExercise(id) {
  await db.substitutions.where('exercise_id').equals(id).delete();
  return db.exercises.delete(id);
}

// ── Substitutions ─────────────────────────────────────────────────────────────

export async function saveSubstitution(data) {
  return db.substitutions.put(data);
}

export async function getSubstitutions(exerciseId) {
  return db.substitutions.where('exercise_id').equals(exerciseId).toArray();
}

export async function deleteSubstitution(id) {
  return db.substitutions.delete(id);
}

// ── Trainees ──────────────────────────────────────────────────────────────────

export async function saveTrainee(data) {
  return db.trainees.put(data);
}

export async function getTraineeByEmail(email) {
  return db.trainees.where('email').equals(email).first();
}

export async function getTraineesByGym(gymId) {
  return db.trainees.where('gym_id').equals(gymId).toArray();
}

export async function updateTraineeCycleDay(traineeId, cycleDay) {
  return db.trainees.update(traineeId, { cycle_day: cycleDay });
}

// ── Trainee Exercise State ────────────────────────────────────────────────────

export async function getExerciseState(traineeId, exerciseId) {
  return db.traineeExerciseStates.get([traineeId, exerciseId]);
}

export async function upsertExerciseState(data) {
  // data must include trainee_id and exercise_id
  return db.traineeExerciseStates.put(data);
}

export async function getFlaggedStates(traineeId) {
  return db.traineeExerciseStates
    .where('trainee_id').equals(traineeId)
    .and(s => s.flagged === true)
    .toArray();
}

// ── Workout Logs ──────────────────────────────────────────────────────────────

export async function createWorkoutLog(data) {
  return db.workoutLogs.add({
    completed: false,
    duration_minutes: null,
    ...data,
  });
}

export async function completeWorkoutLog(logId, durationMinutes) {
  return db.workoutLogs.update(logId, {
    completed: true,
    duration_minutes: durationMinutes,
  });
}

/**
 * @param {number} traineeId
 * @param {number} [limit=20]
 * @returns {Promise<Array>}  Most recent logs first
 */
export async function getWorkoutLogs(traineeId, limit = 20) {
  const logs = await db.workoutLogs
    .where('trainee_id').equals(traineeId)
    .reverse()
    .limit(limit)
    .toArray();
  return logs;
}

export async function getWorkoutLogsBySession(traineeId, sessionId, limit = 10) {
  const logs = await db.workoutLogs
    .where('trainee_id').equals(traineeId)
    .and(l => l.session_id === sessionId)
    .reverse()
    .limit(limit)
    .toArray();
  return logs;
}

// ── Set Logs ──────────────────────────────────────────────────────────────────

export async function saveSetLog(data) {
  return db.setLogs.put(data);
}

export async function getSetLogs(workoutLogId) {
  return db.setLogs
    .where('workout_log_id').equals(workoutLogId)
    .toArray();
}

/**
 * Return the set logs for a specific exercise across all of a trainee's sessions.
 * Used for progress charts and progression history.
 *
 * @param {number} traineeId
 * @param {number} exerciseId
 * @param {number} [limit=50]
 * @returns {Promise<Array>}
 */
export async function getSetLogHistory(traineeId, exerciseId, limit = 50) {
  // Get all workout log IDs for this trainee
  const logIds = await db.workoutLogs
    .where('trainee_id').equals(traineeId)
    .primaryKeys();

  if (logIds.length === 0) return [];

  const sets = await db.setLogs
    .where('workout_log_id').anyOf(logIds)
    .and(s => s.exercise_id === exerciseId)
    .reverse()
    .limit(limit)
    .toArray();

  return sets;
}
