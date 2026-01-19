import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const db = new Database(join(__dirname, '../workout.db'));

// Read and execute schema
const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Read program data
const program = JSON.parse(readFileSync(join(__dirname, '../../data/program.json'), 'utf8'));

// Insert exercises
const insertExercise = db.prepare(`
  INSERT OR REPLACE INTO exercises (id, name, muscle_group, substitution_1, substitution_2, notes, video_url)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

console.log('Seeding exercises...');
for (const exercise of program.exercises) {
  insertExercise.run(
    exercise.id,
    exercise.name,
    exercise.muscle_group || null,
    exercise.substitution_1 || null,
    exercise.substitution_2 || null,
    exercise.notes || null,
    exercise.video_url || null
  );
  console.log(`  Added: ${exercise.name}`);
}

// Insert workout plans for all 8 weeks (program repeats with progression)
const insertWorkoutPlan = db.prepare(`
  INSERT INTO workout_plans (week, day, day_name, exercise_id, exercise_order, warmup_sets, working_sets, target_reps, target_rpe, rest_seconds, set_type)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

console.log('\nSeeding workout plans...');
for (let week = 1; week <= 8; week++) {
  for (const dayPlan of program.workoutDays) {
    const day = dayPlan.day;
    const dayName = dayPlan.name;

    for (const exercise of dayPlan.exercises) {
      const warmupSets = exercise.sets.filter(s => s.type === 'warmup').length;
      const workingSets = exercise.sets.filter(s => s.type !== 'warmup').length;

      // Determine set type from exercise sets
      let setType = 'normal';
      if (exercise.supersetWith) {
        setType = exercise.order < program.workoutDays[day-1].exercises.find(e => e.exerciseId === exercise.supersetWith)?.order
          ? 'superset_a1'
          : 'superset_a2';
      } else if (exercise.sets.some(s => s.type === 'heavy')) {
        setType = 'heavy';
      } else if (exercise.sets.some(s => s.type === 'dropset')) {
        setType = 'dropset';
      }

      // Get target reps and RPE from first working set
      const firstWorking = exercise.sets.find(s => s.type !== 'warmup');
      const targetReps = firstWorking?.reps || '8-12';
      const targetRpe = firstWorking?.rpe || 8;

      insertWorkoutPlan.run(
        week,
        day,
        dayName,
        exercise.exerciseId,
        exercise.order,
        warmupSets,
        workingSets,
        targetReps,
        targetRpe,
        120,
        setType
      );
    }
    console.log(`  Week ${week}, Day ${day}: ${dayName}`);
  }
}

// Insert initial progression data for week 1
const insertProgression = db.prepare(`
  INSERT INTO progression (exercise_id, week, day, set_type, calculated_weight, reason, created_at)
  VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
`);

console.log('\nSeeding initial progression...');
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
          'Początkowy ciężar z programu'
        );
      }
    }
  }
}

console.log('\n✅ Database seeded successfully!');
console.log(`   Database location: ${join(__dirname, '../workout.db')}`);

db.close();
