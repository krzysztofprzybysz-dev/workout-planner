import { Router } from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import logger from '../services/logger.js';
import { calculateWarmupWeights, getEquipmentType } from '../utils/warmupCalculator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = Router();

// Program configuration
const PROGRAM_WEEKS = parseInt(process.env.PROGRAM_WEEKS) || 8;

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
      currentWeek = lastSession.week < PROGRAM_WEEKS ? lastSession.week + 1 : 1;
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
  const sessionId = parseInt(req.params.sessionId);

  if (!Number.isInteger(sessionId) || sessionId < 1) {
    return res.status(400).json({ error: 'Invalid sessionId' });
  }

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

  // Get exercise IDs for parameterized queries
  const exerciseIds = dayPlan.exercises.map(e => e.exerciseId);
  const placeholders = exerciseIds.map(() => '?').join(',');

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
    WHERE sl.exercise_id IN (${placeholders})
    AND ws.finished_at IS NOT NULL
    ORDER BY ws.finished_at DESC
  `).all(...exerciseIds);

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
    SELECT * FROM exercises WHERE id IN (${placeholders})
  `).all(...exerciseIds);

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

    // Find the primary working weight for this exercise (for warmup calculation)
    const heavyProgKey = `${ex.exerciseId}-heavy`;
    const workingProgKey = `${ex.exerciseId}-working`;
    const heavyProg = progressionMap[heavyProgKey];
    const workingProg = progressionMap[workingProgKey];

    // Get primary weight from progression or fallback to program weight
    const heavySet = ex.sets.find(s => s.type === 'heavy');
    const workingSet = ex.sets.find(s => s.type === 'working');
    const primaryWeight = heavyProg?.calculated_weight || heavySet?.weight ||
                         workingProg?.calculated_weight || workingSet?.weight || 0;

    // Calculate dynamic warmup weights based on primary working weight and equipment type
    const equipmentType = getEquipmentType(exerciseInfo.name);
    const warmupWeights = calculateWarmupWeights(primaryWeight, equipmentType);
    let warmupIndex = 0;

    const sets = ex.sets.map(set => {
      // Try to get progression weight, fall back to program weight
      const progressionKey = `${ex.exerciseId}-${set.type}`;
      const progression = progressionMap[progressionKey];
      let targetWeight = progression ? progression.calculated_weight : set.weight;

      // For warmup sets, calculate dynamically based on working weight
      if (set.type === 'warmup') {
        warmupIndex++;
        // Use warmup1 (50%) for first warmup, warmup2 (70%) for subsequent
        targetWeight = warmupIndex === 1 ? warmupWeights.warmup1 : warmupWeights.warmup2;
      }

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

  // Validate week and day
  const weekNum = parseInt(week);
  const dayNum = parseInt(day);
  if (!Number.isInteger(weekNum) || weekNum < 1 || weekNum > 8) {
    return res.status(400).json({ error: 'Invalid week (must be 1-8)' });
  }
  if (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > 3) {
    return res.status(400).json({ error: 'Invalid day (must be 1-3)' });
  }

  // Atomic check-and-insert to prevent race conditions
  const startSession = db.transaction(() => {
    // Check if there's already an active session
    const activeSession = db.prepare(`
      SELECT id FROM workout_sessions WHERE finished_at IS NULL
    `).get();

    if (activeSession) {
      return { error: 'Active session exists', sessionId: activeSession.id };
    }

    const result = db.prepare(`
      INSERT INTO workout_sessions (week, day, started_at)
      VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    `).run(weekNum, dayNum);

    return { sessionId: result.lastInsertRowid, week: weekNum, day: dayNum };
  });

  const result = startSession();

  if (result.error) {
    logger.warn('SESSION', `Cannot start new session - active session #${result.sessionId} exists`);
    return res.status(400).json(result);
  }

  logger.session.start(result.sessionId, result.week, result.day);
  res.json(result);
});

