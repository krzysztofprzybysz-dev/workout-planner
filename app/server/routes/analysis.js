import { Router } from 'express';
import { analyzeWorkout, analyzeWeek } from '../services/claude.js';
import logger from '../services/logger.js';

const router = Router();

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

    // Save analysis to session
    db.prepare(`
      UPDATE workout_sessions SET ai_analysis = ? WHERE id = ?
    `).run(JSON.stringify(analysis), sessionId);

    // Prepare statements for progression saving (defined once, used by both daily and weekly analysis)
    const deleteProgression = db.prepare(`
      DELETE FROM progression WHERE exercise_id = ? AND week = ? AND day = ?
    `);
    const insertProgression = db.prepare(`
      INSERT INTO progression (exercise_id, week, day, set_type, calculated_weight, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    // Save progression recommendations from daily analysis
    if (analysis.nextWorkout) {
      // Calculate next workout's week
      // Progression is ALWAYS for the next week's same day
      // E.g., Week 1 Day 1 -> progression for Week 2 Day 1
      const nextWeek = session.week < 8 ? session.week + 1 : 1;
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
            // Delete old progression for this exercise/week/day to avoid duplicates
            deleteProgression.run(exercise.id, nextWeek, nextDay);

            if (recommendation.heavy_weight != null) {
              insertProgression.run(
                exercise.id,
                nextWeek,
                nextDay,
                'heavy',
                recommendation.heavy_weight,
                recommendation.reason
              );
            }
            if (recommendation.backoff_weight != null) {
              insertProgression.run(
                exercise.id,
                nextWeek,
                nextDay,
                'backoff',
                recommendation.backoff_weight,
                recommendation.reason
              );
            }
            if (recommendation.working_weight != null) {
              insertProgression.run(
                exercise.id,
                nextWeek,
                nextDay,
                'working',
                recommendation.working_weight,
                recommendation.reason
              );
            }
            if (recommendation.dropset_weight != null) {
              insertProgression.run(
                exercise.id,
                nextWeek,
                nextDay,
                'dropset',
                recommendation.dropset_weight,
                recommendation.reason
              );
            }
            logger.progression.saved(exerciseName, nextWeek, nextDay, {
              heavy: recommendation.heavy_weight,
              backoff: recommendation.backoff_weight,
              working: recommendation.working_weight,
              dropset: recommendation.dropset_weight
            });
          } else {
            logger.progression.noData(exerciseName, nextWeek, nextDay);
          }
        } else {
          logger.progression.notFound(exerciseName);
        }
      }
    }

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

          // Call AI for weekly analysis
          weeklyAnalysis = await analyzeWeek({
            week: session.week,
            sessions: weekSessions,
            setLogs: weekSetLogs,
            previousWeeksData,
            weekNotes
          });

          // Save weekly analysis
          db.prepare(`
            UPDATE workout_sessions
            SET ai_analysis = json_set(COALESCE(ai_analysis, '{}'), '$.weeklyAnalysis', ?)
            WHERE id = ?
          `).run(JSON.stringify(weeklyAnalysis), sessionId);

          // If weekly analysis has recommendations for next week, save them
          if (weeklyAnalysis.nextWeekRecommendations) {
            const nextWeekNum = session.week < 8 ? session.week + 1 : 1;

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
                    // Delete old progression for this exercise/week/day to avoid duplicates
                    deleteProgression.run(exercise.id, nextWeekNum, dayNum);

                    if (recommendation.heavy_weight != null) {
                      insertProgression.run(
                        exercise.id, nextWeekNum, dayNum, 'heavy',
                        recommendation.heavy_weight, recommendation.reason || 'Weekly analysis'
                      );
                    }
                    if (recommendation.backoff_weight != null) {
                      insertProgression.run(
                        exercise.id, nextWeekNum, dayNum, 'backoff',
                        recommendation.backoff_weight, recommendation.reason || 'Weekly analysis'
                      );
                    }
                    if (recommendation.working_weight != null) {
                      insertProgression.run(
                        exercise.id, nextWeekNum, dayNum, 'working',
                        recommendation.working_weight, recommendation.reason || 'Weekly analysis'
                      );
                    }
                    if (recommendation.dropset_weight != null) {
                      insertProgression.run(
                        exercise.id, nextWeekNum, dayNum, 'dropset',
                        recommendation.dropset_weight, recommendation.reason || 'Weekly analysis'
                      );
                    }
                    logger.progression.saved(exerciseName, nextWeekNum, dayNum, {
                      heavy: recommendation.heavy_weight,
                      backoff: recommendation.backoff_weight,
                      working: recommendation.working_weight,
                      dropset: recommendation.dropset_weight
                    });
                  } else {
                    logger.progression.noData(exerciseName, nextWeekNum, dayNum);
                  }
                } else {
                  logger.progression.notFound(exerciseName);
                }
              }
            }
          }
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
