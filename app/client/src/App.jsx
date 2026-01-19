import { Routes, Route, NavLink } from 'react-router-dom';
import TodayWorkout from './pages/TodayWorkout';
import History from './pages/History';
import Progress from './pages/Progress';

function App() {
  return (
    <div className="min-h-screen bg-gray-900 pb-20">
      <Routes>
        <Route path="/" element={<TodayWorkout />} />
        <Route path="/history" element={<History />} />
        <Route path="/progress" element={<Progress />} />
      </Routes>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-gray-800 border-t border-gray-700 px-4 py-2 pb-[max(env(safe-area-inset-bottom),8px)]">
        <div className="flex justify-around items-center max-w-lg mx-auto">
          <NavLink
            to="/"
            className={({ isActive }) =>
              `flex flex-col items-center py-2 px-4 rounded-lg transition-colors ${
                isActive ? 'text-primary-400 bg-gray-700' : 'text-gray-400 hover:text-gray-200'
              }`
            }
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span className="text-xs mt-1">Trening</span>
          </NavLink>

          <NavLink
            to="/history"
            className={({ isActive }) =>
              `flex flex-col items-center py-2 px-4 rounded-lg transition-colors ${
                isActive ? 'text-primary-400 bg-gray-700' : 'text-gray-400 hover:text-gray-200'
              }`
            }
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs mt-1">Historia</span>
          </NavLink>

          <NavLink
            to="/progress"
            className={({ isActive }) =>
              `flex flex-col items-center py-2 px-4 rounded-lg transition-colors ${
                isActive ? 'text-primary-400 bg-gray-700' : 'text-gray-400 hover:text-gray-200'
              }`
            }
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span className="text-xs mt-1">Postepy</span>
          </NavLink>
        </div>
      </nav>
    </div>
  );
}

export default App;
