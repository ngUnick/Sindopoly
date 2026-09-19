import { lazy, Suspense } from 'react';
import { ConfigProvider } from 'antd';
import {
  BrowserRouter as Router,
  Routes,
  Route,
} from "react-router-dom";
import { AuthProvider } from './AuthContext/AuthContext';
import { ProtectedRoute } from './AuthContext/ProtectedRoute';
import { APP_ANT_THEME } from './styles/antTheme.js';
import { CONNECTION_CONTENT } from './features/game/content/el.js';

// Route boundaries keep Three.js, GLTF assets and game audio out of the
// initial login/home graph while preserving one authoritative Game runtime.
const Home = lazy(() => import('./pages/Home/Home.jsx'));
const SearchGame = lazy(() => import('./pages/SearchGame/SearchGame.jsx'));
const Game = lazy(() => import('./pages/Game/Game.jsx'));
const EndGame = lazy(() => import('./pages/Game/EndGame.jsx'));
const Login = lazy(() => import('./pages/Login/Login.jsx'));
const Statistics = lazy(() => import('./pages/Statistics/Statistics.jsx'));
const Lobby = lazy(() => import('./pages/Lobby/Lobby.jsx'));


function App() {
  return (
    <ConfigProvider theme={APP_ANT_THEME}>
      <div className="flex flex-col min-h-screen m-0 p-0">
        <Router>
            {/* <Navbar /> */}
            <AuthProvider>
              <Suspense fallback={<RouteLoadingFallback />}>
                <Routes>
                  <Route path="/login" element={<Login/>}/>
                  <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>}/>
                  <Route path="/searchGame" element={<ProtectedRoute><SearchGame /></ProtectedRoute>}/>
                  <Route path="/lobby" element={<ProtectedRoute><Lobby /></ProtectedRoute>}/>
                  <Route path="/Game" element={<ProtectedRoute><Game /></ProtectedRoute>}/>
                  <Route path="/endgame" element={<ProtectedRoute><EndGame /></ProtectedRoute>}/>
                  <Route path="/statistics" element={<ProtectedRoute><Statistics /></ProtectedRoute>}/>
                </Routes>
              </Suspense>
            </AuthProvider>
        </Router>
      </div>
    </ConfigProvider>
  );
}

function RouteLoadingFallback() {
  return <main role="status" aria-live="polite" className="flex min-h-screen items-center justify-center">
    {CONNECTION_CONTENT.gameLoading}
  </main>;
}

export default App;
