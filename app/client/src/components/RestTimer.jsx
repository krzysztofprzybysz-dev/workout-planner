import { useEffect, useRef, useCallback } from 'react';
import useRestTimer from '../hooks/useRestTimer';

export default function RestTimer({ duration, isActive, onComplete, onDismiss }) {
  const {
    timeRemaining,
    totalDuration,
    isRunning,
    isPaused,
    startTimer,
    pauseTimer,
    resumeTimer,
    resetTimer,
    extendTimer
  } = useRestTimer();

  const hasCompletedRef = useRef(false);

  // Auto-start when isActive becomes true
  useEffect(() => {
    if (isActive && duration > 0) {
      hasCompletedRef.current = false;
      startTimer(duration);
    } else if (!isActive) {
      resetTimer();
    }
  }, [isActive, duration, startTimer, resetTimer]);

  // Play beep and call onComplete when timer reaches 0
  const playBeep = useCallback(() => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);

      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.2);
    } catch {
      // Audio not supported or blocked - silently ignore
    }
  }, []);

  useEffect(() => {
    if (isActive && timeRemaining === 0 && totalDuration > 0 && !isRunning && !hasCompletedRef.current) {
      hasCompletedRef.current = true;
      playBeep();
      onComplete?.();
    }
  }, [timeRemaining, totalDuration, isRunning, isActive, onComplete, playBeep]);

  if (!isActive) return null;

  // Format time as MM:SS
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;
  const timeDisplay = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  // Calculate progress percentage (1 = full, 0 = empty)
  const progress = totalDuration > 0 ? timeRemaining / totalDuration : 0;

  // Color transitions based on remaining percentage
  let progressColor, textColor;
  if (progress > 0.5) {
    progressColor = 'stroke-green-500';
    textColor = 'text-green-400';
  } else if (progress > 0.25) {
    progressColor = 'stroke-yellow-500';
    textColor = 'text-yellow-400';
  } else {
    progressColor = 'stroke-red-500';
    textColor = 'text-red-400';
  }

  // SVG circle calculations (compact mini circle)
  const size = 80;
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashoffset = circumference * (1 - progress);

  const handleDismiss = () => {
    resetTimer();
    onDismiss?.();
  };

  return (
    <div className="fixed bottom-20 left-4 right-4 z-40 p-3 bg-gray-800/95 backdrop-blur-sm rounded-xl border border-gray-700 shadow-lg shadow-black/40">
      <div className="flex items-center gap-3">
        {/* Mini circular countdown */}
        <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
          <svg
            width={size}
            height={size}
            className="transform -rotate-90"
          >
            {/* Background circle */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={strokeWidth}
              className="text-gray-700"
            />
            {/* Progress circle */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              className={progressColor}
              strokeDasharray={circumference}
              strokeDashoffset={dashoffset}
              style={{ transition: 'stroke-dashoffset 1s linear' }}
            />
          </svg>
          {/* Time display centered over the mini SVG */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-lg font-mono font-bold ${textColor}`}>
              {timeDisplay}
            </span>
          </div>
        </div>

        {/* Label */}
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium text-gray-300">Odpoczynek</span>
          <span className="text-xs text-gray-500">{isPaused ? 'Pauza' : 'Trwa...'}</span>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Control buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Pause / Resume button */}
          <button
            onClick={isPaused ? resumeTimer : pauseTimer}
            className="w-10 h-10 rounded-full bg-gray-700 hover:bg-gray-600 active:bg-gray-500 flex items-center justify-center transition-colors"
            aria-label={isPaused ? 'Wznow' : 'Pauza'}
          >
            {isPaused ? (
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            )}
          </button>

          {/* +30s button */}
          <button
            onClick={() => extendTimer(30)}
            className="h-10 px-3 rounded-full bg-gray-700 hover:bg-gray-600 active:bg-gray-500 flex items-center justify-center text-xs font-medium text-white transition-colors"
            aria-label="Dodaj 30 sekund"
          >
            +30s
          </button>

          {/* Dismiss button */}
          <button
            onClick={handleDismiss}
            className="w-10 h-10 rounded-full bg-gray-700 hover:bg-red-600/80 active:bg-red-700 flex items-center justify-center transition-colors"
            aria-label="Zamknij timer"
          >
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
