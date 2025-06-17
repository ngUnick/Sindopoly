import { useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrophy } from "@fortawesome/free-solid-svg-icons";
import { Button } from "antd";
import { GamePlayAPI } from "../../apis/GamePlayAPI";
import bgImg from "../../assets/images/monopoly_bg.png";

const EndGame = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // grab winner, gameId, playerId from the URL (or fallback to localStorage)
  const winnerName = searchParams.get("winner") || "Unknown"
  const capital    = searchParams.get("capital") || ""
  const gameId   = searchParams.get("game");
  const playerId = searchParams.get("player") || localStorage.getItem("player_id");

  useEffect(() => {
    // only call once, and only if we have both IDs
    if (!gameId || !playerId) return;
    GamePlayAPI.endGame(gameId, playerId).catch(console.error);
  }, [gameId, playerId]);

  return (
    <div className="flex-grow flex justify-center items-center bg-cover bg-no-repeat" style={{ backgroundImage: `url(${bgImg})` }}>
      {/* Vignette */}
      <div className="fixed w-full h-full shadow-[0_0_80px_rgba(255,255,255,0.7)_inset]" />

      {/* fireworks… */}
      {Array.from({ length: 15 }, (_, i) => (
        <div key={i} className={`firework-${i + 1}`} />
      ))}

      <div className="absolute w-full h-full bg-transparent backdrop-blur-sm z-2" />
      <div className="bg-[rgba(255,236,195,0.8)] pt-[50px] pb-[20px] px-5 backdrop-blur-sm border border-white/60 rounded-md z-4">
        <div className="endgame text-center space-y-4">
          <h1 className="text-3xl font-bold">Τέλος Παιχνιδιού</h1>
          <div className="flex items-center justify-center space-x-2">
            <FontAwesomeIcon icon={faTrophy} className="text-yellow-500 text-2xl" />
            <span className="text-2xl"> Νικητής: {winnerName}</span>
            <FontAwesomeIcon icon={faTrophy} className="text-yellow-500 text-2xl" />
          </div>
          {capital && (
            <span className="mt-2 text-lg">
              Συνολικό κεφάλαιο: €{capital}
            </span>
          )}
          <Button onClick={() => navigate("/")} type="primary" style={{ marginTop: "50px" }}>
            Πίσω στην Αρχική
          </Button>
        </div>
      </div>
    </div>
  );
};

export default EndGame;
