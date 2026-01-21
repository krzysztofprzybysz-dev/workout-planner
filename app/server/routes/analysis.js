import { Router } from 'express';
import { analyzeWorkout, analyzeWeek, EXERCISE_SET_CONFIG } from '../services/claude.js';
import logger from '../services/logger.js';

const router = Router();

// Program configuration
const PROGRAM_WEEKS = parseInt(process.env.PROGRAM_WEEKS) || 8;

// Ćwiczenia powtarzające się w różnych dniach tygodnia
// exercise_id -> [day1, day2, ...]
const REPEATING_EXERCISES = {
  1: [1, 3],     // Leg Press: D1 i D3
  7: [1, 2, 3],  // Machine Crunch: D1, D2 i D3
};

/**
 * Filter AI recommendations to only include set types that exercise actually has
 * This prevents AI from recommending heavy_weight for D3 Leg Press (which only has working sets)
 * @param {Object} recommendations - AI recommendations object
 * @param {number} day - Day number (1, 2, or 3)
 * @returns {Object} Filtered recommendations
 */
function filterRecommendationsBySetConfig(recommendations, day) {
  const filtered = {};

  for (const [exerciseName, rec] of Object.entries(recommendations)) {
    const configKey = `${exerciseName}_${day}`;
    const allowedTypes = EXERCISE_SET_CONFIG[configKey];

    // If we don't have config for this exercise, keep all recommendations
    if (!allowedTypes) {
      filtered[exerciseName] = rec;
      continue;
    }

    const filteredRec = { ...rec };
    let removed = [];

    // Remove recommendations for set types that this exercise doesn't have
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
      logger.warn('FILTER', `AI hallucination: ${exerciseName} D${day} - removed invalid set types: ${removed.join(', ')}`);
      filteredRec.reason = (filteredRec.reason || '') + ` [Filtered: ${removed.join(', ')} - not valid for D${day}]`;
    }

    filtered[exerciseName] = filteredRec;
  }

  return filtered;
}

