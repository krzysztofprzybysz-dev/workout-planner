/**
 * Exercise Set Configuration
 * Defines exactly which set types each exercise has on each day
 * Format: 'ExerciseName_day' -> ['setType1', 'setType2']
 *
 * Extracted from the Jeff Nippard Essentials 3x/week program
 */

export const EXERCISE_SET_CONFIG = {
  // Day 1 - Full Body
  'Leg Press_1': ['heavy', 'backoff'],
  'Incline DB Press_1': ['working'],
  'Seated Hamstring Curl_1': ['working'],
  'T-Bar Row_1': ['working'],
  'DB Bicep Curl_1': ['working', 'dropset'],
  'DB Lateral Raise_1': ['working', 'dropset'],
  'Machine Crunch_1': ['working', 'dropset'],

  // Day 2 - Upper Body
  'Flat DB Press_2': ['heavy', 'backoff'],
  '2-Grip Lat Pulldown_2': ['working'],
  'Seated DB Shoulder Press_2': ['working'],
  'Seated Cable Row_2': ['working', 'dropset'],
  'EZ Bar Skull Crusher_2': ['working'],
  'EZ Bar Curl_2': ['working'],
  'Machine Crunch_2': ['working', 'dropset'],

  // Day 3 - Lower Body
  'Romanian Deadlift_3': ['working'],
  'Leg Press_3': ['working'],
  'Leg Extension_3': ['working', 'dropset'],
  'Seated Calf Raise_3': ['working'],
  'Machine Crunch_3': ['working'],
};
