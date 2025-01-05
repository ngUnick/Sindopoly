import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { GameAPI } from '../../apis/GameAPI';
import { GamePlayAPI } from '../../apis/GamePlayAPI';
import { Button } from 'antd';

const WaitingLobby = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [iamCreator, setIamCreator] = useState(false);
    const [atLeastTwoPlayers, setAtLeastTwoPlayers] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        setIamCreator(searchParams.get('creator'));

        setInterval(async () => {
                const response = await GamePlayAPI.getBoard(localStorage.getItem('player_id'));
                if(response[0].gameStatus == "inProgress")
                    navigate(`/Game?player=${localStorage.getItem('player_id')}&bot=${searchParams.get('bot')}`);
                if(response.length >= 2)
                    setAtLeastTwoPlayers(true);
        },1000);

    }, []);

    const dotsSpan = document.getElementById('dots');
    let dotIndex = 0;
    const dotAnimation = setInterval(() => {
        if (dotIndex === 0) {
            dotsSpan.innerText = '.';
        } else if (dotIndex === 1) {
            dotsSpan.innerText = '..';
        } else {
            dotsSpan.innerText = '...';
            dotIndex = -1; // Reset to -1 to start over
        }
        dotIndex++;
    }, 1000); // Change the duration between changes here (in milliseconds)


    return ( 

        <div className="flex-grow flex justify-center items-center bg-pic bg-cover bg-no-repeat">

            {/* Vignette */}
            <div className="fixed w-full h-full shadow-[0_0_80px_rgba(255,255,255,0.7)_inset] left-0 top-0"></div>
                <div className="bg-[rgba(255,236,195,0.8)] pt-[50px] pb-[20px] px-5 backdrop-blur-sm border-solid border-[rgba(255,255,255,0.6)] rounded-md">
                    <div className="w-[800px] flex flex-col gap-5 items-center">
                        <div className="text-[1.7em]">Waiting <span id="dots">...</span></div>
                        {
                        ((iamCreator == 1) && atLeastTwoPlayers ) ? <Button className="p-[auto]" onClick={async () => { await GameAPI.startGame(searchParams.get('game_id'))}}>Start game</Button> : ""  
                        }
                    </div>
                </div>
        </div>

    );
}
 
export default WaitingLobby;