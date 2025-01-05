import { useState } from 'react'
import {
  BrowserRouter as Router,
  Routes,
  Route,
} from "react-router-dom";
import Home from './pages/Home/Home';
import Navbar from './globalComponents/Navbar/Navbar';
import SearchGame from './pages/SearchGame/SearchGame';
import CreateGame from './pages/CreateGame/CreateGame';
import Game from './pages/Game/Game';
import EndGame from './pages/Game/EndGame';
import Login from "./pages/Login/Login";
import { AuthProvider } from './AuthContext/AuthContext';
import { ProtectedRoute } from './AuthContext/ProtectedRoute';
import GetToken from './pages/GetToken/GetToken';
import WaitingLobby from './pages/WaitingLobby/WaitingLobby';


function App() {
  return (
    <div className="flex flex-col min-h-screen m-0 p-0">
      <Router>
            {/* <Navbar /> */}
            <AuthProvider>
              <Routes>
                <Route path="/login" element={<Login/>}/>
                <Route path="/getToken" element={<GetToken/>}/>
                <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>}/>
                <Route path="/searchGame" element={<ProtectedRoute><SearchGame /></ProtectedRoute>}/>
                <Route path="/createGame" element={<ProtectedRoute><CreateGame /></ProtectedRoute>}/>
                <Route path="/lobby" element={<ProtectedRoute><WaitingLobby /></ProtectedRoute>}/>
                <Route path="/Game" element={<ProtectedRoute><Game /></ProtectedRoute>}/>
                <Route path="/endgame" element={<ProtectedRoute><EndGame /></ProtectedRoute>}/>
              </Routes>
            </AuthProvider>
      </Router>
    </div>
  );
}

export default App;
