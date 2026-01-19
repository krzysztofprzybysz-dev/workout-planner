import { useState, useEffect } from 'react';

const SET_TYPE_LABELS = {
  warmup: 'Rozgrzewka',
  heavy: 'Heavy',
  backoff: 'Back-off',
  working: 'Working',
  dropset: 'Dropset'
};

const SET_TYPE_COLORS = {
  warmup: 'border-gray-600 bg-gray-700/50',
  heavy: 'border-red-600 bg-red-900/30',
  backoff: 'border-orange-600 bg-orange-900/30',
  working: 'border-blue-600 bg-blue-900/30',
  dropset: 'border-purple-600 bg-purple-900/30'
};

export default function SetRow({
  setNumber,
  setType,
  targetWeight,
  targetReps,
  notes,
  lastResult,
  onComplete,
  initialData,
  isActive
}) {
  const isWarmup = setType === 'warmup';

  // Parse target reps (handle ranges like "8-10" by taking first number)
  const parsedTargetReps = parseInt(String(targetReps).split('-')[0]) || 0;

  const [weight, setWeight] = useState(initialData?.weight ?? targetWeight ?? '');
  const [reps, setReps] = useState(initialData?.reps ?? (isWarmup ? parsedTargetReps : '') ?? '');
  const [rpe, setRpe] = useState(initialData?.rpe ?? null);
  const [completed, setCompleted] = useState(initialData?.completed ?? false);

  const showRpeSelector = !isWarmup && (setType === 'heavy' || setType === 'working' || setType === 'backoff');

  useEffect(() => {
    if (initialData) {
      setWeight(initialData.weight ?? targetWeight ?? '');
      setReps(initialData.reps ?? (isWarmup ? parsedTargetReps : '') ?? '');
      setRpe(initialData.rpe ?? null);
      setCompleted(initialData.completed ?? false);
    }
  }, [initialData, targetWeight, isWarmup, parsedTargetReps]);

  const handleComplete = () => {
    if (isWarmup) {
      setCompleted(!completed);
      // Ensure weight and reps are proper numbers for warmup sets
      const parsedWeight = parseFloat(targetWeight) || 0;
      // Handle rep ranges like "8-10" by taking the first number
      const parsedReps = parseInt(String(targetReps).split('-')[0]) || 0;
      onComplete({
        weight: parsedWeight,
        reps: parsedReps,
        rpe: null,
        targetWeight: parsedWeight,
        targetReps: parsedReps,
        completed: !completed
      });
    } else if (weight && reps) {
      setCompleted(true);
      onComplete({
        weight: parseFloat(weight),
        reps: parseInt(reps),
        rpe,
        targetWeight,
        targetReps,
        completed: true
      });
    }
  };

  const handleWeightChange = (delta) => {
    const current = parseFloat(weight) || 0;
    const newWeight = Math.max(0, current + delta);
    setWeight(newWeight);
  };

  const handleRepsChange = (delta) => {
    const current = parseInt(reps) || 0;
    const newReps = Math.max(0, current + delta);
    setReps(newReps);
  };

  return (
    <div className={`border-l-4 rounded-r-lg p-3 mb-2 ${SET_TYPE_COLORS[setType]} ${completed ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-400">
            {SET_TYPE_LABELS[setType]} {setNumber}
          </span>
          {lastResult && (
            <span className="text-xs text-gray-500">
              (Poprzednio: {lastResult.weight}kg x {lastResult.reps})
            </span>
          )}
        </div>
        <span className="text-xs text-gray-500">
          Cel: {targetWeight}kg x {targetReps}
        </span>
      </div>

      {isWarmup ? (
        <div className="space-y-3">
          {/* Weight Input for Warmup */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400 w-16">Ciężar:</span>
            <button
              onClick={() => handleWeightChange(-2.5)}
              className="w-10 h-10 rounded-lg bg-gray-700 hover:bg-gray-600 active:bg-gray-500 flex items-center justify-center text-xl font-bold"
            >
              -
            </button>
            <input
              type="number"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="input-field w-20 text-center"
              step="0.5"
            />
            <span className="text-gray-400">kg</span>
            <button
              onClick={() => handleWeightChange(2.5)}
              className="w-10 h-10 rounded-lg bg-gray-700 hover:bg-gray-600 active:bg-gray-500 flex items-center justify-center text-xl font-bold"
            >
              +
            </button>
          </div>

          {/* Reps Input for Warmup */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400 w-16">Powt.:</span>
            <button
              onClick={() => handleRepsChange(-1)}
              className="w-10 h-10 rounded-lg bg-gray-700 hover:bg-gray-600 active:bg-gray-500 flex items-center justify-center text-xl font-bold"
            >
              -
            </button>
            <input
              type="number"
              value={reps}
              onChange={(e) => setReps(e.target.value)}
              className="input-field w-20 text-center"
            />
            <span className="text-gray-400 w-8"></span>
            <button
              onClick={() => handleRepsChange(1)}
              className="w-10 h-10 rounded-lg bg-gray-700 hover:bg-gray-600 active:bg-gray-500 flex items-center justify-center text-xl font-bold"
            >
              +
            </button>
          </div>

          {/* Quick Complete & Save Buttons for Warmup */}
          <div className="flex gap-2">
            <button
              onClick={() => {
                // Quick complete with default values
                const parsedWeight = parseFloat(targetWeight) || 0;
                const parsedReps = parseInt(String(targetReps).split('-')[0]) || 0;
                setWeight(parsedWeight);
                setReps(parsedReps);
                setCompleted(true);
                onComplete({
                  weight: parsedWeight,
                  reps: parsedReps,
                  rpe: null,
                  targetWeight: parsedWeight,
                  targetReps: parsedReps,
                  completed: true
                });
              }}
              className={`flex-1 py-3 rounded-lg font-medium transition-colors ${
                completed
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-600 hover:bg-gray-500 text-white'
              }`}
            >
              {completed ? '✓ Wykonano' : `Szybko (${targetWeight}kg)`}
            </button>
            {!completed && (
              <button
                onClick={() => {
                  const parsedWeight = parseFloat(weight) || parseFloat(targetWeight) || 0;
                  const parsedReps = parseInt(reps) || parseInt(String(targetReps).split('-')[0]) || 0;
                  setCompleted(true);
                  onComplete({
                    weight: parsedWeight,
                    reps: parsedReps,
                    rpe: null,
                    targetWeight: parseFloat(targetWeight) || 0,
                    targetReps: parseInt(String(targetReps).split('-')[0]) || 0,
                    completed: true
                  });
                }}
                disabled={!weight && !targetWeight}
                className="flex-1 py-3 rounded-lg font-medium transition-colors bg-primary-600 hover:bg-primary-700 text-white"
              >
                Zapisz
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Weight Input */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400 w-16">Ciężar:</span>
            <button
              onClick={() => handleWeightChange(-2.5)}
              className="w-10 h-10 rounded-lg bg-gray-700 hover:bg-gray-600 active:bg-gray-500 flex items-center justify-center text-xl font-bold"
            >
              -
            </button>
            <input
              type="number"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="input-field w-20 text-center"
              step="0.5"
            />
            <span className="text-gray-400">kg</span>
            <button
              onClick={() => handleWeightChange(2.5)}
              className="w-10 h-10 rounded-lg bg-gray-700 hover:bg-gray-600 active:bg-gray-500 flex items-center justify-center text-xl font-bold"
            >
              +
            </button>
          </div>

          {/* Reps Input */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400 w-16">Powt.:</span>
            <button
              onClick={() => handleRepsChange(-1)}
              className="w-10 h-10 rounded-lg bg-gray-700 hover:bg-gray-600 active:bg-gray-500 flex items-center justify-center text-xl font-bold"
            >
              -
            </button>
            <input
              type="number"
              value={reps}
              onChange={(e) => setReps(e.target.value)}
              className="input-field w-20 text-center"
            />
            <span className="text-gray-400 w-8"></span>
            <button
              onClick={() => handleRepsChange(1)}
              className="w-10 h-10 rounded-lg bg-gray-700 hover:bg-gray-600 active:bg-gray-500 flex items-center justify-center text-xl font-bold"
            >
              +
            </button>
          </div>

          {/* RPE Selector */}
          {showRpeSelector && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400 w-16">RPE:</span>
              <div className="flex gap-1">
                {[6, 7, 8, 9, 10].map((value) => (
                  <button
                    key={value}
                    onClick={() => setRpe(value)}
                    className={`w-10 h-10 rounded-lg font-medium transition-colors ${
                      rpe === value
                        ? value >= 9
                          ? 'bg-red-600 text-white'
                          : value >= 8
                          ? 'bg-orange-600 text-white'
                          : 'bg-green-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Complete Button */}
          <button
            onClick={handleComplete}
            disabled={!weight || !reps}
            className={`w-full py-3 rounded-lg font-medium transition-colors ${
              completed
                ? 'bg-green-600 text-white'
                : weight && reps
                ? 'bg-primary-600 hover:bg-primary-700 text-white'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            {completed ? 'Wykonano' : 'Zapisz serie'}
          </button>
        </div>
      )}

      {notes && (
        <p className="text-xs text-gray-500 mt-2 italic">{notes}</p>
      )}
    </div>
  );
}
