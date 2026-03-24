import { useEffect } from 'react';

const PR_TYPE_LABELS = {
  max_weight: 'Nowy rekord wagi!',
  max_reps_at_weight: 'Nowy rekord powtorzen!',
  best_e1rm: 'Nowe szacowane 1RM!'
};

export default function PRBadge({ prResult, onDismiss }) {
  useEffect(() => {
    if (!prResult?.isPR) return;

    const timer = setTimeout(() => {
      onDismiss?.();
    }, 4000);

    return () => clearTimeout(timer);
  }, [prResult, onDismiss]);

  if (!prResult?.isPR) return null;

  return (
    <div className="animate-pr-appear fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-900 border-2 border-yellow-500 rounded-xl px-5 py-4 shadow-2xl shadow-yellow-500/20 max-w-sm w-[90vw]">
      <div className="flex items-center gap-3">
        <span className="text-3xl animate-bounce">&#127942;</span>
        <div>
          {prResult.details?.map((detail, idx) => (
            <div key={idx} className="mb-1 last:mb-0">
              <p className="text-yellow-400 font-bold text-sm">
                {PR_TYPE_LABELS[detail.type] || 'Nowy rekord!'}
              </p>
              <p className="text-gray-300 text-xs">
                {detail.type === 'max_weight' && `${detail.value} kg`}
                {detail.type === 'max_reps_at_weight' && `${detail.value} powtorzen`}
                {detail.type === 'best_e1rm' && `e1RM: ${detail.value} kg`}
                {detail.previous != null && (
                  <span className="text-gray-500 ml-1">(poprz. {detail.previous})</span>
                )}
              </p>
            </div>
          ))}
        </div>
      </div>
      <button
        onClick={onDismiss}
        className="absolute top-2 right-2 text-gray-500 hover:text-gray-300 text-sm"
        aria-label="Zamknij"
      >
        &#10005;
      </button>
      <style>{`
        @keyframes pr-appear {
          0% {
            opacity: 0;
            transform: translateX(-50%) scale(0.8);
          }
          50% {
            transform: translateX(-50%) scale(1.05);
          }
          100% {
            opacity: 1;
            transform: translateX(-50%) scale(1);
          }
        }
        .animate-pr-appear {
          animation: pr-appear 0.4s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
