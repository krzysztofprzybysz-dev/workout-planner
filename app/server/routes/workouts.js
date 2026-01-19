import { Router } from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import logger from '../services/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = Router();

// Load program data
const programPath = join(__dirname, '../../data/program.json');
const program = JSON.parse(readFileSync(programPath, 'utf8'));

// Get current workout state (which week/day we're on)
router.get('/current', (req, res) => {
  const db = req.db;

  // Find the last completed session
  const lastSession = db.prepare(`
    SELECT week, day, finished_at FROM workout_sessions
    WHERE finished_at IS NOT NULL
    ORDER BY finished_at DESC LIMIT 1
  `).get();

  let currentWeek = 1;
  let currentDay = 1;

  if (lastSession) {
    // Calculate next workout
    if (lastSession.day < 3) {
      currentDay = lastSession.day + 1;
      currentWeek = lastSession.week;
    } else {
      currentDay = 1;
      currentWeek = lastSession.week < 8 ? lastSession.week + 1 : 1;
    }
  }

  // Check if there's an active session
  const activeSession = db.prepare(`
    SELECT id, week, day, started_at FROM workout_sessions
    WHERE finished_at IS NULL
    ORDER BY started_at DESC LIMIT 1
  `).get();

  if (activeSession) {
    logger.session.active(activeSession.id, activeSession.week, activeSession.day);
  } else {
    logger.debug('WORKOUT', `Next workout: W${currentWeek}D${currentDay}`);
  }

  res.json({
    currentWeek,
    currentDay,
    activeSession
  });
});

// Get session data - MUST be before /:week/:day to avoid route conflict
router.get('/session/:sessionId', (req, res) => {
  const db = req.db;
  const { sessionId } = req.params;

  const session = db.prepare(`
    SELECT * FROM workout_sessions WHERE id = ?
  `).get(sessionId);

  if (!session) {
    logger.session.notFound(sessionId);
    return res.status(404).json({ error: 'Session not found' });
  }

  const setLogs = db.prepare(`
    SELECT sl.*, COALESCE(e.name, 'Ćwiczenie #' || sl.exercise_id) as exercise_name
    FROM set_logs sl
    LEFT JOIN exercises e ON sl.exercise_id = e.id
    WHERE sl.session_id = ?
    ORDER BY sl.exercise_id, sl.set_number
  `).all(sessionId);

  logger.debug('SESSION', `Loaded session #${sessionId} with ${setLogs.length} sets`);

  res.json({
    ...session,
    setLogs
  });
});

