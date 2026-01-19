import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

import workoutsRouter from './routes/workouts.js';
import analysisRouter from './routes/analysis.js';
import logger from './services/logger.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

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
const db = new Database(join(__dirname, 'workout.db'));
db.pragma('journal_mode = WAL');

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

// Error handler
app.use((err, req, res, next) => {
  logger.error('SERVER', 'Unhandled error', err);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
  logger.info('SERVER', `🏋️ Workout Planner API running on http://localhost:${PORT}`);
});
