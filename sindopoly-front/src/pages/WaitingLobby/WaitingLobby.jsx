import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { GameAPI } from '../../apis/GameAPI';
import { GamePlayAPI } from '../../apis/GamePlayAPI';

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
                    navigate(`/Game?player=${localStorage.getItem('player_id')}`);
                if(response.length >= 2)
                    setAtLeastTwoPlayers(true);
        },1000);

    }, []);

    return ( 
        <div className="">
            <div className="">waiting ...</div>
            {
              ((iamCreator == 1) && atLeastTwoPlayers ) ? <button onClick={async () => { await GameAPI.startGame(searchParams.get('game_id'))}}>Start game</button> : ""  
            }
        </div> 
    );
}
 
export default WaitingLobby;