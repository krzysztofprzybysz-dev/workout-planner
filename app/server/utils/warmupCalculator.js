/**
 * Warmup Calculator Utility
 * Calculates warmup weights based on working/heavy weight
 * Replaces static warmup values from program.json
 */

/**
 * Round weight to appropriate increment
 * - Small weights (≤20kg): 0.5kg increments (dumbbells)
 * - Larger weights (>20kg): 2.5kg increments (barbells/machines)
 * @param {number} weight - Weight to round
 * @returns {number} - Rounded weight
 */
export function roundWeight(weight) {
  if (weight <= 20) {
    return Math.round(weight * 2) / 2;
  } else {
    return Math.round(weight / 2.5) * 2.5;
  }
}

/**
 * Calculate warmup weights based on working weight
 * Jeff Nippard protocol: 2 warmup sets at ~50% and ~70% of working weight
 * @param {number} workingWeight - The target working/heavy weight
 * @returns {object} - { warmup1: 50%, warmup2: 70% }
 */
export function calculateWarmupWeights(workingWeight) {
  if (!workingWeight || workingWeight <= 0) {
    return { warmup1: 0, warmup2: 0 };
  }

  return {
    warmup1: roundWeight(workingWeight * 0.50),
    warmup2: roundWeight(workingWeight * 0.70)
  };
}

/**
 * Calculate warmup weights for a specific exercise based on its working sets
 * @param {Array} sets - Array of set objects for an exercise
 * @returns {object} - Warmup weights based on the first heavy/working set found
 */
export function calculateWarmupForExercise(sets) {
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

  return calculateWarmupWeights(primaryWeight);
}

export default {
  roundWeight,
  calculateWarmupWeights,
  calculateWarmupForExercise
};
