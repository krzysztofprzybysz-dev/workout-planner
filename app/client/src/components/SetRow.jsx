import { useState, useEffect, useMemo } from 'react';

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
  progressionReason,
  onComplete,
  initialData,
  derivedWeight,
  isPrimary,
  onWeightChange
}) {
  const isWarmup = setType === 'warmup';
  const isDerived = setType === 'warmup' || setType === 'backoff' || setType === 'dropset';

  const parsedTargetReps = useMemo(() => {
    return parseInt(String(targetReps).split('-')[0]) || 0;
  }, [targetReps]);

  const [weight, setWeight] = useState(initialData?.weight ?? targetWeight ?? '');
  const [reps, setReps] = useState(initialData?.reps ?? (isWarmup ? parsedTargetReps : '') ?? '');
  const [rpe, setRpe] = useState(initialData?.rpe ?? null);
  const [completed, setCompleted] = useState(initialData?.completed ?? false);

  const showRpeSelector = !isWarmup && (setType === 'heavy' || setType === 'working' || setType === 'backoff');

  // RPE required for non-warmup sets that show RPE selector
  const rpeRequired = showRpeSelector && !rpe;
  const canSave = weight && reps && !rpeRequired;

  // Dynamic button text based on what's missing
  const saveButtonText = completed
    ? 'Wykonano'
    : !weight
    ? 'Wpisz ciężar'
    : !reps
    ? 'Wpisz powtórzenia'
    : rpeRequired
    ? 'Wybierz RPE'
    : 'Zapisz serie';

  useEffect(() => {
    if (initialData) {
      setWeight(initialData.weight ?? targetWeight ?? '');
      setReps(initialData.reps ?? (isWarmup ? parsedTargetReps : '') ?? '');
      setRpe(initialData.rpe ?? null);
      setCompleted(initialData.completed ?? false);
    }
  }, [initialData, targetWeight, isWarmup, parsedTargetReps]);

  // Auto-update derived sets when primary weight changes (no sticky override)
  useEffect(() => {
    if (isDerived && derivedWeight != null && !completed) {
      setWeight(derivedWeight);
    }
  }, [derivedWeight, isDerived, completed]);

  const handleComplete = () => {
    const completedAt = new Date().toISOString();

    if (isWarmup) {
      setCompleted(!completed);
      const parsedWeight = parseFloat(weight) || parseFloat(targetWeight) || 0;
      const parsedReps = parseInt(String(targetReps).split('-')[0]) || 0;
      onComplete({
        weight: parsedWeight,
        reps: parsedReps,
        rpe: null,
        targetWeight: parsedWeight,
        targetReps: parsedReps,
        completed: !completed,
        completedAt
      });
    } else if (canSave) {
      setCompleted(true);
      onComplete({
        weight: parseFloat(weight),
        reps: parseInt(reps),
        rpe,
        targetWeight,
        targetReps,
        completed: true,
        completedAt
      });
    }
  };

  const handleWeightChangeByDelta = (delta) => {
    const current = parseFloat(weight) || 0;
    const newWeight = Math.max(0, current + delta);
    setWeight(newWeight);
    if (isPrimary && onWeightChange) onWeightChange(setType, newWeight);
  };

  const handleWeightInput = (value) => {
    const parsed = value === '' ? '' : parseFloat(value) || 0;
    setWeight(parsed);
    if (isPrimary && onWeightChange && parsed) onWeightChange(setType, parsed);
  };

  const handleRepsChange = (delta) => {
    const current = parseInt(reps) || 0;
    const newReps = Math.max(0, current + delta);
    setReps(newReps);
  };

  // Format last result with RPE
  const lastResultText = lastResult
    ? `(Poprzednio: ${lastResult.weight}kg x ${lastResult.reps}${lastResult.rpe ? ` @${lastResult.rpe}` : ''})`
    : null;

  return (
    <div className={`border-l-4 rounded-r-lg p-3 mb-2 ${SET_TYPE_COLORS[setType]} ${completed ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-400">
            {SET_TYPE_LABELS[setType]} {setNumber}
          </span>
          {lastResultText && (
            <span className="text-xs text-gray-500">
              {lastResultText}
            </span>
          )}
        </div>
        <div className="text-right">
          <span className="text-xs text-gray-500">
            Cel: {targetWeight}kg x {targetReps}
          </span>
          {progressionReason && (
            <p className="text-xs text-primary-400/70 mt-0.5 max-w-[200px] truncate" title={progressionReason}>
              {progressionReason}
            </p>
          )}
        </div>
      </div>

      {isWarmup ? (
        <div className="space-y-3">
          {/* Weight Input for Warmup */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400 w-16">Ciężar:</span>
            <button
              onClick={() => handleWeightChangeByDelta(-2.5)}
              className="w-10 h-10 rounded-lg bg-gray-700 hover:bg-gray-600 active:bg-gray-500 flex items-center justify-center text-xl font-bold"
              aria-label="Zmniejsz ciężar"
            >
              -
            </button>
            <input
              type="number"
              value={weight}
              onChange={(e) => handleWeightInput(e.target.value)}
              className="input-field w-20 text-center"
              step="0.5"
              aria-label="Ciężar w kilogramach"
            />
            <span className="text-gray-400">kg</span>
            <button
              onClick={() => handleWeightChangeByDelta(2.5)}
              className="w-10 h-10 rounded-lg bg-gray-700 hover:bg-gray-600 active:bg-gray-500 flex items-center justify-center text-xl font-bold"
              aria-label="Zwiększ ciężar"
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
              aria-label="Zmniejsz powtórzenia"
            >
              -
            </button>
            <input
              type="number"
              aria-label="Liczba powtórzeń"
              value={reps}
              onChange={(e) => setReps(e.target.value === '' ? '' : parseInt(e.target.value) || 0)}
              className="input-field w-20 text-center"
            />
            <span className="text-gray-400 w-8"></span>
            <button
              onClick={() => handleRepsChange(1)}
              className="w-10 h-10 rounded-lg bg-gray-700 hover:bg-gray-600 active:bg-gray-500 flex items-center justify-center text-xl font-bold"
              aria-label="Zwiększ powtórzenia"
            >
              +
            </button>
          </div>

          {/* Quick Complete & Save Buttons for Warmup */}
          <div className="flex gap-2">
            <button
              onClick={() => {
                const parsedWeight = parseFloat(weight) || parseFloat(targetWeight) || 0;
                const parsedReps = parseInt(String(targetReps).split('-')[0]) || 0;
                const completedAt = new Date().toISOString();
                setWeight(parsedWeight);
                setReps(parsedReps);
                setCompleted(true);
                onComplete({
                  weight: parsedWeight,
                  reps: parsedReps,
                  rpe: null,
                  targetWeight: parsedWeight,
                  targetReps: parsedReps,
                  completed: true,
                  completedAt
                });
              }}
              className={`flex-1 py-3 rounded-lg font-medium transition-colors ${
                completed
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-600 hover:bg-gray-500 text-white'
              }`}
            >
              {completed ? '✓ Wykonano' : `Szybko (${weight || targetWeight}kg)`}
            </button>
            {!completed && (
              <button
                onClick={() => {
                  const parsedWeight = parseFloat(weight) || parseFloat(targetWeight) || 0;
                  const parsedReps = parseInt(reps) || parseInt(String(targetReps).split('-')[0]) || 0;
                  const completedAt = new Date().toISOString();
                  setCompleted(true);
                  onComplete({
                    weight: parsedWeight,
                    reps: parsedReps,
                    rpe: null,
                    targetWeight: parseFloat(targetWeight) || 0,
                    targetReps: parseInt(String(targetReps).split('-')[0]) || 0,
                    completed: true,
                    completedAt
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
              onClick={() => handleWeightChangeByDelta(-2.5)}
              className="w-10 h-10 rounded-lg bg-gray-700 hover:bg-gray-600 active:bg-gray-500 flex items-center justify-center text-xl font-bold"
              aria-label="Zmniejsz ciężar"
            >
              -
            </button>
            <input
              type="number"
              value={weight}
              onChange={(e) => handleWeightInput(e.target.value)}
              className="input-field w-20 text-center"
              step="0.5"
              aria-label="Ciężar w kilogramach"
            />
            <span className="text-gray-400">kg</span>
            <button
              onClick={() => handleWeightChangeByDelta(2.5)}
              className="w-10 h-10 rounded-lg bg-gray-700 hover:bg-gray-600 active:bg-gray-500 flex items-center justify-center text-xl font-bold"
              aria-label="Zwiększ ciężar"
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
              aria-label="Zmniejsz powtórzenia"
            >
              -
            </button>
            <input
              type="number"
              value={reps}
              onChange={(e) => setReps(e.target.value === '' ? '' : parseInt(e.target.value) || 0)}
              className="input-field w-20 text-center"
              aria-label="Liczba powtórzeń"
            />
            <span className="text-gray-400 w-8"></span>
            <button
              onClick={() => handleRepsChange(1)}
              className="w-10 h-10 rounded-lg bg-gray-700 hover:bg-gray-600 active:bg-gray-500 flex items-center justify-center text-xl font-bold"
              aria-label="Zwiększ powtórzenia"
            >
              +
            </button>
          </div>

          {/* RPE Selector */}
          {showRpeSelector && (
            <div className="flex items-center gap-2" role="group" aria-label="Wybór RPE">
              <span className={`text-sm w-16 ${rpeRequired && weight && reps ? 'text-yellow-400' : 'text-gray-400'}`}>RPE:</span>
              <div className="flex gap-1">
                {[6, 7, 8, 9, 10].map((value) => (
                  <button
                    key={value}
                    onClick={() => setRpe(value)}
                    aria-label={`RPE ${value}`}
                    aria-pressed={rpe === value}
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
          {completed ? (
            <div className="w-full py-3 rounded-lg bg-green-600 text-white font-medium text-center flex items-center justify-center gap-3">
              <span>Wykonano</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setCompleted(false);
                }}
                className="text-green-200 hover:text-white text-xs underline underline-offset-2 transition-colors"
              >
                Edytuj
              </button>
            </div>
          ) : (
            <button
              onClick={handleComplete}
              disabled={!canSave}
              className={`w-full py-3 rounded-lg font-medium transition-colors ${
                canSave
                  ? 'bg-primary-600 hover:bg-primary-700 text-white'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
            >
              {saveButtonText}
            </button>
          )}
        </div>
      )}

      {notes && (
        <p className="text-xs text-gray-500 mt-2 italic">{notes}</p>
      )}
    </div>
  );
}
