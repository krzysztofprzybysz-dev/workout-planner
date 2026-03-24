import { Router } from 'express';
import { calculateProgression } from '../services/progression.js';
import { EXERCISE_SET_CONFIG } from '../config/exerciseConfig.js';
import logger from '../services/logger.js';

const router = Router();

// Program configuration
const PROGRAM_WEEKS = parseInt(process.env.PROGRAM_WEEKS) || 8;

// Exercises that appear on multiple days
const REPEATING_EXERCISES = {
  1: [1, 3],     // Leg Press: D1 and D3
  7: [1, 2, 3],  // Machine Crunch: D1, D2 and D3
};

/**
 * Filter recommendations to only include set types that exercise actually has on this day
 */
function filterRecommendationsBySetConfig(recommendations, day) {
  const filtered = {};

  for (const [exerciseName, rec] of Object.entries(recommendations)) {
    const configKey = `${exerciseName}_${day}`;
    const allowedTypes = EXERCISE_SET_CONFIG[configKey];

    if (!allowedTypes) {
      filtered[exerciseName] = rec;
      continue;
    }

    const filteredRec = { ...rec };
    let removed = [];

    if (!allowedTypes.includes('heavy') && filteredRec.heavy_weight != null) {
      removed.push(`heavy_weight=${filteredRec.heavy_weight}`);
      delete filteredRec.heavy_weight;
    }
    if (!allowedTypes.includes('backoff') && filteredRec.backoff_weight != null) {
      removed.push(`backoff_weight=${filteredRec.backoff_weight}`);
      delete filteredRec.backoff_weight;
    }
    if (!allowedTypes.includes('dropset') && filteredRec.dropset_weight != null) {
      removed.push(`dropset_weight=${filteredRec.dropset_weight}`);
      delete filteredRec.dropset_weight;
    }

    if (removed.length > 0) {
      logger.warn('FILTER', `Removed invalid set types for ${exerciseName} D${day}: ${removed.join(', ')}`);
      filteredRec.reason = (filteredRec.reason || '') + ` [Filtered: ${removed.join(', ')} - not valid for D${day}]`;
    }

    filtered[exerciseName] = filteredRec;
  }

  return filtered;
}

/**
 * Get other days in the week where this exercise appears
 */
function getOtherDaysForExercise(exerciseId, currentDay) {
  const days = REPEATING_EXERCISES[exerciseId];
  if (!days) return [];
  return days.filter(d => d !== currentDay);
}

