/**
 * Personal Records (PR) Tracker Service
 * Detects and stores new personal records for exercises.
 */

/**
 * Calculate estimated 1RM using the Epley formula.
 * @param {number} weight
 * @param {number} reps
 * @returns {number}
 */
function calculateE1RM(weight, reps) {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

/**
 * Check if the completed set establishes any new personal records.
 * @param {import('better-sqlite3').Database} db
 * @param {number} exerciseId
 * @param {string} setType
 * @param {number} weight
 * @param {number} reps
 * @param {number} sessionId
 * @returns {{ isPR: boolean, types: string[], details: Array<{ type: string, value: number, previous: number|null }> }}
 */
export function checkForPR(db, exerciseId, setType, weight, reps, sessionId) {
  const result = { isPR: false, types: [], details: [] };

  // Skip warmup sets
  if (setType === 'warmup') return result;

  // Skip if weight or reps are not positive
  if (!weight || weight <= 0 || !reps || reps <= 0) return result;

  const e1rm = calculateE1RM(weight, reps);

  // Get existing PRs for this exercise
  const existingPRs = db.prepare(`
    SELECT record_type, weight, reps, estimated_1rm
    FROM personal_records
    WHERE exercise_id = ?
    ORDER BY achieved_at DESC
  `).all(exerciseId);

  // Check max_weight PR
  const maxWeightPR = existingPRs
    .filter(pr => pr.record_type === 'max_weight')
    .reduce((max, pr) => Math.max(max, pr.weight || 0), 0);

  if (weight > maxWeightPR) {
    result.isPR = true;
    result.types.push('max_weight');
    result.details.push({
      type: 'max_weight',
      value: weight,
      previous: maxWeightPR || null
    });
    db.prepare(`
      INSERT INTO personal_records (exercise_id, record_type, set_type, weight, reps, estimated_1rm, session_id)
      VALUES (?, 'max_weight', ?, ?, ?, ?, ?)
    `).run(exerciseId, setType, weight, reps, e1rm, sessionId);
  }

  // Check max_reps_at_weight PR
  const maxRepsAtWeight = existingPRs
    .filter(pr => pr.record_type === 'max_reps_at_weight' && pr.weight === weight)
    .reduce((max, pr) => Math.max(max, pr.reps || 0), 0);

  if (reps > maxRepsAtWeight) {
    result.isPR = true;
    result.types.push('max_reps_at_weight');
    result.details.push({
      type: 'max_reps_at_weight',
      value: reps,
      previous: maxRepsAtWeight || null
    });
    db.prepare(`
      INSERT INTO personal_records (exercise_id, record_type, set_type, weight, reps, estimated_1rm, session_id)
      VALUES (?, 'max_reps_at_weight', ?, ?, ?, ?, ?)
    `).run(exerciseId, setType, weight, reps, e1rm, sessionId);
  }

  // Check best_e1rm PR
  const bestE1RM = existingPRs
    .filter(pr => pr.record_type === 'best_e1rm')
    .reduce((max, pr) => Math.max(max, pr.estimated_1rm || 0), 0);

  if (e1rm > bestE1RM) {
    result.isPR = true;
    result.types.push('best_e1rm');
    result.details.push({
      type: 'best_e1rm',
      value: Math.round(e1rm * 10) / 10,
      previous: bestE1RM ? Math.round(bestE1RM * 10) / 10 : null
    });
    db.prepare(`
      INSERT INTO personal_records (exercise_id, record_type, set_type, weight, reps, estimated_1rm, session_id)
      VALUES (?, 'best_e1rm', ?, ?, ?, ?, ?)
    `).run(exerciseId, setType, weight, reps, e1rm, sessionId);
  }

  return result;
}

/**
 * Get all personal records for a given exercise.
 * @param {import('better-sqlite3').Database} db
 * @param {number} exerciseId
 * @returns {Array}
 */
export function getExercisePRs(db, exerciseId) {
  const prs = db.prepare(`
    SELECT pr.*, e.name as exercise_name
    FROM personal_records pr
    LEFT JOIN exercises e ON pr.exercise_id = e.id
    WHERE pr.exercise_id = ?
    ORDER BY pr.record_type, pr.achieved_at DESC
  `).all(exerciseId);

  return prs;
}