// Log a set
router.post('/session/:sessionId/set', (req, res) => {
  const db = req.db;
  const sessionIdNum = parseInt(req.params.sessionId);
  const { exerciseId, setNumber, setType, targetWeight, actualWeight, targetReps, actualReps, rpe, notes, completedAt } = req.body;

  // Validate sessionId
  if (!Number.isInteger(sessionIdNum) || sessionIdNum < 1) {
    return res.status(400).json({ error: 'Invalid sessionId' });
  }

  // Validate required parameters
  const exerciseIdNum = parseInt(exerciseId);
  if (!Number.isInteger(exerciseIdNum) || exerciseIdNum < 1) {
    return res.status(400).json({ error: 'Invalid exerciseId' });
  }

  const setNumberNum = parseInt(setNumber);
  if (!Number.isInteger(setNumberNum) || setNumberNum < 1) {
    return res.status(400).json({ error: 'Invalid setNumber' });
  }

  const validSetTypes = ['warmup', 'heavy', 'backoff', 'working', 'dropset'];
  if (!setType || !validSetTypes.includes(setType)) {
    return res.status(400).json({ error: `Invalid setType. Must be one of: ${validSetTypes.join(', ')}` });
  }

  // Validate session exists
  const session = db.prepare('SELECT id FROM workout_sessions WHERE id = ?').get(sessionIdNum);
  if (!session) {
    logger.warn('SET', `Session #${sessionIdNum} not found`);
    return res.status(404).json({ error: 'Session not found' });
  }

  // Validate and ensure numeric values for weight and reps (with error on invalid)
  const validatedActualWeight = parseFloat(actualWeight);
  if (isNaN(validatedActualWeight) || validatedActualWeight < 0) {
    return res.status(400).json({ error: 'Invalid actualWeight (must be a non-negative number)' });
  }

  const validatedActualReps = parseInt(actualReps);
  if (!Number.isInteger(validatedActualReps) || validatedActualReps < 0) {
    return res.status(400).json({ error: 'Invalid actualReps (must be a non-negative integer)' });
  }

  // Target values can be 0 or missing (optional)
  const validatedTargetWeight = targetWeight != null ? parseFloat(targetWeight) : 0;
  const targetRepsStr = String(targetReps || '0').split('-')[0];
  const validatedTargetReps = parseInt(targetRepsStr) || 0;

  // Validate RPE if provided (must be 1-10)
  let validatedRpe = null;
  if (rpe != null && rpe !== '') {
    validatedRpe = parseInt(rpe);
    if (!Number.isInteger(validatedRpe) || validatedRpe < 1 || validatedRpe > 10) {
      return res.status(400).json({ error: 'Invalid RPE (must be 1-10)' });
    }
  }

  // Use provided timestamp or current time for rest time tracking
  const timestamp = completedAt || new Date().toISOString();

  // Get exercise name for logging and validate exerciseId exists
  const exercise = db.prepare('SELECT name FROM exercises WHERE id = ?').get(exerciseIdNum);
  if (!exercise) {
    logger.warn('SET', `Exercise #${exerciseIdNum} not found`);
    return res.status(404).json({ error: 'Exercise not found' });
  }
  const exerciseName = exercise.name;

  // Check if set already exists
  const existingSet = db.prepare(`
    SELECT id FROM set_logs
    WHERE session_id = ? AND exercise_id = ? AND set_number = ? AND set_type = ?
  `).get(sessionIdNum, exerciseIdNum, setNumberNum, setType);

  let result;
  if (existingSet) {
    // Update existing set
    result = db.prepare(`
      UPDATE set_logs
      SET actual_weight = ?, actual_reps = ?, rpe = ?, notes = ?, completed = 1, completed_at = ?
      WHERE id = ?
    `).run(validatedActualWeight, validatedActualReps, validatedRpe, notes, timestamp, existingSet.id);
    logger.debug('SET', `Updated set #${setNumberNum} (${setType}) for ${exerciseName}`);
  } else {
    // Insert new set
    result = db.prepare(`
      INSERT INTO set_logs (session_id, exercise_id, set_number, set_type, target_weight, actual_weight, target_reps, actual_reps, rpe, notes, completed, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(sessionIdNum, exerciseIdNum, setNumberNum, setType, validatedTargetWeight, validatedActualWeight, validatedTargetReps, validatedActualReps, validatedRpe, notes, timestamp);
  }

  logger.set(exerciseName, validatedActualWeight, validatedActualReps, validatedRpe);

  res.json({ success: true });
});

// Finish a workout session
router.post('/session/:sessionId/finish', (req, res) => {
  const db = req.db;
  const sessionId = parseInt(req.params.sessionId);
  const { notes } = req.body;

  if (!Number.isInteger(sessionId) || sessionId < 1) {
    return res.status(400).json({ error: 'Invalid sessionId' });
  }

  // Validate session exists
  const session = db.prepare('SELECT started_at FROM workout_sessions WHERE id = ?').get(sessionId);
  if (!session) {
    logger.warn('SESSION', `Cannot finish - session #${sessionId} not found`);
    return res.status(404).json({ error: 'Session not found' });
  }

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
  let limit = parseInt(req.query.limit) || 20;
  let offset = parseInt(req.query.offset) || 0;

  // Validate and sanitize limit/offset
  limit = Math.max(1, Math.min(100, limit));   // 1-100
  offset = Math.max(0, offset);                 // >= 0

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
    // Atomic transaction - all or nothing
    const resetTransaction = db.transaction(() => {
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
    });

    resetTransaction();

    logger.info('RESET', 'All workout data cleared, W1 progressions reseeded');
    res.json({ success: true, message: 'Reset to W1D1 completed' });
  } catch (error) {
    logger.error('RESET', 'Reset failed', error);
    res.status(500).json({ error: 'Reset failed', details: error.message });
  }
});

export default router;
