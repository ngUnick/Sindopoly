import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrophy } from "@fortawesome/free-solid-svg-icons";

const EndGame = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {}, []);

  return (
    <div className="flex-grow flex justify-center items-center bg-pic bg-cover bg-no-repeat">
      {/* Vignette */}
      <div className="fixed w-full h-full shadow-[0_0_80px_rgba(255,255,255,0.7)_inset] left-0 top-0"></div>

      <div class="firework-1"></div>
      <div class="firework-2"></div>
      <div class="firework-3"></div>
      <div class="firework-4"></div>
      <div class="firework-5"></div>
      <div class="firework-6"></div>
      <div class="firework-7"></div>
      <div class="firework-8"></div>
      <div class="firework-9"></div>
      <div class="firework-10"></div>
      <div class="firework-11"></div>
      <div class="firework-12"></div>
      <div class="firework-13"></div>
      <div class="firework-14"></div>
      <div class="firework-15"></div>

      <div className="absolute w-full h-full bg-transparent backdrop-blur-sm left-0 top-0 z-2"></div>
      <div className="bg-[rgba(255,236,195,0.8)] pt-[50px] pb-[20px] px-5 backdrop-blur-sm border-solid border-[rgba(255,255,255,0.6)] rounded-md z-4">
        <div className="endgame">
          <span>Game Ended</span>

          <span>Winner:</span>

          <span>
            <FontAwesomeIcon icon={faTrophy} className="trophy" />
            <p>Amog</p>
            <FontAwesomeIcon icon={faTrophy} className="trophy" />
          </span>

          {/* End Game, the winner is {searchParams.get('winner')} */}
        </div>

        <div className="b">
          <button
            onClick={() => {
              navigate("/");
            }}
          ></button>
        </div>
      </div>
    </div>
  );
};

export default EndGame;