// Get workout for specific week/day
router.get('/:week/:day', (req, res) => {
  const db = req.db;
  const { week, day } = req.params;

  // Get the workout plan for this day
  const dayPlan = program.workoutDays.find(d => d.day === parseInt(day));
  if (!dayPlan) {
    return res.status(404).json({ error: 'Workout day not found' });
  }

  // Get progression weights for this week/day
  const progressions = db.prepare(`
    SELECT exercise_id, set_type, calculated_weight, reason
    FROM progression
    WHERE week = ? AND day = ?
    ORDER BY created_at DESC
  `).all(parseInt(week), parseInt(day));

  // Get last workout results for these exercises
  const lastResults = db.prepare(`
    SELECT
      sl.exercise_id,
      sl.set_type,
      sl.actual_weight,
      sl.actual_reps,
      sl.rpe,
      sl.notes,
      ws.week,
      ws.day,
      ws.finished_at
    FROM set_logs sl
    JOIN workout_sessions ws ON sl.session_id = ws.id
    WHERE sl.exercise_id IN (${dayPlan.exercises.map(e => e.exerciseId).join(',')})
    AND ws.finished_at IS NOT NULL
    ORDER BY ws.finished_at DESC
  `).all();

  // Group last results by exercise
  const lastResultsByExercise = {};
  for (const result of lastResults) {
    if (!lastResultsByExercise[result.exercise_id]) {
      lastResultsByExercise[result.exercise_id] = [];
    }
    lastResultsByExercise[result.exercise_id].push(result);
  }

  // Get exercise details
  const exercises = db.prepare(`
    SELECT * FROM exercises WHERE id IN (${dayPlan.exercises.map(e => e.exerciseId).join(',')})
  `).all();

  const exerciseMap = {};
  for (const ex of exercises) {
    exerciseMap[ex.id] = ex;
  }

  // Build progression map
  const progressionMap = {};
  for (const p of progressions) {
    const key = `${p.exercise_id}-${p.set_type}`;
    if (!progressionMap[key]) {
      progressionMap[key] = p;
    }
  }

  // Build response with merged data
  const workoutExercises = dayPlan.exercises.map(ex => {
    const exerciseInfo = exerciseMap[ex.exerciseId];
    const lastExerciseResults = lastResultsByExercise[ex.exerciseId] || [];

    const sets = ex.sets.map(set => {
      // Try to get progression weight, fall back to program weight
      const progressionKey = `${ex.exerciseId}-${set.type}`;
      const progression = progressionMap[progressionKey];
      const targetWeight = progression ? progression.calculated_weight : set.weight;

      // Find last result for this set type
      const lastResult = lastExerciseResults.find(r => r.set_type === set.type);

      return {
        ...set,
        targetWeight,
        progressionReason: progression?.reason,
        lastResult: lastResult ? {
          weight: lastResult.actual_weight,
          reps: lastResult.actual_reps,
          rpe: lastResult.rpe,
          notes: lastResult.notes,
          date: lastResult.finished_at
        } : null
      };
    });

    return {
      exerciseId: ex.exerciseId,
      order: ex.order,
      name: exerciseInfo.name,
      muscleGroup: exerciseInfo.muscle_group,
      notes: exerciseInfo.notes,
      substitution: exerciseInfo.substitution_1,
      supersetWith: ex.supersetWith,
      sets
    };
  });

  logger.info('WORKOUT', `Loaded W${week}D${day} (${dayPlan.name}): ${workoutExercises.length} exercises, ${progressions.length} progressions`);

  res.json({
    week: parseInt(week),
    day: parseInt(day),
    dayName: dayPlan.name,
    exercises: workoutExercises
  });
});

// Start a new workout session
router.post('/session/start', (req, res) => {
  const db = req.db;
  const { week, day } = req.body;

  // Check if there's already an active session
  const activeSession = db.prepare(`
    SELECT id FROM workout_sessions WHERE finished_at IS NULL
  `).get();

  if (activeSession) {
    logger.warn('SESSION', `Cannot start new session - active session #${activeSession.id} exists`);
    return res.status(400).json({
      error: 'Active session exists',
      sessionId: activeSession.id
    });
  }

  const result = db.prepare(`
    INSERT INTO workout_sessions (week, day, started_at)
    VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  `).run(week, day);

  logger.session.start(result.lastInsertRowid, week, day);

  res.json({
    sessionId: result.lastInsertRowid,
    week,
    day
  });
});

