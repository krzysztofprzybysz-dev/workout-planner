import { useState } from 'react';
import SetRow from './SetRow';

export default function ExerciseCard({
  exercise,
  exerciseNumber,
  onSetComplete,
  getSetLog,
  isSuperset
}) {
  const [expanded, setExpanded] = useState(false);
  const [exerciseNotes, setExerciseNotes] = useState('');

  // Count completed working sets (use same setNumber logic as SetRow rendering)
  const workingSets = exercise.sets.filter(s => s.type !== 'warmup');
  const completedSets = workingSets.filter((set) => {
    // Find original index in full sets array and calculate setNumber consistently
    const originalIdx = exercise.sets.indexOf(set);
    const setNumber = exercise.sets.filter((s, i) => s.type !== 'warmup' && i <= originalIdx).length;
    const log = getSetLog(exercise.exerciseId, setNumber, set.type);
    return log?.completed;
  }).length;

  const isComplete = completedSets === workingSets.length && workingSets.length > 0;

  return (
    <div className={`card mb-4 ${isSuperset ? 'border-l-4 border-yellow-500' : ''}`}>
      {/* Header */}
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
            isComplete ? 'bg-green-600' : 'bg-gray-700'
          }`}>
            {isComplete ? (
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              exerciseNumber
            )}
          </div>
          <div>
            <h3 className="font-semibold text-white">
              {exercise.name}
              {isSuperset && (
                <span className="ml-2 text-xs bg-yellow-600 text-white px-2 py-0.5 rounded">
                  Superseria
                </span>
              )}
            </h3>
            <p className="text-sm text-gray-400">{exercise.muscleGroup}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">
            {completedSets}/{workingSets.length}
          </span>
          <svg
            className={`w-5 h-5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Notes/tips */}
      {exercise.notes && expanded && (
        <div className="mt-3 p-2 bg-gray-700/50 rounded-lg">
          <p className="text-xs text-gray-400">{exercise.notes}</p>
        </div>
      )}

      {/* Sets */}
      {expanded && (
        <div className="mt-4 space-y-2">
          {exercise.sets.map((set, idx) => {
            const setNumber = set.type === 'warmup'
              ? exercise.sets.filter((s, i) => s.type === 'warmup' && i <= idx).length
              : exercise.sets.filter((s, i) => s.type !== 'warmup' && i <= idx).length;

            const existingLog = getSetLog(exercise.exerciseId, setNumber, set.type);

            return (
              <SetRow
                key={`${set.type}-${idx}`}
                setNumber={setNumber}
                setType={set.type}
                targetWeight={set.targetWeight}
                targetReps={set.reps}
                notes={set.notes}
                lastResult={set.lastResult}
                progressionReason={set.progressionReason}
                initialData={existingLog}
                onComplete={(data) => onSetComplete(exercise.exerciseId, setNumber, set.type, data)}
              />
            );
          })}

          {/* Exercise notes input */}
          <div className="mt-3">
            <input
              type="text"
              value={exerciseNotes}
              onChange={(e) => setExerciseNotes(e.target.value)}
              placeholder="Notatki do cwiczenia..."
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
      )}
    </div>
  );
}