// Analyze completed workout and generate progression
router.post('/workout/:sessionId', async (req, res) => {
  const db = req.db;
  const { sessionId } = req.params;

  logger.info('ANALYSIS', `Starting analysis for session #${sessionId}`);

  try {
    const session = db.prepare(`
      SELECT * FROM workout_sessions WHERE id = ?
    `).get(sessionId);

    if (!session) {
      logger.warn('ANALYSIS', `Session #${sessionId} not found`);
      return res.status(404).json({ error: 'Session not found' });
    }

    logger.debug('ANALYSIS', `Session #${sessionId}: W${session.week}D${session.day}`);

    const setLogs = db.prepare(`
      SELECT sl.*, e.name as exercise_name, e.muscle_group
      FROM set_logs sl
      JOIN exercises e ON sl.exercise_id = e.id
      WHERE sl.session_id = ?
      ORDER BY e.id, sl.set_number
    `).all(sessionId);

    const previousData = db.prepare(`
      SELECT
        sl.exercise_id,
        e.name as exercise_name,
        sl.set_type,
        sl.actual_weight,
        sl.actual_reps,
        sl.rpe,
        ws.week,
        ws.finished_at
      FROM set_logs sl
      JOIN workout_sessions ws ON sl.session_id = ws.id
      JOIN exercises e ON sl.exercise_id = e.id
      WHERE ws.day = ?
        AND ws.id != ?
        AND ws.finished_at IS NOT NULL
      ORDER BY ws.finished_at DESC
      LIMIT 50
    `).all(session.day, sessionId);

    // Calculate progression using rule-based algorithm
    const analysis = calculateProgression({
      session,
      setLogs,
      previousData
    });

    // Filter recommendations to only include valid set types for this day
    if (analysis.nextWorkout) {
      analysis.nextWorkout = filterRecommendationsBySetConfig(analysis.nextWorkout, session.day);
    }

    // Prepare statements for progression saving
    const updateAnalysis = db.prepare(`
      UPDATE workout_sessions SET ai_analysis = ? WHERE id = ?
    `);
    const deleteProgression = db.prepare(`
      DELETE FROM progression WHERE exercise_id = ? AND week = ? AND day = ?
    `);
    const insertProgression = db.prepare(`
      INSERT INTO progression (exercise_id, week, day, set_type, calculated_weight, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    const saveProgressionWeights = (exerciseId, week, day, weights, reason) => {
      deleteProgression.run(exerciseId, week, day);
      if (weights.heavy != null) {
        insertProgression.run(exerciseId, week, day, 'heavy', weights.heavy, reason);
      }
      if (weights.backoff != null) {
        insertProgression.run(exerciseId, week, day, 'backoff', weights.backoff, reason);
      }
      if (weights.working != null) {
        insertProgression.run(exerciseId, week, day, 'working', weights.working, reason);
      }
      if (weights.dropset != null) {
        insertProgression.run(exerciseId, week, day, 'dropset', weights.dropset, reason);
      }
    };

    // ATOMIC: Save analysis + all progressions in single transaction
    const saveResultsAtomic = db.transaction(() => {
      updateAnalysis.run(JSON.stringify(analysis), sessionId);

      if (analysis.nextWorkout) {
        const nextWeek = session.week < PROGRAM_WEEKS ? session.week + 1 : 1;
        const nextDay = session.day;

        for (const [exerciseName, recommendation] of Object.entries(analysis.nextWorkout)) {
          const exercise = db.prepare(`
            SELECT id FROM exercises WHERE name = ?
          `).get(exerciseName);

          if (exercise) {
            const hasAnyValue = recommendation.heavy_weight != null ||
                               recommendation.backoff_weight != null ||
                               recommendation.working_weight != null ||
                               recommendation.dropset_weight != null;

            if (hasAnyValue) {
              const weights = {
                heavy: recommendation.heavy_weight,
                backoff: recommendation.backoff_weight,
                working: recommendation.working_weight,
                dropset: recommendation.dropset_weight
              };
              saveProgressionWeights(exercise.id, nextWeek, nextDay, weights, recommendation.reason);
              logger.progression.saved(exerciseName, nextWeek, nextDay, weights);

              // For repeating exercises: also save for other days in THIS week
              const otherDays = getOtherDaysForExercise(exercise.id, session.day);
              for (const otherDay of otherDays) {
                const otherDayDone = db.prepare(`
                  SELECT id FROM workout_sessions
                  WHERE week = ? AND day = ? AND finished_at IS NOT NULL
                `).get(session.week, otherDay);

                if (!otherDayDone) {
                  const configKey = `${exerciseName}_${otherDay}`;
                  const allowedTypes = EXERCISE_SET_CONFIG[configKey] || ['working'];
                  const filteredWeights = {
                    heavy: allowedTypes.includes('heavy') ? weights.heavy : null,
                    backoff: allowedTypes.includes('backoff') ? weights.backoff : null,
                    working: allowedTypes.includes('working') ? weights.working : null,
                    dropset: allowedTypes.includes('dropset') ? weights.dropset : null
                  };

                  const sameWeekReason = recommendation.reason + ' [Same-week update from D' + session.day + ']';
                  saveProgressionWeights(exercise.id, session.week, otherDay, filteredWeights, sameWeekReason);
                  logger.info('PROGRESSION', `Same-week: ${exerciseName} W${session.week}D${otherDay} (from D${session.day})`, filteredWeights);
                }
              }
            } else {
              logger.progression.noData(exerciseName, nextWeek, nextDay);
            }
          } else {
            logger.progression.notFound(exerciseName);
          }
        }
      }
    });

    saveResultsAtomic();
    logger.info('ANALYSIS', `Analysis saved for session #${sessionId}`);

    res.json({
      success: true,
      analysis
    });

  } catch (error) {
    logger.error('ANALYSIS', `Analysis failed for session #${sessionId}`, error);
    res.status(500).json({
      error: 'Analysis failed',
      message: error.message
    });
  }
});

// Get analysis for a session
router.get('/workout/:sessionId', (req, res) => {
  const db = req.db;
  const { sessionId } = req.params;

  const session = db.prepare(`
    SELECT ai_analysis FROM workout_sessions WHERE id = ?
  `).get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (!session.ai_analysis) {
    return res.json({ analysis: null });
  }

  res.json({ analysis: JSON.parse(session.ai_analysis) });
});

export default router;
