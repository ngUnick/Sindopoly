import { useEffect, useState } from 'react';
import { Button, Spin, message } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import { GamePlayAPI } from '../../apis/GamePlayAPI';

const Lobby = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const gameId = params.get('game_id');
  const playerId = localStorage.getItem('player_id');

  const [players, setPlayers] = useState([]);
  const [ownerId, setOwnerId] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchLobby = async () => {
    try {
      const game = await GamePlayAPI.getGame(gameId);
      const playerIds = await GamePlayAPI.getPlayersInGame(gameId);

      setOwnerId(game.owner);
      setPlayers(playerIds);
      setLoading(false);

      // If game has already started, redirect
      if (game.status === 'inProgress') {
        navigate(`/Game?player=${playerId}`);
      }
    } catch (err) {
      console.error(err);
      message.error('Failed to load lobby.');
    }
  };

  useEffect(() => {
    const interval = setInterval(fetchLobby, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleStartGame = async () => {
    try {
      await GamePlayAPI.startGame(gameId);
      navigate(`/Game?player=${playerId}`);
    } catch (err) {
      console.error(err);
      message.error('Failed to start game.');
    }
  };

  return (
    <div className="flex-grow flex justify-center items-center bg-pic bg-cover bg-no-repeat">
      <div className="fixed w-full h-full shadow-[0_0_80px_rgba(255,255,255,0.7)_inset] left-0 top-0" />

      <div className="bg-[rgba(255,236,195,0.8)] py-[30px] px-10 backdrop-blur-sm border-solid border-[rgba(255,255,255,0.6)] rounded-md w-[600px]">
        <h1 className="text-center text-xl font-bold mb-6">Lobby</h1>
        {loading ? (
          <div className="text-center"><Spin /></div>
        ) : (
          <>
            <div className="flex flex-col gap-2 mb-4">
              {players.map(pid => (
                <div key={pid} className="text-center font-medium">
                  Player #{pid} {Number(pid) === Number(ownerId) && '(Owner)'}
                </div>
              ))}
            </div>
            <div className="flex justify-center">
              <Button
                type="primary"
                onClick={handleStartGame}
                disabled={Number(playerId) !== Number(ownerId)}
              >
                Start Game
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Lobby;
