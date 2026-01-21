/**
 * Warmup Calculator Utility
 * Calculates warmup weights based on working/heavy weight
 * Replaces static warmup values from program.json
 */

/**
 * Equipment type mapping for exercises
 * - dumbbell: 1kg increments, min 4kg
 * - barbell: 10kg increments
 * - machine: 5kg increments (default)
 */
const EQUIPMENT_MAP = {
  'Incline DB Press': 'dumbbell',
  'DB Bicep Curl': 'dumbbell',
  'DB Lateral Raise': 'dumbbell',
  'Flat DB Press': 'dumbbell',
  'Seated DB Shoulder Press': 'dumbbell',
  'T-Bar Row': 'barbell',
  'Romanian Deadlift': 'barbell',
  'EZ Bar Skull Crusher': 'barbell',
  'EZ Bar Curl': 'barbell',
  // All others default to 'machine'
};

/**
 * Get equipment type for an exercise
 * @param {string} exerciseName - Name of the exercise
 * @returns {string} - 'dumbbell', 'barbell', or 'machine'
 */
export function getEquipmentType(exerciseName) {
  return EQUIPMENT_MAP[exerciseName] || 'machine';
}

/**
 * Round weight to appropriate increment based on equipment type
 * - Dumbbells: 1kg increments, minimum 4kg
 * - Barbells: 10kg increments
 * - Machines: 5kg increments
 * @param {number} weight - Weight to round
 * @param {string} equipmentType - 'dumbbell', 'barbell', or 'machine'
 * @returns {number} - Rounded weight
 */
export function roundWeight(weight, equipmentType = 'machine') {
  if (equipmentType === 'dumbbell') {
    // Hantle: 1kg inkrementacje, min 4kg
    return Math.max(Math.round(weight), 4);
  } else if (equipmentType === 'barbell') {
    // Sztangi: 10kg inkrementacje
    return Math.round(weight / 10) * 10;
  } else {
    // Maszyny: 5kg inkrementacje
    return Math.round(weight / 5) * 5;
  }
}

/**
 * Calculate warmup weights based on working weight
 * Jeff Nippard protocol: 2 warmup sets at ~50% and ~70% of working weight
 * @param {number} workingWeight - The target working/heavy weight
 * @param {string} equipmentType - 'dumbbell', 'barbell', or 'machine'
 * @returns {object} - { warmup1: 50%, warmup2: 70% }
 */
export function calculateWarmupWeights(workingWeight, equipmentType = 'machine') {
  if (!workingWeight || workingWeight <= 0) {
    return { warmup1: 0, warmup2: 0 };
  }

  return {
    warmup1: roundWeight(workingWeight * 0.50, equipmentType),
    warmup2: roundWeight(workingWeight * 0.70, equipmentType)
  };
}

/**
 * Calculate warmup weights for a specific exercise based on its working sets
 * @param {Array} sets - Array of set objects for an exercise
 * @param {string} exerciseName - Name of the exercise (for equipment type lookup)
 * @returns {object} - Warmup weights based on the first heavy/working set found
 */
export function calculateWarmupForExercise(sets, exerciseName = '') {
  if (!sets || sets.length === 0) {
    return { warmup1: 0, warmup2: 0 };
  }

  // Find the primary working weight (prefer heavy, then working, then backoff)
  const heavySet = sets.find(s => s.type === 'heavy');
  const workingSet = sets.find(s => s.type === 'working');
  const backoffSet = sets.find(s => s.type === 'backoff');

  const primaryWeight = heavySet?.weight || heavySet?.targetWeight ||
                       workingSet?.weight || workingSet?.targetWeight ||
                       backoffSet?.weight || backoffSet?.targetWeight || 0;

  const equipmentType = getEquipmentType(exerciseName);
  return calculateWarmupWeights(primaryWeight, equipmentType);
}

/**
 * Round weight by exercise name (convenience wrapper)
 * Automatically looks up equipment type from exercise name
 * @param {number} weight - Weight to round
 * @param {string} exerciseName - Name of the exercise
 * @returns {number} - Rounded weight
 */
export function roundWeightByExercise(weight, exerciseName = '') {
  const equipmentType = getEquipmentType(exerciseName);
  return roundWeight(weight, equipmentType);
}

export default {
  roundWeight,
  roundWeightByExercise,
  calculateWarmupWeights,
  calculateWarmupForExercise,
  getEquipmentType,
  EQUIPMENT_MAP
};
