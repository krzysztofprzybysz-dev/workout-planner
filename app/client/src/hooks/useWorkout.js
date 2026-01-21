import { useState, useEffect, useCallback } from 'react';

const API_BASE = '/api';

export function useWorkout() {
  const [currentState, setCurrentState] = useState(null);
  const [workout, setWorkout] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [setLogs, setSetLogs] = useState({});

  // Fetch current workout state
  const fetchCurrentState = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/workouts/current`);
      const data = await res.json();
      setCurrentState(data);
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, []);

  // Fetch workout for specific week/day
  const fetchWorkout = useCallback(async (week, day) => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/workouts/${week}/${day}`);
      const data = await res.json();
      setWorkout(data);
      setError(null);
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Start a new workout session
  const startSession = useCallback(async (week, day) => {
    try {
      const res = await fetch(`${API_BASE}/workouts/session/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week, day })
      });
      const data = await res.json();
      if (res.ok) {
        setSession(data);
        setSetLogs({});
        return data;
      } else {
        // Session already exists
        if (data.sessionId) {
          const sessionRes = await fetch(`${API_BASE}/workouts/session/${data.sessionId}`);
          const sessionData = await sessionRes.json();
          setSession({ sessionId: data.sessionId, week, day });
          // Restore set logs
          const logs = {};
          for (const log of sessionData.setLogs || []) {
            const key = `${log.exercise_id}-${log.set_number}-${log.set_type}`;
            logs[key] = {
              weight: log.actual_weight,
              reps: log.actual_reps,
              rpe: log.rpe,
              notes: log.notes,
              completed: log.completed
            };
          }
          setSetLogs(logs);
          return { sessionId: data.sessionId, week, day };
        }
        throw new Error(data.error);
      }
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, []);

  // Log a set - state is updated AFTER successful server save to prevent data loss
  const logSet = useCallback(async (exerciseId, setNumber, setType, data) => {
    if (!session) return { success: false, error: 'No active session' };

    const key = `${exerciseId}-${setNumber}-${setType}`;

    try {
      const res = await fetch(`${API_BASE}/workouts/session/${session.sessionId}/set`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exerciseId,
          setNumber,
          setType,
          targetWeight: data.targetWeight,
          actualWeight: data.weight,
          targetReps: data.targetReps,
          actualReps: data.reps,
          rpe: data.rpe,
          notes: data.notes,
          completedAt: data.completedAt // For rest time tracking
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Server error: ${res.status}`);
      }

      // Only update local state AFTER successful server save
      setSetLogs(prev => ({
        ...prev,
        [key]: { ...data, completed: true }
      }));

      return { success: true };
    } catch (err) {
      console.error('Failed to log set:', err);
      setError(`Nie udalo sie zapisac serii: ${err.message}`);
      return { success: false, error: err.message };
    }
  }, [session]);

  // Finish workout session
  const finishSession = useCallback(async (notes) => {
    if (!session) return null;

    try {
      await fetch(`${API_BASE}/workouts/session/${session.sessionId}/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes })
      });

      // Trigger analysis
      const analysisRes = await fetch(`${API_BASE}/analysis/workout/${session.sessionId}`, {
        method: 'POST'
      });
      const analysisData = await analysisRes.json();

      setSession(null);
      setSetLogs({});

      return analysisData;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, [session]);

  // Get set log
  const getSetLog = useCallback((exerciseId, setNumber, setType) => {
    const key = `${exerciseId}-${setNumber}-${setType}`;
    return setLogs[key];
  }, [setLogs]);

  // Initial load
  useEffect(() => {
    const init = async () => {
      const state = await fetchCurrentState();
      if (state) {
        await fetchWorkout(state.currentWeek, state.currentDay);
        if (state.activeSession) {
          setSession({
            sessionId: state.activeSession.id,
            week: state.activeSession.week,
            day: state.activeSession.day
          });
          // Restore existing logs
          const sessionRes = await fetch(`${API_BASE}/workouts/session/${state.activeSession.id}`);
          const sessionData = await sessionRes.json();
          const logs = {};
          for (const log of sessionData.setLogs || []) {
            const key = `${log.exercise_id}-${log.set_number}-${log.set_type}`;
            logs[key] = {
              weight: log.actual_weight,
              reps: log.actual_reps,
              rpe: log.rpe,
              notes: log.notes,
              completed: log.completed
            };
          }
          setSetLogs(logs);
        }
      }
    };
    init();
  }, [fetchCurrentState, fetchWorkout]);

  return {
    currentState,
    workout,
    session,
    loading,
    error,
    setLogs,
    fetchWorkout,
    fetchCurrentState,
    startSession,
    logSet,
    finishSession,
    getSetLog
  };
}

export function useHistory() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchHistory = useCallback(async (limit = 20, offset = 0) => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/workouts/history?limit=${limit}&offset=${offset}`);
      const data = await res.json();
      setSessions(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const resetAllData = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/workouts/reset`, { method: 'POST' });
      if (res.ok) {
        setSessions([]);
        return true;
      }
      const data = await res.json();
      setError(data.error || 'Reset failed');
      return false;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { sessions, loading, error, fetchHistory, resetAllData };
}

export function useExerciseHistory(exerciseId) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!exerciseId) return;

    const fetchHistory = async () => {
      try {
        const res = await fetch(`${API_BASE}/workouts/exercise/${exerciseId}/history`);
        const data = await res.json();
        setHistory(data);
      } catch (err) {
        console.error('Failed to fetch exercise history:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [exerciseId]);

  return { history, loading };
}
