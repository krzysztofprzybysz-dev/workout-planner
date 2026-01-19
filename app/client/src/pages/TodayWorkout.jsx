import { useState } from 'react';
import { useWorkout } from '../hooks/useWorkout';
import WorkoutDay from '../components/WorkoutDay';
import WorkoutSummary from '../components/WorkoutSummary';

export default function TodayWorkout() {
  const {
    workout,
    session,
    loading,
    error,
    startSession,
    logSet,
    finishSession,
    getSetLog
  } = useWorkout();

  const [showSummary, setShowSummary] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [finishing, setFinishing] = useState(false);

  const handleStartWorkout = async () => {
    if (workout) {
      await startSession(workout.week, workout.day);
    }
  };

  const handleSetComplete = (exerciseId, setNumber, setType, data) => {
    logSet(exerciseId, setNumber, setType, data);
  };

  const handleFinishWorkout = async () => {
    setFinishing(true);
    const result = await finishSession('');
    setFinishing(false);

    if (result?.analysis) {
      setAnalysisResult(result.analysis);
      setShowSummary(true);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Ladowanie treningu...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-900/50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Blad</h2>
          <p className="text-gray-400 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="btn-primary"
          >
            Sprobuj ponownie
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4">
      {/* Start workout screen if no active session */}
      {!session && workout && (
        <div className="min-h-screen flex flex-col items-center justify-center -mt-20">
          <div className="text-center">
            <div className="w-20 h-20 bg-primary-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>

            <h1 className="text-2xl font-bold text-white mb-2">
              Gotowy na trening?
            </h1>
            <p className="text-gray-400 mb-2">
              Tydzien {workout.week}, Dzien {workout.day}
            </p>
            <p className="text-lg text-primary-400 mb-8">
              {workout.dayName}
            </p>

            <div className="mb-8 text-left bg-gray-800 rounded-xl p-4 max-w-sm mx-auto">
              <h3 className="font-medium text-white mb-2">Dzisiejszy plan:</h3>
              <ul className="space-y-1 text-sm text-gray-400">
                {workout.exercises.map((ex, idx) => (
                  <li key={ex.exerciseId} className="flex items-center gap-2">
                    <span className="w-5 h-5 bg-gray-700 rounded text-xs flex items-center justify-center">
                      {idx + 1}
                    </span>
                    {ex.name}
                  </li>
                ))}
              </ul>
            </div>

            <button
              onClick={handleStartWorkout}
              className="btn-primary text-lg px-8 py-4"
            >
              Rozpocznij Trening
            </button>
          </div>
        </div>
      )}

      {/* Active workout */}
      {session && workout && (
        <>
          <WorkoutDay
            workout={workout}
            session={session}
            onSetComplete={handleSetComplete}
            getSetLog={getSetLog}
            onFinish={handleFinishWorkout}
          />

          {finishing && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-white">Analizowanie treningu...</p>
              </div>
            </div>
          )}
        </>
      )}

      {/* Summary modal */}
      {showSummary && (
        <WorkoutSummary
          analysis={analysisResult}
          onClose={() => {
            setShowSummary(false);
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
