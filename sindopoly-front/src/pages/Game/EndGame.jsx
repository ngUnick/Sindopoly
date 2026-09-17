import { useLocation, useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrophy } from "@fortawesome/free-solid-svg-icons";
import { Button } from "antd";
import bgImg from "../../assets/images/monopoly_bg.png";
import { END_GAME_CONTENT } from "../../features/game/content/el.js";
import { readCompletionNavigationState } from "../../features/game/presentation/gameViewModel.js";

const EndGame = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const completion = readCompletionNavigationState(location.state);
  const winner = completion?.standings.find(standing => standing.winner) ?? null;

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
          <h1 className="text-3xl font-bold">{END_GAME_CONTENT.title}</h1>
          {winner ? (
            <>
              <div className="flex items-center justify-center space-x-2">
                <FontAwesomeIcon icon={faTrophy} className="text-yellow-500 text-2xl" />
                <span className="text-2xl">{END_GAME_CONTENT.winner}: {winner.nickname}</span>
                <FontAwesomeIcon icon={faTrophy} className="text-yellow-500 text-2xl" />
              </div>
              <div className="mt-2 text-lg space-y-1">
                <div>{END_GAME_CONTENT.finalBalance}: {winner.cashText}</div>
                <div>{END_GAME_CONTENT.propertyValue}: {winner.propertyValueText}</div>
                <div>{END_GAME_CONTENT.totalValue}: {winner.totalValueText}</div>
                <div>{END_GAME_CONTENT.rank}: {winner.rankText}</div>
              </div>
            </>
          ) : (
            <p role="alert">{END_GAME_CONTENT.resultUnavailable}</p>
          )}
          <Button onClick={() => navigate("/")} type="primary" style={{ marginTop: "50px" }}>
            {END_GAME_CONTENT.returnHome}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default EndGame;
