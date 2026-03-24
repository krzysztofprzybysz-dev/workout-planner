import { useState, useEffect, useRef, useCallback } from 'react';

export default function useRestTimer() {
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const intervalRef = useRef(null);

  // Clear any running interval
  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Start a new countdown timer
  const startTimer = useCallback((seconds) => {
    clearTimer();
    setTotalDuration(seconds);
    setTimeRemaining(seconds);
    setIsRunning(true);
    setIsPaused(false);
  }, [clearTimer]);

  // Pause the timer
  const pauseTimer = useCallback(() => {
    if (isRunning && !isPaused) {
      clearTimer();
      setIsPaused(true);
    }
  }, [isRunning, isPaused, clearTimer]);

  // Resume the timer
  const resumeTimer = useCallback(() => {
    if (isRunning && isPaused) {
      setIsPaused(false);
    }
  }, [isRunning, isPaused]);

  // Stop and reset the timer
  const resetTimer = useCallback(() => {
    clearTimer();
    setTimeRemaining(0);
    setTotalDuration(0);
    setIsRunning(false);
    setIsPaused(false);
  }, [clearTimer]);

  // Add more time to the timer
  const extendTimer = useCallback((seconds = 30) => {
    setTimeRemaining((prev) => prev + seconds);
    setTotalDuration((prev) => prev + seconds);
  }, []);

  // Interval effect - runs countdown when active and not paused
  useEffect(() => {
    if (isRunning && !isPaused) {
      intervalRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            clearTimer();
            setIsRunning(false);
            setIsPaused(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => clearTimer();
  }, [isRunning, isPaused, clearTimer]);

  return {
    timeRemaining,
    totalDuration,
    isRunning,
    isPaused,
    startTimer,
    pauseTimer,
    resumeTimer,
    resetTimer,
    extendTimer
  };
}
