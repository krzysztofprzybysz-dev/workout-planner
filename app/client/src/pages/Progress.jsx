import { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function Progress() {
  const [exercises, setExercises] = useState([]);
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  // Ladowanie cwiczen
  useEffect(() => {
    const loadExercises = async () => {
      try {
        const allRes = await Promise.all([
          fetch('/api/workouts/1/1'),
          fetch('/api/workouts/1/2'),
          fetch('/api/workouts/1/3')
        ]);
        const allData = await Promise.all(allRes.map(r => r.json()));
        const uniqueExercises = new Map();
        for (const dayData of allData) {
          for (const ex of dayData.exercises) {
            if (!uniqueExercises.has(ex.exerciseId)) {
              uniqueExercises.set(ex.exerciseId, {
                id: ex.exerciseId,
                name: ex.name,
                muscleGroup: ex.muscleGroup
              });
            }
          }
        }
        setExercises(Array.from(uniqueExercises.values()));
      } catch (err) {
        console.error('Failed to load exercises:', err);
      } finally {
        setLoading(false);
      }
    };
    loadExercises();
  }, []);

  useEffect(() => {
    if (!selectedExercise) return;
    const loadHistory = async () => {
      try {
        const res = await fetch(`/api/workouts/exercise/${selectedExercise}/history`);
        const data = await res.json();
        setHistory(data);
      } catch (err) {
        console.error('Failed to load history:', err);
      }
    };
    loadHistory();
  }, [selectedExercise]);

  // Grupowanie po dacie
  const historyByDate = history.reduce((acc, item) => {
    const date = item.finished_at?.split('T')[0];
    if (!date) return acc;
    if (!acc[date]) acc[date] = [];
    acc[date].push(item);
    return acc;
  }, {});

  // Dane do wykresu
  const chartData = Object.entries(historyByDate)
    .slice(-12)
    .map(([date, logs]) => {
      const heavy = logs.find(l => l.set_type === 'heavy');
      const working = logs.find(l => l.set_type === 'working');
      return {
        date: new Date(date).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' }),
        heavy: heavy?.actual_weight || null,
        working: working?.actual_weight || null
      };
    });

  // Statystyki
  const nonWarmup = history.filter(h => h.set_type !== 'warmup');
  const maxWeight = nonWarmup.length > 0 ? Math.max(...nonWarmup.map(h => h.actual_weight || 0)) : 0;
  const sessionCount = Object.keys(historyByDate).length;

  // Rekordy osobiste
  const prs = {
    heavy: nonWarmup.filter(h => h.set_type === 'heavy').sort((a, b) => b.actual_weight - a.actual_weight)[0],
    working: nonWarmup.filter(h => h.set_type === 'working').sort((a, b) => b.actual_weight - a.actual_weight)[0]
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 pb-24">
      <h1 className="text-2xl font-bold text-white mb-6">Postepy</h1>

      {/* Selektor cwiczenia */}
      <select
        value={selectedExercise || ''}
        onChange={(e) => setSelectedExercise(e.target.value ? parseInt(e.target.value) : null)}
        className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white mb-6 focus:ring-2 focus:ring-primary-500"
      >
        <option value="">-- Wybierz cwiczenie --</option>
        {exercises.map(ex => (
          <option key={ex.id} value={ex.id}>{ex.name} ({ex.muscleGroup})</option>
        ))}
      </select>

      {selectedExercise && history.length > 0 && (
        <>
          {/* Statystyki */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="card text-center">
              <p className="text-sm text-gray-400">Max ciezar</p>
              <p className="text-2xl font-bold text-primary-400">{maxWeight} kg</p>
            </div>
            <div className="card text-center">
              <p className="text-sm text-gray-400">Treningow</p>
              <p className="text-2xl font-bold text-green-400">{sessionCount}</p>
            </div>
          </div>

          {/* WYKRES PROGRESJI */}
          {chartData.length > 1 && (
            <div className="card mb-6">
              <h3 className="font-medium text-white mb-4">Progresja ciezarow</h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="heavyGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="workingGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="date" stroke="#9ca3af" fontSize={10} />
                    <YAxis stroke="#9ca3af" fontSize={10} domain={['dataMin - 5', 'dataMax + 5']} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                      labelStyle={{ color: '#9ca3af' }}
                    />
                    <Area type="monotone" dataKey="heavy" stroke="#ef4444" fill="url(#heavyGrad)" strokeWidth={2} connectNulls name="Heavy" />
                    <Area type="monotone" dataKey="working" stroke="#3b82f6" fill="url(#workingGrad)" strokeWidth={2} connectNulls name="Working" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-center gap-4 mt-2 text-xs">
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-500 rounded" />Heavy</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-500 rounded" />Working</span>
              </div>
            </div>
          )}

          {/* Rekordy osobiste */}
          {(prs.heavy || prs.working) && (
            <div className="card mb-6">
              <h3 className="font-medium text-white mb-3 flex items-center gap-2">
                <span className="text-yellow-400">&#127942;</span> Rekordy osobiste
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {prs.heavy && (
                  <div className="bg-red-900/30 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-400">Heavy PR</p>
                    <p className="text-xl font-bold text-red-400">{prs.heavy.actual_weight}kg</p>
                    <p className="text-xs text-gray-500">{prs.heavy.actual_reps} reps</p>
                  </div>
                )}
                {prs.working && (
                  <div className="bg-blue-900/30 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-400">Working PR</p>
                    <p className="text-xl font-bold text-blue-400">{prs.working.actual_weight}kg</p>
                    <p className="text-xs text-gray-500">{prs.working.actual_reps} reps</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Lista ostatnich treningow */}
          <div className="space-y-2">
            <h3 className="font-medium text-white mb-3">Ostatnie treningi</h3>
            {Object.entries(historyByDate).reverse().slice(0, 5).map(([date, logs]) => (
              <div key={date} className="card">
                <p className="text-sm text-gray-400 mb-2">
                  {new Date(date).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })}
                </p>
                {logs.filter(l => l.set_type !== 'warmup').map((log, idx) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span className="text-gray-400 capitalize">{log.set_type}</span>
                    <span className="text-white">
                      {log.actual_weight}kg x {log.actual_reps}
                      {log.rpe && <span className="text-gray-500 ml-1">@{log.rpe}</span>}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      {selectedExercise && history.length === 0 && (
        <div className="text-center py-8">
          <p className="text-gray-400">Brak historii dla tego cwiczenia</p>
        </div>
      )}

      {!selectedExercise && (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <p className="text-gray-400">Wybierz cwiczenie</p>
        </div>
      )}
    </div>
  );
}
