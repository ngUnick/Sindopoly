import { Button, message } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState, useMemo } from 'react';
import { GameAPI } from '../../apis/GameAPI';

const Lobby = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);

  const gameId = params.get('game_id');
  const visibility = params.get('visibility') || 'public';
  const playerId = localStorage.getItem('player_id');
  const nickname = sessionStorage.getItem("nickname");

  const [players, setPlayers] = useState([]);
  const [inviteCode, setInviteCode] = useState(null); // ✅ new
  const isOwner = String(playerId) === String(gameId); // ✅ owner check logic

  const handleStartGame = async () => {
    try {
      await GameAPI.startGame(gameId, playerId);
      navigate(`/Game?player=${playerId}`);
    } catch (err) {
      console.error(err);
      message.error(err.message ?? "Failed to start game");
    }
  };


  const fetchPlayers = async () => {
    try {
      const resPlayers = await fetch(`http://localhost:8080/api/game-state/players-detailed/${gameId}`);
      const resGame = await fetch(`http://localhost:8080/api/game-state/${gameId}`);
      if (!resPlayers.ok || !resGame.ok) throw new Error("Failed to fetch");

      const players = await resPlayers.json();
      const game = await resGame.json();

      setPlayers(players);

      // ✅ Store invite code if private
      if (visibility === 'private' && game.inviteCode) {
        setInviteCode(game.inviteCode);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleLeaveGame = async () => {
    try {
      const response = await fetch(`http://localhost:8080/api/game-state/${gameId}/remove-player?playerId=${playerId}`, {
        method: 'POST'
      });
      if (!response.ok) throw new Error("Failed to leave game");
      navigate("/");
    } catch (err) {
      console.error(err);
    }
  };

  const handleKick = async (targetId) => {
    try {
      const response = await fetch(`http://localhost:8080/api/game-state/${gameId}/remove-player?playerId=${targetId}`, {
        method: 'POST'
      });
      if (!response.ok) throw new Error("Failed to remove player");
      message.success("Player removed.");
      fetchPlayers();
    } catch (err) {
      console.error(err);
      message.error("Failed to remove player.");
    }
  };

  useEffect(() => {
    const interval = setInterval(fetchPlayers, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex-grow flex justify-center items-center bg-pic bg-cover bg-no-repeat">
      <div className="fixed w-full h-full shadow-[0_0_80px_rgba(255,255,255,0.7)_inset] left-0 top-0" />

      <div className="bg-[rgba(255,236,195,0.8)] py-[30px] px-10 backdrop-blur-sm border-solid border-[rgba(255,255,255,0.6)] rounded-md w-[600px]">
        <h1 className="text-center text-xl font-bold mb-6">Game Lobby</h1>

        <p className="text-center mb-4">
          Waiting for players to join... <br />
          Visibility: <strong>{visibility}</strong>
        </p>

        {visibility === 'private' && inviteCode && (
          <p className="text-center mb-4 text-sm text-gray-700">
            Invite Code: <strong>{inviteCode}</strong>
          </p>
        )}

        <p className="text-center mb-6">
          You are playing as <strong>{nickname}</strong> {isOwner && '(Owner)'}
        </p>

        <div className="mb-6">
          <h2 className="text-center text-lg font-medium mb-2">Players:</h2>
          <ul className="list-disc list-inside text-center">
            {players.map(p => (
              <div key={p.id} className="text-center font-medium flex items-center justify-center gap-2">
                <span>
                  {p.nickname ?? `Player #${p.id}`} {p.id == playerId && "(You)"} {p.id == gameId && "(Owner)"}
                </span>
                {isOwner && p.id != playerId && (
                  <button
                    className="text-red-600 hover:text-red-800 text-xs"
                    onClick={() => handleKick(p.id)}
                    title="Remove player"
                  >
                    ❌
                  </button>
                )}
              </div>
            ))}
          </ul>
        </div>

        <div className="flex justify-center gap-3">
          <Button type="primary" disabled={!isOwner} onClick={handleStartGame}>Start Game</Button>
          <Button type="primary" danger onClick={handleLeaveGame}>Leave Game</Button>
        </div>
      </div>
    </div>
  );
};

export default Lobby;
