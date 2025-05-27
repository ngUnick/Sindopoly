import monopoly_logo from "../../assets/images/monopoly_logo.png";
import { Button, ConfigProvider, Avatar } from 'antd';
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GamePlayAPI } from "../../apis/GamePlayAPI";
import { UserOutlined } from '@ant-design/icons';  // ✅ avatar icon

function Home() {
    const navigate = useNavigate();
    const [isOnGame, setIsOnGame] = useState(false);
    const nickname = sessionStorage.getItem("nickname") || "Guest"; // ✅ fallback

    const fetchAndSetIsOnGme = async () => {
        const response = await GamePlayAPI.getBoard(localStorage.getItem('player_id'));

        if(response.length === 0)
            setIsOnGame(false)
        else
            setIsOnGame(true);
    };

    useEffect(() => {
        setInterval(fetchAndSetIsOnGme, 500);
    }, []);

    return ( 
        <div className="flex-grow flex justify-center items-center bg-pic bg-cover bg-no-repeat">
            {/* Vignette */}
            <div className="fixed w-full h-full shadow-[0_0_80px_rgba(255,255,255,0.7)_inset] left-0 top-0"></div>
            
            <div className="relative bg-[rgba(255,236,195,0.8)] pt-[50px] pb-[20px] px-5 backdrop-blur-sm border-solid border-[rgba(255,255,255,0.6)] rounded-md">
                <div className="w-[800px] flex flex-col gap-5">
                    <img src={monopoly_logo} alt="logo" />
                    <ConfigProvider theme={{token : {colorPrimary : '#cf971c'}}}>
                        {
                            isOnGame ? 
                            <div className="flex flex-col justify-center items-center gap-5">
                                <Button type="primary" value="large" onClick={() => navigate(`/Game?player=${localStorage.getItem('player_id')}`)}>Continue Game</Button>
                            </div> :
                            <div className="flex flex-col justify-center items-center gap-5">
                                <Button type="primary" value="large" onClick={() => navigate('/createGame')}>Create Game</Button>
                                <Button type="primary" value="large" onClick={() => navigate('/searchGame')}>Join Game</Button>
                                <Button type="primary" value="large" onClick={() => navigate('/statistics')}>Statistics</Button>
                            </div>
                        }
                    </ConfigProvider>
                </div>

                {/* ✅ Nickname & Avatar */}
                <div className="absolute bottom-3 right-5 flex items-center gap-2 text-gray-800 text-sm">
                    <Avatar size="small" icon={<UserOutlined />} />
                    <span className="font-medium">{nickname}</span>
                </div>
            </div>
        </div>
    );
}

export default Home;