// Log a set
router.post('/session/:sessionId/set', (req, res) => {
  const db = req.db;
  const { sessionId } = req.params;
  const { exerciseId, setNumber, setType, targetWeight, actualWeight, targetReps, actualReps, rpe, notes } = req.body;

  // Validate and ensure numeric values for weight and reps
  const validatedActualWeight = parseFloat(actualWeight) || 0;
  const validatedActualReps = parseInt(actualReps) || 0;
  const validatedTargetWeight = parseFloat(targetWeight) || 0;
  const validatedTargetReps = parseInt(String(targetReps).split('-')[0]) || 0;

  // Get exercise name for logging
  const exercise = db.prepare('SELECT name FROM exercises WHERE id = ?').get(exerciseId);
  const exerciseName = exercise?.name || `Exercise #${exerciseId}`;

  // Check if set already exists
  const existingSet = db.prepare(`
    SELECT id FROM set_logs
    WHERE session_id = ? AND exercise_id = ? AND set_number = ? AND set_type = ?
  `).get(sessionId, exerciseId, setNumber, setType);

  let result;
  if (existingSet) {
    // Update existing set
    result = db.prepare(`
      UPDATE set_logs
      SET actual_weight = ?, actual_reps = ?, rpe = ?, notes = ?, completed = 1
      WHERE id = ?
    `).run(validatedActualWeight, validatedActualReps, rpe, notes, existingSet.id);
    logger.debug('SET', `Updated set #${setNumber} (${setType}) for ${exerciseName}`);
  } else {
    // Insert new set
    result = db.prepare(`
      INSERT INTO set_logs (session_id, exercise_id, set_number, set_type, target_weight, actual_weight, target_reps, actual_reps, rpe, notes, completed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(sessionId, exerciseId, setNumber, setType, validatedTargetWeight, validatedActualWeight, validatedTargetReps, validatedActualReps, rpe, notes);
  }

  logger.set(exerciseName, validatedActualWeight, validatedActualReps, rpe);

  res.json({ success: true });
});

// Finish a workout session
router.post('/session/:sessionId/finish', (req, res) => {
  const db = req.db;
  const { sessionId } = req.params;
  const { notes } = req.body;

  // Get session start time to calculate duration
  const session = db.prepare('SELECT started_at FROM workout_sessions WHERE id = ?').get(sessionId);

  db.prepare(`
    UPDATE workout_sessions
    SET finished_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), overall_notes = ?
    WHERE id = ?
  `).run(notes || null, sessionId);

  // Calculate duration
  let durationStr = '';
  if (session?.started_at) {
    const startTime = new Date(session.started_at);
    const endTime = new Date();
    const durationMs = endTime - startTime;
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);
    durationStr = `${minutes}m${seconds}s`;
  }

  logger.session.finish(sessionId, durationStr);

  res.json({ success: true });
});

// Get workout history
router.get('/history', (req, res) => {
  const db = req.db;
  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;

  const sessions = db.prepare(`
    SELECT
      ws.*,
      COUNT(sl.id) as total_sets,
      SUM(CASE WHEN sl.completed THEN 1 ELSE 0 END) as completed_sets
    FROM workout_sessions ws
    LEFT JOIN set_logs sl ON ws.id = sl.session_id
    WHERE ws.finished_at IS NOT NULL
    GROUP BY ws.id
    ORDER BY ws.finished_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);

  logger.debug('HISTORY', `Returned ${sessions.length} sessions (offset: ${offset})`);

  res.json(sessions);
});

// Get exercise history
router.get('/exercise/:exerciseId/history', (req, res) => {
  const db = req.db;
  const { exerciseId } = req.params;
  const limit = parseInt(req.query.limit) || 50;

  const history = db.prepare(`
    SELECT
      sl.*,
      ws.week,
      ws.day,
      ws.finished_at
    FROM set_logs sl
    JOIN workout_sessions ws ON sl.session_id = ws.id
    WHERE sl.exercise_id = ? AND ws.finished_at IS NOT NULL
    ORDER BY ws.finished_at DESC
    LIMIT ?
  `).all(exerciseId, limit);

  res.json(history);
});

// Reset all workout data and return to W1D1
router.post('/reset', (req, res) => {
  const db = req.db;

  try {
    // 1. Delete all user workout data
    db.prepare('DELETE FROM set_logs').run();
    db.prepare('DELETE FROM workout_sessions').run();
    db.prepare('DELETE FROM progression').run();

    // 2. Reseed progression for Week 1 with default weights from program.json
    const insertProgression = db.prepare(`
      INSERT INTO progression (exercise_id, week, day, set_type, calculated_weight, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    for (const dayPlan of program.workoutDays) {
      for (const exercise of dayPlan.exercises) {
        for (const set of exercise.sets) {
          if (set.type !== 'warmup') {
            insertProgression.run(
              exercise.exerciseId,
              1,
              dayPlan.day,
              set.type,
              set.weight,
              'Reset - początkowy ciężar z programu'
            );
          }
        }
      }
    }

    logger.info('RESET', 'All workout data cleared, W1 progressions reseeded');
    res.json({ success: true, message: 'Reset to W1D1 completed' });
  } catch (error) {
    logger.error('RESET', 'Reset failed', error);
    res.status(500).json({ error: 'Reset failed', details: error.message });
  }
});

export default router;
