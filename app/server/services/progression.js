/**
 * Rule-Based Progression Service
 * Replaces AI-based workout analysis with deterministic progression algorithm
 * Based on rules from program-rules.json and Jeff Nippard Essentials program
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { roundWeightByExercise } from '../utils/warmupCalculator.js';
import logger from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load program rules
let programRules = {};
try {
  const rulesPath = join(__dirname, '../../data/program-rules.json');
  programRules = JSON.parse(readFileSync(rulesPath, 'utf-8'));
  logger.debug('PROGRESSION', 'Loaded program-rules.json');
} catch (error) {
  logger.warn('PROGRESSION', `Could not load program-rules.json: ${error.message}`);
}

/**
 * Get exercise rules (type, progressionStep, minProgression)
 */
function getExerciseRules(exerciseName) {
  return programRules.exerciseRules?.[exerciseName] || {
    type: 'isolation',
    progressionStep: 2,
    minProgression: 1
  };
}

/**
 * Check if deload is needed (RPE 10 in 2 consecutive sessions)
 */
function shouldDeload(previousData, exerciseName, setType) {
  // Get last 2 sessions for this exercise+setType, ordered by most recent first
  const relevantHistory = previousData
    .filter(d => d.exercise_name === exerciseName && d.set_type === setType && d.rpe != null)
    .slice(0, 2);

  if (relevantHistory.length < 2) return false;
  return relevantHistory.every(d => d.rpe >= 10);
}

/**
 * Calculate progression for a single set type of an exercise
 * @returns {{ weight: number, reason: string }}
 */
function calculateSetProgression(exerciseName, setType, currentWeight, actualReps, actualRpe, previousData) {
  const rules = getExerciseRules(exerciseName);
  const { progressionStep, minProgression } = rules;

  if (!currentWeight || currentWeight <= 0) {
    return { weight: currentWeight, reason: 'Brak danych o ciezarze' };
  }

  // Check deload first
  if (shouldDeload(previousData, exerciseName, setType)) {
    const deloadWeight = roundWeightByExercise(currentWeight * 0.80, exerciseName);
    return {
      weight: deloadWeight,
      reason: `RPE 10 dwa razy z rzedu -> deload -20% (${currentWeight} -> ${deloadWeight}kg)`
    };
  }

  let newWeight = currentWeight;
  let reason = '';

  switch (setType) {
    case 'heavy': {
      // Target: 4-6 reps @ RPE 8-9
      if (actualReps >= 6 && actualRpe <= 8) {
        newWeight = currentWeight + progressionStep;
        reason = `${actualReps} reps @ RPE ${actualRpe} -> +${progressionStep}kg`;
      } else if (actualReps >= 4 && actualRpe <= 9) {
        reason = `${actualReps} reps @ RPE ${actualRpe} -> utrzymaj`;
      } else if (actualReps < 4 || actualRpe >= 10) {
        newWeight = currentWeight * 0.95;
        reason = `${actualReps} reps @ RPE ${actualRpe} -> -5%`;
      } else {
        reason = `${actualReps} reps @ RPE ${actualRpe} -> utrzymaj`;
      }
      break;
    }

    case 'backoff': {
      // Target: 8-10 reps @ RPE 8-9
      if (actualReps >= 10 && actualRpe <= 8) {
        newWeight = currentWeight + minProgression;
        reason = `${actualReps} reps @ RPE ${actualRpe} -> +${minProgression}kg`;
      } else if (actualRpe === 9) {
        reason = `RPE 9 -> utrzymaj`;
      } else if (actualReps < 8) {
        newWeight = currentWeight * 0.95;
        reason = `${actualReps} reps (< 8) -> -5%`;
      } else {
        reason = `${actualReps} reps @ RPE ${actualRpe} -> utrzymaj`;
      }
      break;
    }

    case 'working': {
      // Target: 10-12 reps @ RPE 9-10
      if (actualReps >= 12 && actualRpe <= 9) {
        newWeight = currentWeight + progressionStep;
        reason = `${actualReps} reps @ RPE ${actualRpe} -> +${progressionStep}kg`;
      } else if (actualRpe >= 10 && actualReps >= 10) {
        reason = `RPE 10, ${actualReps} reps -> utrzymaj`;
      } else if (actualReps < 10) {
        newWeight = currentWeight * 0.95;
        reason = `${actualReps} reps (< 10) -> -5%`;
      } else {
        reason = `${actualReps} reps @ RPE ${actualRpe} -> utrzymaj`;
      }
      break;
    }

    case 'dropset': {
      // Target: 12-15 reps @ RPE 10
      if (actualReps > 15 && actualRpe <= 9) {
        newWeight = currentWeight + minProgression;
        reason = `${actualReps} reps @ RPE ${actualRpe} -> +${minProgression}kg`;
      } else if (actualReps >= 12 && actualReps <= 15) {
        reason = `${actualReps} reps -> utrzymaj`;
      } else if (actualReps < 12) {
        newWeight = currentWeight * 0.95;
        reason = `${actualReps} reps (< 12) -> -5%`;
      } else {
        reason = `${actualReps} reps @ RPE ${actualRpe} -> utrzymaj`;
      }
      break;
    }

    default:
      reason = 'Nieznany typ serii';
  }

  // Round weight
  newWeight = roundWeightByExercise(newWeight, exerciseName);

  // Max weight cap validation
  const maxIncrease = rules.type === 'compound' ? 5 : 2;
  if (newWeight > currentWeight + maxIncrease) {
    newWeight = roundWeightByExercise(currentWeight + maxIncrease, exerciseName);
    reason += ` [Cap: max +${maxIncrease}kg/tydzien]`;
  }

  // Ensure weight doesn't go below minimum
  if (newWeight < 0) newWeight = 0;

  return {
    weight: newWeight,
    reason: `${reason} (${currentWeight} -> ${newWeight}kg)`
  };
}

