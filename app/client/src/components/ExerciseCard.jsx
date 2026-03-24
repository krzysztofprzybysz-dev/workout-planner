import { useState, useCallback, useMemo } from 'react';
import SetRow from './SetRow';
import PRBadge from './PRBadge';
import RestTimer from './RestTimer';
import { calculateDerivedWeights } from '../utils/weightCalculator';

export default function ExerciseCard({
  exercise,
  exerciseNumber,
  onSetComplete,
  getSetLog,
  isSuperset
}) {
  const [expanded, setExpanded] = useState(false);
  const [latestPR, setLatestPR] = useState(null);
  const [showTimer, setShowTimer] = useState(false);
  const [derivedWeights, setDerivedWeights] = useState({});

  // Determine which set type is "primary" (drives warmup/backoff/dropset calculations)
  const primarySetType = useMemo(() => {
    const types = exercise.sets.map(s => s.type);
    if (types.includes('heavy')) return 'heavy';
    if (types.includes('working')) return 'working';
    return null;
  }, [exercise.sets]);

  // Count completed working sets
  const workingSets = exercise.sets.filter(s => s.type !== 'warmup');
  const completedSets = workingSets.filter((set) => {
    const originalIdx = exercise.sets.indexOf(set);
    const setNumber = exercise.sets.filter((s, i) => s.type !== 'warmup' && i <= originalIdx).length;
    const log = getSetLog(exercise.exerciseId, setNumber, set.type);
    return log?.completed;
  }).length;

  const isComplete = completedSets === workingSets.length && workingSets.length > 0;

  // Called by SetRow when user changes weight in a primary set
  const handleWeightChange = useCallback((setType, newWeight) => {
    if (!primarySetType) return;
    // Only recalculate if this is the primary set type
    if (setType === primarySetType) {
      const derived = calculateDerivedWeights(exercise.name, newWeight, primarySetType);
      setDerivedWeights(derived);
    }
  }, [primarySetType, exercise.name]);

  // Determine the derived weight for a specific set based on its type and index
  const getDerivedWeight = useCallback((setType, warmupIndex) => {
    if (setType === 'warmup') {
      // warmupIndex 1 = first warmup (50%), 2 = second warmup (70%)
      return warmupIndex === 1 ? derivedWeights.warmup1 : derivedWeights.warmup2;
    }
    if (setType === 'backoff') return derivedWeights.backoff;
    if (setType === 'dropset') return derivedWeights.dropset;
    return undefined; // primary sets don't get derived weight
  }, [derivedWeights]);

  return (
    <div className={`card mb-4 ${isSuperset ? 'border-l-4 border-yellow-500' : ''}`}>
      <PRBadge prResult={latestPR} onDismiss={() => setLatestPR(null)} />
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

            // Calculate warmup index for derived weight lookup
            const warmupIndex = set.type === 'warmup' ? setNumber : 0;
            const derivedWeight = getDerivedWeight(set.type, warmupIndex);

            // Is this a primary set (heavy or first working when no heavy)?
            const isPrimary = set.type === primarySetType;

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
                derivedWeight={derivedWeight}
                isPrimary={isPrimary}
                onWeightChange={handleWeightChange}
                onComplete={async (data) => {
                  const result = await onSetComplete(exercise.exerciseId, setNumber, set.type, data);
                  if (result?.pr?.isPR) {
                    setLatestPR(result.pr);
                  }
                  // Show rest timer if there are more working sets remaining after this one
                  if (data.completed && set.type !== 'warmup') {
                    const newCompletedCount = workingSets.filter((ws) => {
                      const wsOrigIdx = exercise.sets.indexOf(ws);
                      const wsSetNum = exercise.sets.filter((s, i) => s.type !== 'warmup' && i <= wsOrigIdx).length;
                      if (ws === set && wsSetNum === setNumber) return true;
                      const log = getSetLog(exercise.exerciseId, wsSetNum, ws.type);
                      return log?.completed;
                    }).length;
                    if (newCompletedCount < workingSets.length) {
                      setShowTimer(true);
                    }
                  }
                }}
              />
            );
          })}

          {/* Rest Timer */}
          <RestTimer
            duration={exercise.exerciseType === 'compound' ? 120 : 90}
            isActive={showTimer}
            onComplete={() => setShowTimer(false)}
            onDismiss={() => setShowTimer(false)}
          />
        </div>
      )}
    </div>
  );
}
