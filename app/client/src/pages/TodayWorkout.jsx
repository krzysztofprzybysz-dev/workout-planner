import { useState } from 'react';
import { useWorkout } from '../hooks/useWorkout';
import WorkoutDay from '../components/WorkoutDay';
import WorkoutSummary from '../components/WorkoutSummary';

export default function TodayWorkout() {
  const {
    currentState,
    workout,
    session,
    loading,
    error,
    startSession,
    logSet,
    finishSession,
    getSetLog,
    fetchWorkout,
    fetchCurrentState
  } = useWorkout();

  const [showSummary, setShowSummary] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState(null);
  const [starting, setStarting] = useState(false);
  const [sessionNotes, setSessionNotes] = useState('');
  const [notesExpanded, setNotesExpanded] = useState(false);

  const handleStartWorkout = async () => {
    if (workout && !starting) {
      setStarting(true);
      try {
        await startSession(workout.week, workout.day);
      } finally {
        setStarting(false);
      }
    }
  };

  const handleSetComplete = (exerciseId, setNumber, setType, data) => {
    return logSet(exerciseId, setNumber, setType, data);
  };

  const handleFinishWorkout = async () => {
    setFinishing(true);
    setFinishError(null);

    try {
      const result = await finishSession(sessionNotes);
      setSessionNotes('');
      setFinishing(false);

      if (result === null) {
        setFinishError('Nie udalo sie zakonczyc treningu. Sprobuj ponownie.');
        return;
      }

      if (result?.analysis) {
        setAnalysisResult(result.analysis);
        setShowSummary(true);
      } else {
        // Workout finished but no analysis - still show success and refresh state
        setShowSummary(true);
        setAnalysisResult(null);
      }
    } catch (err) {
      setFinishing(false);
      setFinishError(err.message || 'Wystapil nieoczekiwany blad');
    }
  };

  const handleCloseSummary = async () => {
    setShowSummary(false);
    setAnalysisResult(null);
    // Refresh state instead of full page reload
    const state = await fetchCurrentState();
    if (state) {
      await fetchWorkout(state.currentWeek, state.currentDay);
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

            {workout.week === 1 && workout.day === 1 && currentState?.completedSessions > 0 && (
              <div className="mb-6 max-w-sm mx-auto bg-primary-900/40 border border-primary-600 rounded-xl p-4 text-left">
                <p className="text-primary-300 text-sm font-medium">
                  Nowy cykl programu! Zaczynasz 8-tygodniowy program od poczatku.
                </p>
              </div>
            )}

            <button
              onClick={handleStartWorkout}
              disabled={starting}
              className="btn-primary text-lg px-8 py-4 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {starting ? 'Rozpoczynanie...' : 'Rozpocznij Trening'}
            </button>
          </div>
        </div>
      )}

      {/* Active workout */}
      {session && workout && (
        <>
          {/* Collapsible session notes */}
          <div className="mb-2">
            <button
              onClick={() => setNotesExpanded(!notesExpanded)}
              className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-300 transition-colors"
            >
              <svg
                className={`w-4 h-4 transition-transform ${notesExpanded ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              Notatki do treningu
              {sessionNotes && <span className="w-2 h-2 bg-primary-500 rounded-full" />}
            </button>
            {notesExpanded && (
              <textarea
                value={sessionNotes}
                onChange={(e) => setSessionNotes(e.target.value)}
                placeholder="Notatki do treningu (samopoczucie, kontuzje, zmiany...)"
                rows={3}
                className="mt-2 w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              />
            )}
          </div>

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
                <p className="text-white">Obliczanie progresji...</p>
              </div>
            </div>
          )}
        </>
      )}

      {/* Finish error message */}
      {finishError && !finishing && (
        <div className="fixed bottom-20 left-4 right-4 z-40 bg-red-900/90 text-white rounded-lg p-4 shadow-lg">
          <div className="flex items-center gap-3">
            <svg className="w-6 h-6 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="flex-1">{finishError}</span>
            <button
              onClick={() => setFinishError(null)}
              className="text-red-300 hover:text-white"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Summary modal */}
      {showSummary && (
        <WorkoutSummary
          analysis={analysisResult}
          onClose={handleCloseSummary}
        />
      )}
    </div>
  );
}
