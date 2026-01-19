import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHistory } from '../hooks/useWorkout';

const DAY_NAMES = {
  1: 'Full Body',
  2: 'Upper Body',
  3: 'Lower Body'
};

export default function History() {
  const navigate = useNavigate();
  const { sessions, loading, error, resetAllData } = useHistory();
  const [expandedSession, setExpandedSession] = useState(null);
  const [sessionDetails, setSessionDetails] = useState({});
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetting, setResetting] = useState(false);

  const loadSessionDetails = async (sessionId) => {
    if (sessionDetails[sessionId]) {
      setExpandedSession(expandedSession === sessionId ? null : sessionId);
      return;
    }

    try {
      const res = await fetch(`/api/workouts/session/${sessionId}`);
      const data = await res.json();
      setSessionDetails(prev => ({ ...prev, [sessionId]: data }));
      setExpandedSession(sessionId);
    } catch (err) {
      console.error('Failed to load session details:', err);
    }
  };

  const formatDate = (dateStr) => {
    // Ensure date is parsed as UTC by adding 'Z' suffix if missing
    const date = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
    return date.toLocaleDateString('pl-PL', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDuration = (startedAt, finishedAt) => {
    if (!startedAt || !finishedAt) return null;
    // Ensure dates are parsed as UTC
    const start = new Date(startedAt.endsWith('Z') ? startedAt : startedAt + 'Z');
    const end = new Date(finishedAt.endsWith('Z') ? finishedAt : finishedAt + 'Z');
    const diffMs = end - start;
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`;
  };

  const handleReset = async () => {
    setResetting(true);
    const success = await resetAllData();
    setResetting(false);
    setShowResetModal(false);
    if (success) {
      navigate('/');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-white mb-6">Historia Treningow</h1>

      {sessions.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-gray-400">Brak ukończonych treningów</p>
          <p className="text-gray-500 text-sm mt-1">Rozpocznij pierwszy trening!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <div key={session.id} className="card">
              <button
                onClick={() => loadSessionDetails(session.id)}
                className="w-full text-left"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-semibold text-white">
                        W{session.week}D{session.day}
                      </span>
                      <span className="text-sm text-gray-400">
                        {DAY_NAMES[session.day]}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      {formatDate(session.finished_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-sm text-gray-400">
                        {session.completed_sets}/{session.total_sets} serii
                      </p>
                    </div>
                    <svg
                      className={`w-5 h-5 text-gray-400 transition-transform ${
                        expandedSession === session.id ? 'rotate-180' : ''
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </button>

              {/* Expanded details */}
              {expandedSession === session.id && sessionDetails[session.id] && (
                <div className="mt-4 pt-4 border-t border-gray-700">
                  {/* Statystyki sesji */}
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <div className="bg-gray-700/50 rounded-lg p-2 text-center">
                      <p className="text-lg font-bold text-primary-400">
                        {sessionDetails[session.id].setLogs?.length || 0}
                      </p>
                      <p className="text-xs text-gray-500">Serii</p>
                    </div>
                    <div className="bg-gray-700/50 rounded-lg p-2 text-center">
                      <p className="text-lg font-bold text-green-400">
                        {formatDuration(session.started_at, session.finished_at) || '-'}
                      </p>
                      <p className="text-xs text-gray-500">Czas</p>
                    </div>
                    <div className="bg-gray-700/50 rounded-lg p-2 text-center">
                      <p className="text-lg font-bold text-yellow-400">
                        {(() => {
                          const logs = sessionDetails[session.id].setLogs || [];
                          const tonnage = logs.reduce((sum, l) => sum + ((l.actual_weight || 0) * (l.actual_reps || 0)), 0);
                          return tonnage > 1000 ? `${(tonnage/1000).toFixed(1)}t` : `${tonnage}kg`;
                        })()}
                      </p>
                      <p className="text-xs text-gray-500">Tonnaz</p>
                    </div>
                  </div>

                  {/* Notatki ogolne sesji */}
                  {session.overall_notes && (
                    <div className="mb-4 p-3 bg-gray-700/50 rounded-lg">
                      <p className="text-xs text-gray-400 font-medium mb-1">Notatki z treningu:</p>
                      <p className="text-sm text-gray-300">{session.overall_notes}</p>
                    </div>
                  )}

                  {/* Group sets by exercise */}
                  {(() => {
                    const groupedSets = {};
                    for (const log of sessionDetails[session.id].setLogs || []) {
                      if (!groupedSets[log.exercise_name]) {
                        groupedSets[log.exercise_name] = [];
                      }
                      groupedSets[log.exercise_name].push(log);
                    }

                    return Object.entries(groupedSets).map(([exerciseName, logs]) => (
                      <div key={exerciseName} className="mb-4">
                        <h4 className="font-medium text-white mb-2">{exerciseName}</h4>
                        <div className="space-y-1">
                          {logs.map((log, idx) => (
                            <div key={idx} className="bg-gray-700/50 rounded px-3 py-2 mb-1">
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-400 capitalize">{log.set_type}</span>
                                <span className="text-white">
                                  {log.actual_weight}kg x {log.actual_reps}
                                  {log.rpe && <span className="text-gray-500 ml-2">RPE {log.rpe}</span>}
                                </span>
                              </div>
                              {log.notes && (
                                <p className="text-xs text-gray-500 mt-1 italic">{log.notes}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}

                  {/* AI Analysis - rozszerzona */}
                  {sessionDetails[session.id].ai_analysis && (() => {
                    const analysis = JSON.parse(sessionDetails[session.id].ai_analysis);
                    return (
                      <div className="mt-4 space-y-3">
                        {/* Ogolna analiza */}
                        <div className="p-3 bg-primary-900/30 rounded-lg">
                          <div className="flex items-center gap-2 mb-2">
                            <svg className="w-4 h-4 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                            </svg>
                            <span className="text-sm font-medium text-primary-400">Analiza AI</span>
                          </div>
                          <p className="text-sm text-gray-300">{analysis.analysis}</p>
                        </div>

                        {/* Analiza per cwiczenie */}
                        {analysis.exerciseAnalysis && Object.keys(analysis.exerciseAnalysis).length > 0 && (
                          <div className="space-y-2">
                            {Object.entries(analysis.exerciseAnalysis).map(([exercise, text]) => (
                              <div key={exercise} className="p-2 bg-gray-700/30 rounded-lg">
                                <span className="text-xs font-medium text-gray-400">{exercise}:</span>
                                <p className="text-xs text-gray-500 mt-1">{text}</p>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Rekomendacje na nastepny trening */}
                        {analysis.nextWorkout && Object.keys(analysis.nextWorkout).length > 0 && (
                          <div className="p-3 bg-green-900/20 rounded-lg">
                            <p className="text-xs font-medium text-green-400 mb-2">Rekomendacje:</p>
                            <div className="space-y-1">
                              {Object.entries(analysis.nextWorkout).map(([exercise, rec]) => (
                                <div key={exercise} className="text-xs text-gray-400">
                                  <span className="font-medium">{exercise}: </span>
                                  {rec.heavy_weight && <span className="text-red-400">Heavy {rec.heavy_weight}kg </span>}
                                  {rec.working_weight && <span className="text-blue-400">Working {rec.working_weight}kg </span>}
                                  {rec.backoff_weight && <span className="text-orange-400">Back-off {rec.backoff_weight}kg</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Reset Button */}
      <button
        onClick={() => setShowResetModal(true)}
        className="w-full py-3 mt-6 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-xl text-sm transition-colors"
      >
        🔄 Reset do W1D1 (Dev)
      </button>

      {/* Reset Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="bg-gray-800 rounded-2xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-white mb-4">⚠️ Reset danych</h2>
            <p className="text-gray-400 mb-6">
              Usunie całą historię treningów i zresetuje postęp do W1D1 z domyślnymi wagami.
              Ta operacja jest nieodwracalna!
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowResetModal(false)}
                disabled={resetting}
                className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                Anuluj
              </button>
              <button
                onClick={handleReset}
                disabled={resetting}
                className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {resetting ? 'Resetowanie...' : 'Resetuj'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
