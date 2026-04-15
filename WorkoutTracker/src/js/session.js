/**
 * session.js — 8-day cycle management.
 *
 * Pure functions: no side effects, no external dependencies.
 * Handles cycle sequence construction, day tracking, and labels.
 */

// Canonical PPL order. The trainee's chosen starting type determines the offset.
const PPL = ['push', 'pull', 'legs'];

/**
 * Build the trainee's personal 8-day cycle sequence from their chosen start type.
 *
 * The cycle is always: [A, A, A, REST, B, B, B, REST]
 * where A and B are the two rounds of the chosen PPL order.
 *
 * Examples:
 *   startType='push' → Push A, Pull A, Legs A, REST, Push B, Pull B, Legs B, REST
 *   startType='legs' → Legs A, Push A, Pull A, REST, Legs B, Push B, Pull B, REST
 *
 * @param {'push'|'pull'|'legs'} startType
 * @returns {Array<{type: string, variant: 'A'|'B'|'rest'}>}  8 items
 */
export function buildCycleSequence(startType) {
  const startIdx = PPL.indexOf(startType);
  if (startIdx === -1) {
    throw new Error(`Invalid start type "${startType}". Must be one of: ${PPL.join(', ')}`);
  }

  const ordered = [
    PPL[startIdx % 3],
    PPL[(startIdx + 1) % 3],
    PPL[(startIdx + 2) % 3],
  ];

  return [
    { type: ordered[0], variant: 'A' },
    { type: ordered[1], variant: 'A' },
    { type: ordered[2], variant: 'A' },
    { type: 'rest',     variant: 'rest' },
    { type: ordered[0], variant: 'B' },
    { type: ordered[1], variant: 'B' },
    { type: ordered[2], variant: 'B' },
    { type: 'rest',     variant: 'rest' },
  ];
}

/**
 * Return today's session entry from the trainee's cycle.
 *
 * @param {number} cycleDay   1–8 (1-indexed)
 * @param {Array}  sequence   Result of buildCycleSequence
 * @returns {{ type: string, variant: string }}
 */
export function getTodaySession(cycleDay, sequence) {
  if (!Number.isInteger(cycleDay) || cycleDay < 1 || cycleDay > 8) {
    throw new Error(`Invalid cycle day "${cycleDay}". Must be an integer 1–8.`);
  }
  return sequence[cycleDay - 1];
}

/**
 * Advance to the next cycle day. Wraps from 8 back to 1.
 *
 * @param {number} cycleDay
 * @returns {number}
 */
export function nextCycleDay(cycleDay) {
  return (cycleDay % 8) + 1;
}

/**
 * Return a human-readable label for a session entry.
 *
 * @param {{ type: string, variant: string }} session
 * @returns {string}  e.g. 'Push A', 'Legs B', 'Rest Day'
 */
export function getSessionLabel(session) {
  if (session.type === 'rest') return 'Rest Day';
  return `${capitalize(session.type)} ${session.variant}`;
}

/**
 * Return a short focus description used as a subtitle on session cards.
 * Follows the PRD's naming convention.
 *
 * @param {{ type: string, variant: string }} session
 * @returns {string}
 */
export function getSessionFocus(session) {
  const focuses = {
    push_A: 'Chest Focus',
    push_B: 'Shoulder Focus',
    pull_A: 'Vertical Pull Focus',
    pull_B: 'Horizontal Pull Focus',
    legs_A: 'Squat Pattern Focus',
    legs_B: 'Hip Hinge Focus',
  };
  const key = `${session.type}_${session.variant}`;
  return focuses[key] ?? '';
}

/**
 * Return all training days (non-rest) in the sequence with their cycle positions.
 * Useful for building UI lists of upcoming sessions.
 *
 * @param {Array} sequence  Result of buildCycleSequence
 * @returns {Array<{ cycleDay: number, session: Object }>}
 */
export function getTrainingDays(sequence) {
  return sequence
    .map((session, i) => ({ cycleDay: i + 1, session }))
    .filter(({ session }) => session.type !== 'rest');
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
