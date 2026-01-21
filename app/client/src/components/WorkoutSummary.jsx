import { useEffect } from 'react';

export default function WorkoutSummary({ analysis, onClose }) {
  // Handle Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!analysis) return null;

  // Check if this is a fallback response (AI error occurred)
  const isFallback = analysis.analysis?.includes('Nie udalo sie') ||
                     analysis.analysis?.includes('blad AI') ||
                     Object.values(analysis.nextWorkout || {}).some(r => r.reason?.includes('Fallback'));

  // Check if we have meaningful data
  const hasExerciseAnalysis = analysis.exerciseAnalysis && Object.keys(analysis.exerciseAnalysis).length > 0;
  const hasNextWorkout = analysis.nextWorkout && Object.keys(analysis.nextWorkout).length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
      role="dialog"
      aria-modal="true"
      aria-labelledby="workout-summary-title"
    >
      <div className="bg-gray-800 rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gray-800 p-4 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <h2 id="workout-summary-title" className="text-xl font-bold text-white">Podsumowanie Treningu</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center"
              aria-label="Zamknij"
            >
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Fallback Warning */}
          {isFallback && (
            <div className="bg-yellow-900/30 border border-yellow-600/50 rounded-xl p-3">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-yellow-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="text-sm text-yellow-300">Analiza AI niedostepna - uzyto poprzednich ciezarow jako fallback.</p>
              </div>
            </div>
          )}

          {/* AI Analysis */}
          <div className={`rounded-xl p-4 ${isFallback ? 'bg-gray-700/30' : 'bg-gray-700/50'}`}>
            <div className="flex items-center gap-2 mb-2">
              <svg className={`w-5 h-5 ${isFallback ? 'text-gray-400' : 'text-primary-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <h3 className="font-semibold text-white">Analiza AI</h3>
            </div>
            <p className="text-gray-300 text-sm">{analysis.analysis}</p>
          </div>

          {/* Per-Exercise Analysis */}
          {analysis.exerciseAnalysis && Object.keys(analysis.exerciseAnalysis).length > 0 && (
            <div className="space-y-2">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
                Analiza cwiczen
              </h3>
              {Object.entries(analysis.exerciseAnalysis).map(([exerciseName, text]) => (
                <div key={exerciseName} className="bg-gray-700/30 rounded-lg p-3">
                  <span className="text-sm font-medium text-gray-300">{exerciseName}</span>
                  <p className="text-xs text-gray-400 mt-1">{text}</p>
                </div>
              ))}
            </div>
          )}

          {/* No Recommendations Warning */}
          {!hasNextWorkout && !isFallback && (
            <div className="bg-gray-700/30 border border-gray-600 rounded-xl p-3">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-gray-400">Brak rekomendacji progresji - utrzymaj obecne ciezary.</p>
              </div>
            </div>
          )}

          {/* Next Workout Recommendations */}
          {hasNextWorkout && (
            <div className="space-y-3">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
                Progresja na nastepny trening
              </h3>

              {Object.entries(analysis.nextWorkout).map(([exerciseName, recommendation]) => (
                <div key={exerciseName} className="bg-gray-700/50 rounded-xl p-4">
                  <h4 className="font-medium text-white mb-2">{exerciseName}</h4>

                  <div className="space-y-1 text-sm">
                    {recommendation.heavy_weight && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">Heavy:</span>
                        <span className="text-red-400 font-medium">{recommendation.heavy_weight} kg</span>
                      </div>
                    )}
                    {recommendation.backoff_weight && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">Back-off:</span>
                        <span className="text-orange-400 font-medium">{recommendation.backoff_weight} kg</span>
                      </div>
                    )}
                    {recommendation.working_weight && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">Working:</span>
                        <span className="text-blue-400 font-medium">{recommendation.working_weight} kg</span>
                      </div>
                    )}
                    {recommendation.dropset_weight && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">Dropset:</span>
                        <span className="text-purple-400 font-medium">{recommendation.dropset_weight} kg</span>
                      </div>
                    )}
                  </div>

                  {recommendation.reason && (
                    <p className="text-xs text-gray-500 mt-2 italic">{recommendation.reason}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Close button */}
          <button
            onClick={onClose}
            className="w-full py-3 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-xl transition-colors"
          >
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
}
