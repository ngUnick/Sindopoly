import { Button, ConfigProvider} from 'antd';
import { useNavigate } from "react-router-dom";
import Board from './Board';

function Game() {
    const navigate = useNavigate();


    return ( 
        // TODO: Add Real Board
        <div className="flex-grow bg-[#C1FFFB] flex items-center bg-pic bg-cover bg-no-repeat z-[1]">

            {/* Vignette */}
            <div className="fixed w-full h-full shadow-[0_0_80px_rgba(255,255,255,0.7)_inset] left-0 top-0 z-[-9]"></div>
            
            <div className="w-[800px] flex flex-col gap-5">
                
                <ConfigProvider theme={{token : {colorPrimary : '#00BF41'}}}>
                    <Board />
                </ConfigProvider>
            </div>
        </div>
     );
}

export default Game;