/**
 * Main progression calculation function
 * Replaces AI analyzeWorkout() - same output shape
 *
 * @param {Object} params
 * @param {Object} params.session - Session object (week, day)
 * @param {Array} params.setLogs - Set logs for this session
 * @param {Array} params.previousData - Historical set logs for comparison
 * @returns {Object} - { analysis, exerciseAnalysis, nextWorkout }
 */
export function calculateProgression({ session, setLogs, previousData }) {
  const exerciseAnalysis = {};
  const nextWorkout = {};

  // Group set logs by exercise
  const exerciseGroups = {};
  for (const log of setLogs) {
    if (log.set_type === 'warmup') continue;
    const name = log.exercise_name;
    if (!exerciseGroups[name]) {
      exerciseGroups[name] = {};
    }
    if (!exerciseGroups[name][log.set_type]) {
      exerciseGroups[name][log.set_type] = [];
    }
    exerciseGroups[name][log.set_type].push(log);
  }

  let increases = 0;
  let maintains = 0;
  let decreases = 0;

  for (const [exerciseName, setTypes] of Object.entries(exerciseGroups)) {
    const recommendations = {};
    const analyses = [];

    for (const [setType, logs] of Object.entries(setTypes)) {
      // Use the last set's data for the decision (per Jeff Nippard - last set RPE matters most)
      const lastSet = logs[logs.length - 1];
      if (!lastSet) continue;

      const currentWeight = lastSet.actual_weight || lastSet.target_weight || 0;
      const actualReps = lastSet.actual_reps || 0;
      const actualRpe = lastSet.rpe || 8; // Default RPE 8 if not provided

      const result = calculateSetProgression(
        exerciseName,
        setType,
        currentWeight,
        actualReps,
        actualRpe,
        previousData
      );

      const weightKey = `${setType}_weight`;
      recommendations[weightKey] = result.weight;
      analyses.push(`${setType}: ${result.reason}`);

      // Track direction
      if (result.weight > currentWeight) increases++;
      else if (result.weight < currentWeight) decreases++;
      else maintains++;

      logger.debug('PROGRESSION', `${exerciseName} ${setType}: ${currentWeight}kg -> ${result.weight}kg`);
    }

    if (Object.keys(recommendations).length > 0) {
      recommendations.reason = analyses.join('; ');
      nextWorkout[exerciseName] = recommendations;
      exerciseAnalysis[exerciseName] = analyses.join('; ');
    }
  }

  const analysis = `Progresja: ${increases} cwiczen w gore, ${maintains} utrzymanych, ${decreases} zmniejszonych.`;

  logger.info('PROGRESSION', analysis);

  return {
    analysis,
    exerciseAnalysis,
    nextWorkout
  };
}
