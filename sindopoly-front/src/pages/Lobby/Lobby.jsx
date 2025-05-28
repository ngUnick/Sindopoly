import { Button } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';

const Lobby = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);

  const gameId = params.get('game_id');
  const isOwner = params.get('creator') === '1';         // passed from Home
  const visibility = params.get('visibility') || 'public';
  const playerId = localStorage.getItem('player_id');
  const nickname = sessionStorage.getItem("nickname");

  const handleStartGame = async () => {
    try {
      const response = await fetch(`http://localhost:8080/api/game-state/start/${gameId}`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Failed to start game');
      navigate(`/Game?player=${playerId}`);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex-grow flex justify-center items-center bg-pic bg-cover bg-no-repeat">
      <div className="fixed w-full h-full shadow-[0_0_80px_rgba(255,255,255,0.7)_inset] left-0 top-0" />

      <div className="bg-[rgba(255,236,195,0.8)] py-[30px] px-10 backdrop-blur-sm border-solid border-[rgba(255,255,255,0.6)] rounded-md w-[600px]">
        <h1 className="text-center text-xl font-bold mb-6">Game Lobby</h1>

        <p className="text-center mb-4">
          Waiting for players to join... <br />
          Visibility: <strong>{visibility}</strong>
        </p>

        <p className="text-center mb-6">
          You are playing as <strong>{nickname}</strong> {isOwner && '(Owner)'}
        </p>

        <div className="flex justify-center">
          <Button
            type="primary"
            disabled={!isOwner}
            onClick={handleStartGame}
          >
            Start Game
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Lobby;
