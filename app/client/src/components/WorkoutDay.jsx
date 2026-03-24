import { useState } from 'react';
import ExerciseCard from './ExerciseCard';

export default function WorkoutDay({
  workout,
  onSetComplete,
  getSetLog,
  onFinish,
  session
}) {
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);

  if (!workout) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-gray-400">Ladowanie treningu...</div>
      </div>
    );
  }

  // Calculate total progress
  const totalWorkingSets = workout.exercises.reduce((acc, ex) => {
    return acc + ex.sets.filter(s => s.type !== 'warmup').length;
  }, 0);

  const completedWorkingSets = workout.exercises.reduce((acc, ex) => {
    const workingSets = ex.sets.filter(s => s.type !== 'warmup');
    const completed = workingSets.filter((set, idx) => {
      // Use idx + 1 as setNumber (consistent with ExerciseCard)
      const log = getSetLog(ex.exerciseId, idx + 1, set.type);
      return log?.completed;
    }).length;
    return acc + completed;
  }, 0);

  const progress = totalWorkingSets > 0 ? (completedWorkingSets / totalWorkingSets) * 100 : 0;
  const isComplete = completedWorkingSets === totalWorkingSets && totalWorkingSets > 0;

  return (
    <div className="pb-4">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-900 pt-4 pb-3 px-4 -mx-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-xl font-bold text-white">
              Tydzien {workout.week}, Dzien {workout.day}
            </h1>
            <p className="text-sm text-gray-400">{workout.dayName}</p>
          </div>
          {session && (
            <span className="text-xs bg-green-600 text-white px-2 py-1 rounded">
              Aktywny
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div className="mt-3">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Postep</span>
            <span>{completedWorkingSets}/{totalWorkingSets} serii</span>
          </div>
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                isComplete ? 'bg-green-500' : 'bg-primary-500'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Exercise list */}
      <div className="mt-4 space-y-4">
        {workout.exercises.map((exercise, index) => (
          <ExerciseCard
            key={`${exercise.exerciseId}-${index}`}
            exercise={exercise}
            exerciseNumber={index + 1}
            onSetComplete={onSetComplete}
            getSetLog={getSetLog}
            isSuperset={!!exercise.supersetWith}
          />
        ))}
      </div>

      {/* Finish button */}
      {session && (
        <div className="mt-6 px-4">
          <button
            onClick={() => {
              if (isComplete) {
                onFinish();
              } else {
                setShowFinishConfirm(true);
              }
            }}
            className={`w-full py-4 rounded-xl font-bold text-lg transition-colors ${
              isComplete
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-yellow-600 hover:bg-yellow-700 text-white'
            }`}
          >
            {isComplete ? 'Zakoncz Trening' : `Zakoncz Trening (${completedWorkingSets}/${totalWorkingSets} serii)`}
          </button>
        </div>
      )}

      {/* Finish confirmation modal for incomplete sets */}
      {showFinishConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="bg-gray-800 rounded-2xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-white mb-4">Zakonczyc trening?</h2>
            <p className="text-gray-400 mb-6">
              Nie wszystkie serie ukonczone ({completedWorkingSets}/{totalWorkingSets}). Zakonczyc trening?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowFinishConfirm(false)}
                className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                Nie
              </button>
              <button
                onClick={() => {
                  setShowFinishConfirm(false);
                  onFinish();
                }}
                className="flex-1 py-3 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors"
              >
                Tak
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
