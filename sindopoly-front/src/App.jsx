import { useState } from 'react'
import {
  BrowserRouter as Router,
  Routes,
  Route,
} from "react-router-dom";
import Home from './pages/Home/Home';
// import Navbar from './globalComponents/Navbar/Navbar';
import SearchGame from './pages/SearchGame/SearchGame';
import Game from './pages/Game/Game';
import EndGame from './pages/Game/EndGame';
import Login from "./pages/Login/Login";
import { AuthProvider } from './AuthContext/AuthContext';
import { ProtectedRoute } from './AuthContext/ProtectedRoute';
import Statistics from './pages/Statistics/Statistics';
import Lobby from './pages/Lobby/Lobby';


function App() {
  return (
    <div className="flex flex-col min-h-screen m-0 p-0">
      <Router>
            {/* <Navbar /> */}
            <AuthProvider>
              <Routes>
                <Route path="/login" element={<Login/>}/>
                <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>}/>
                <Route path="/searchGame" element={<ProtectedRoute><SearchGame /></ProtectedRoute>}/>
                <Route path="/lobby" element={<ProtectedRoute><Lobby /></ProtectedRoute>}/>
                <Route path="/Game" element={<ProtectedRoute><Game /></ProtectedRoute>}/>
                <Route path="/endgame" element={<ProtectedRoute><EndGame /></ProtectedRoute>}/>
                <Route path="/statistics" element={<ProtectedRoute><Statistics /></ProtectedRoute>}/>
              </Routes>
            </AuthProvider>
      </Router>
    </div>
  );
}

export default App;
