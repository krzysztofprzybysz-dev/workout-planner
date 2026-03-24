/**
 * Client-side weight calculator
 * Mirrors server/utils/warmupCalculator.js for live UI calculations
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
};

function getEquipmentType(exerciseName) {
  return EQUIPMENT_MAP[exerciseName] || 'machine';
}

function roundWeight(weight, equipmentType = 'machine') {
  if (equipmentType === 'dumbbell') {
    return Math.max(Math.round(weight), 4);
  } else if (equipmentType === 'barbell') {
    return Math.round(weight / 10) * 10;
  } else {
    return Math.round(weight / 5) * 5;
  }
}

/**
 * Calculate derived weights from primary set weight
 * @param {string} exerciseName - for equipment type lookup
 * @param {number} primaryWeight - the heavy or working weight entered by user
 * @param {string} primarySetType - 'heavy' or 'working'
 * @returns {{ warmup1, warmup2, backoff, dropset }}
 */
export function calculateDerivedWeights(exerciseName, primaryWeight, primarySetType) {
  if (!primaryWeight || primaryWeight <= 0) {
    return { warmup1: null, warmup2: null, backoff: null, dropset: null };
  }

  const eq = getEquipmentType(exerciseName);

  const warmup1 = roundWeight(primaryWeight * 0.50, eq);
  const warmup2 = roundWeight(primaryWeight * 0.70, eq);
  const backoff = primarySetType === 'heavy'
    ? roundWeight(primaryWeight * 0.825, eq)
    : null;
  const dropset = (primarySetType === 'working' || primarySetType === 'heavy')
    ? roundWeight(primaryWeight * 0.50, eq)
    : null;

  return { warmup1, warmup2, backoff, dropset };
}
