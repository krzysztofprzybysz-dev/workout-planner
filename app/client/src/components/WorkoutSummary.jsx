export default function WorkoutSummary({ analysis, onClose }) {
  if (!analysis) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
      <div className="bg-gray-800 rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gray-800 p-4 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">Podsumowanie Treningu</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center"
            >
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* AI Analysis */}
          <div className="bg-gray-700/50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <h3 className="font-semibold text-white">Analiza AI</h3>
            </div>
            <p className="text-gray-300 text-sm">{analysis.analysis}</p>
          </div>

          {/* Next Workout Recommendations */}
          {analysis.nextWorkout && Object.keys(analysis.nextWorkout).length > 0 && (
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
