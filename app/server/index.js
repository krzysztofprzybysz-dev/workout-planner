import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import dotenv from 'dotenv';

import workoutsRouter from './routes/workouts.js';
import analysisRouter from './routes/analysis.js';
import logger from './services/logger.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const isProduction = process.env.NODE_ENV === 'production';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files in production
if (isProduction) {
  const clientBuildPath = join(__dirname, '../client/dist');
  app.use(express.static(clientBuildPath));
}

// HTTP request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.request(req, res, duration);
  });
  next();
});

// Database connection middleware
const dbPath = join(__dirname, 'workout.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Check if database needs seeding (no tables exist)
const tablesExist = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='exercises'").get();
if (!tablesExist) {
  logger.info('DATABASE', 'No tables found, running initial seed...');
  // Import and run seed logic inline
  const { readFileSync } = await import('fs');
  const schema = readFileSync(join(__dirname, 'db/schema.sql'), 'utf8');
  db.exec(schema);

  const program = JSON.parse(readFileSync(join(__dirname, '../data/program.json'), 'utf8'));

  // Insert exercises
  const insertExercise = db.prepare(`
    INSERT OR REPLACE INTO exercises (id, name, muscle_group, substitution_1, substitution_2, notes, video_url)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const exercise of program.exercises) {
    insertExercise.run(exercise.id, exercise.name, exercise.muscle_group || null,
      exercise.substitution_1 || null, exercise.substitution_2 || null,
      exercise.notes || null, exercise.video_url || null);
  }

  // Insert workout plans
  const insertWorkoutPlan = db.prepare(`
    INSERT INTO workout_plans (week, day, day_name, exercise_id, exercise_order, warmup_sets, working_sets, target_reps, target_rpe, rest_seconds, set_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (let week = 1; week <= 8; week++) {
    for (const dayPlan of program.workoutDays) {
      for (const exercise of dayPlan.exercises) {
        const warmupSets = exercise.sets.filter(s => s.type === 'warmup').length;
        const workingSets = exercise.sets.filter(s => s.type !== 'warmup').length;
        let setType = 'normal';
        if (exercise.sets.some(s => s.type === 'heavy')) setType = 'heavy';
        else if (exercise.sets.some(s => s.type === 'dropset')) setType = 'dropset';
        const firstWorking = exercise.sets.find(s => s.type !== 'warmup');
        insertWorkoutPlan.run(week, dayPlan.day, dayPlan.name, exercise.exerciseId, exercise.order,
          warmupSets, workingSets, firstWorking?.reps || '8-12', firstWorking?.rpe || 8, 120, setType);
      }
    }
  }

  // Insert initial progression
  const insertProgression = db.prepare(`
    INSERT INTO progression (exercise_id, week, day, set_type, calculated_weight, reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `);
  for (const dayPlan of program.workoutDays) {
    for (const exercise of dayPlan.exercises) {
      for (const set of exercise.sets) {
        if (set.type !== 'warmup') {
          insertProgression.run(exercise.exerciseId, 1, dayPlan.day, set.type, set.weight, 'Initial weight from program');
        }
      }
    }
  }
  logger.info('DATABASE', 'Database seeded successfully');
}

app.use((req, res, next) => {
  req.db = db;
  next();
});

// Routes
app.use('/api/workouts', workoutsRouter);
app.use('/api/analysis', analysisRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// SPA fallback - serve index.html for non-API routes in production
if (isProduction) {
  app.get('*', (req, res) => {
    res.sendFile(join(__dirname, '../client/dist/index.html'));
  });
}

// Error handler
app.use((err, req, res, next) => {
  logger.error('SERVER', 'Unhandled error', err);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
  logger.info('SERVER', `🏋️ Workout Planner API running on http://localhost:${PORT}`);
});