/**
 * Get other days in the week where this exercise appears
 * @param {number} exerciseId - Exercise ID
 * @param {number} currentDay - Current workout day (1, 2, or 3)
 * @returns {number[]} Array of other days where this exercise appears
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
    // Get session data
    const session = db.prepare(`
      SELECT * FROM workout_sessions WHERE id = ?
    `).get(sessionId);

    if (!session) {
      logger.warn('ANALYSIS', `Session #${sessionId} not found`);
      return res.status(404).json({ error: 'Session not found' });
    }

    logger.debug('ANALYSIS', `Session #${sessionId}: W${session.week}D${session.day}`);

    // Get all set logs for this session
    const setLogs = db.prepare(`
      SELECT sl.*, e.name as exercise_name, e.muscle_group
      FROM set_logs sl
      JOIN exercises e ON sl.exercise_id = e.id
      WHERE sl.session_id = ?
      ORDER BY e.id, sl.set_number
    `).all(sessionId);

    // Get previous workout data for comparison (with exercise names)
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

    // Get session notes if any
    const sessionNotes = session.overall_notes || null;

    // Call Claude API for analysis
    const analysis = await analyzeWorkout({
      session,
      setLogs,
      previousData,
      sessionNotes
    });

    // Filter recommendations to only include valid set types for this day's exercises
    if (analysis.nextWorkout) {
      analysis.nextWorkout = filterRecommendationsBySetConfig(analysis.nextWorkout, session.day);
    }

    // Prepare statements for progression saving (defined once, used by both daily and weekly analysis)
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

    // Helper to save progression weights
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

    // ATOMIC: Save daily analysis + all progressions in single transaction
    const saveDailyResultsAtomic = db.transaction(() => {
      // Save analysis to session
      updateAnalysis.run(JSON.stringify(analysis), sessionId);

    // Save progression recommendations from daily analysis
    if (analysis.nextWorkout) {
      // Calculate next workout's week
      // Progression is ALWAYS for the next week's same day
      // E.g., Week 1 Day 1 -> progression for Week 2 Day 1
      const nextWeek = session.week < PROGRAM_WEEKS ? session.week + 1 : 1;
      const nextDay = session.day;

      for (const [exerciseName, recommendation] of Object.entries(analysis.nextWorkout)) {
        // Find exercise ID
        const exercise = db.prepare(`
          SELECT id FROM exercises WHERE name = ?
        `).get(exerciseName);

        if (exercise) {
          logger.debug('PROGRESSION', `Daily: ${exerciseName} W${nextWeek}D${nextDay}`, {
            heavy: recommendation.heavy_weight,
            backoff: recommendation.backoff_weight,
            working: recommendation.working_weight,
            dropset: recommendation.dropset_weight
          });

          // Check if we have any values to save
          const hasAnyValue = recommendation.heavy_weight != null ||
                             recommendation.backoff_weight != null ||
                             recommendation.working_weight != null ||
                             recommendation.dropset_weight != null;

          if (hasAnyValue) {
            // Use atomic transaction to save all progressions
            const weights = {
              heavy: recommendation.heavy_weight,
              backoff: recommendation.backoff_weight,
              working: recommendation.working_weight,
              dropset: recommendation.dropset_weight
            };
            saveProgressionWeights(exercise.id, nextWeek, nextDay, weights, recommendation.reason);
            logger.progression.saved(exerciseName, nextWeek, nextDay, weights);

            // For repeating exercises: also save recommendations for other days in THIS SAME week
            const otherDays = getOtherDaysForExercise(exercise.id, session.day);
            for (const otherDay of otherDays) {
              // Only if that day hasn't been completed yet in this week
              const otherDayDone = db.prepare(`
                SELECT id FROM workout_sessions
                WHERE week = ? AND day = ? AND finished_at IS NOT NULL
              `).get(session.week, otherDay);

              if (!otherDayDone) {
                // Filter weights to only include set types valid for the other day
                const configKey = `${exerciseName}_${otherDay}`;
                const allowedTypes = EXERCISE_SET_CONFIG[configKey] || ['working'];
                const filteredWeights = {
                  heavy: allowedTypes.includes('heavy') ? weights.heavy : null,
                  backoff: allowedTypes.includes('backoff') ? weights.backoff : null,
                  working: allowedTypes.includes('working') ? weights.working : null,
                  dropset: allowedTypes.includes('dropset') ? weights.dropset : null
                };

                // Save recommendation for same week, other day (atomic)
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
    }); // End of saveDailyResultsAtomic transaction definition

    // Execute the atomic daily save
    saveDailyResultsAtomic();
    logger.info('ANALYSIS', `Daily analysis saved atomically for session #${sessionId}`);

    // After Day 3 - perform weekly analysis for comprehensive recommendations
    let weeklyAnalysis = null;
    if (session.day === 3) {
      logger.info('ANALYSIS', `Day 3 completed - triggering weekly analysis for W${session.week}`);
      try {
        // Get all sessions from this week (days 1, 2, 3)
        const weekSessions = db.prepare(`
          SELECT * FROM workout_sessions
          WHERE week = ? AND finished_at IS NOT NULL
          ORDER BY day
        `).all(session.week);

        if (weekSessions.length >= 3) {
          logger.debug('ANALYSIS', `Found ${weekSessions.length} completed sessions for week ${session.week}`);
          // Get all set logs for all sessions this week
          const weekSetLogs = db.prepare(`
            SELECT sl.*, e.name as exercise_name, e.muscle_group, ws.day
            FROM set_logs sl
            JOIN exercises e ON sl.exercise_id = e.id
            JOIN workout_sessions ws ON sl.session_id = ws.id
            WHERE ws.week = ? AND ws.finished_at IS NOT NULL
            ORDER BY ws.day, e.id, sl.set_number
          `).all(session.week);

          // Get notes from all sessions this week
          const weekNotes = weekSessions
            .filter(s => s.overall_notes)
            .map(s => `Dzień ${s.day}: ${s.overall_notes}`)
            .join('\n');

          // Get previous weeks data for trends
          const previousWeeksData = db.prepare(`
            SELECT
              sl.exercise_id,
              e.name as exercise_name,
              sl.set_type,
              sl.actual_weight,
              sl.actual_reps,
              sl.rpe,
              ws.week,
              ws.day,
              ws.finished_at
            FROM set_logs sl
            JOIN workout_sessions ws ON sl.session_id = ws.id
            JOIN exercises e ON sl.exercise_id = e.id
            WHERE ws.week < ? AND ws.finished_at IS NOT NULL
            ORDER BY ws.week DESC, ws.day
            LIMIT 150
          `).all(session.week);

          // Collect daily analyses from all sessions this week
          const dailyAnalyses = weekSessions
            .filter(s => s.ai_analysis)
            .map(s => {
              try {
                return {
                  day: s.day,
                  analysis: JSON.parse(s.ai_analysis)
                };
              } catch {
                return null;
              }
            })
            .filter(Boolean);

          logger.debug('ANALYSIS', `Collected ${dailyAnalyses.length} daily analyses for weekly summary`);

          // Call AI for weekly analysis
          weeklyAnalysis = await analyzeWeek({
            week: session.week,
            sessions: weekSessions,
            setLogs: weekSetLogs,
            previousWeeksData,
            weekNotes,
            dailyAnalyses
          });

          // Filter weekly recommendations by set config for each day
          if (weeklyAnalysis.nextWeekRecommendations) {
            for (const [day, exercises] of Object.entries(weeklyAnalysis.nextWeekRecommendations)) {
              const dayNum = parseInt(day);
              if (!isNaN(dayNum)) {
                weeklyAnalysis.nextWeekRecommendations[day] = filterRecommendationsBySetConfig(exercises, dayNum);
              }
            }
          }

          // ATOMIC: Save weekly analysis + all progressions in single transaction
          const saveWeeklyResultsAtomic = db.transaction(() => {
            // Save weekly analysis
            db.prepare(`
              UPDATE workout_sessions
              SET ai_analysis = json_set(COALESCE(ai_analysis, '{}'), '$.weeklyAnalysis', ?)
              WHERE id = ?
            `).run(JSON.stringify(weeklyAnalysis), sessionId);

            // If weekly analysis has recommendations for next week, save them
            if (weeklyAnalysis.nextWeekRecommendations) {
              const nextWeekNum = session.week < PROGRAM_WEEKS ? session.week + 1 : 1;

              for (const [day, exercises] of Object.entries(weeklyAnalysis.nextWeekRecommendations)) {
                const dayNum = parseInt(day);
                if (isNaN(dayNum)) continue;

                for (const [exerciseName, recommendation] of Object.entries(exercises)) {
                  const exercise = db.prepare(`
                    SELECT id FROM exercises WHERE name = ?
                  `).get(exerciseName);

                  if (exercise) {
                    logger.debug('PROGRESSION', `Weekly: ${exerciseName} W${nextWeekNum}D${dayNum}`, {
                      heavy: recommendation.heavy_weight,
                      backoff: recommendation.backoff_weight,
                      working: recommendation.working_weight,
                      dropset: recommendation.dropset_weight
                    });

                    // Check if we have any values to save
                    const hasAnyValue = recommendation.heavy_weight != null ||
                                       recommendation.backoff_weight != null ||
                                       recommendation.working_weight != null ||
                                       recommendation.dropset_weight != null;

                    if (hasAnyValue) {
                      // Save all progressions
                      const weights = {
                        heavy: recommendation.heavy_weight,
                        backoff: recommendation.backoff_weight,
                        working: recommendation.working_weight,
                        dropset: recommendation.dropset_weight
                      };
                      saveProgressionWeights(exercise.id, nextWeekNum, dayNum, weights, recommendation.reason || 'Weekly analysis');
                      logger.progression.saved(exerciseName, nextWeekNum, dayNum, weights);
                    } else {
                      logger.progression.noData(exerciseName, nextWeekNum, dayNum);
                    }
                  } else {
                    logger.progression.notFound(exerciseName);
                  }
                }
              }
            }
          });

          // Execute the atomic weekly save
          saveWeeklyResultsAtomic();
          logger.info('ANALYSIS', `Weekly analysis saved atomically for W${session.week}`);
        }
      } catch (weeklyError) {
        logger.error('ANALYSIS', 'Weekly analysis failed', weeklyError);
        // Don't fail the entire request if weekly analysis fails
      }
    }

    logger.info('ANALYSIS', `Completed analysis for session #${sessionId}`);

    res.json({
      success: true,
      analysis,
      weeklyAnalysis
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
