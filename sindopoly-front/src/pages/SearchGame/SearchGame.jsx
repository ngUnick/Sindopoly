import { useEffect, useState } from "react";
import { GameAPI } from "../../apis/GameAPI";
import { Button, ConfigProvider, Table, Spin } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';
import { useNavigate } from "react-router-dom";


const antIcon = (
  <LoadingOutlined
    style={{
      fontSize: 24,
    }}
    spin
  />
);

function SearchGame() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const columns = [
    {
      title: 'GameId',
      dataIndex: 'GameId',
      key: 'GameId',
    },
    {
      title: 'GameStatus',
      dataIndex: 'GameStatus',
      key: 'GameStatus',
    },
    {
      title: 'Creator',
      dataIndex: 'Creator',
      key: 'Creator',
    },
    {
      title: 'MaxTime',
      dataIndex: 'MaxTime',
      key: 'MaxTime',
    },
    {
      title: 'MaxMoney',
      key: 'MaxMoney',
      dataIndex: 'MaxMoney',
    },
    {
      title: 'Action',
      key: 'action',
      render: (_, record) => (
        <div className="">
          {
            (record.GameStatus == "lobby") ? <Button onClick={async () => {
              await GameAPI.joinGame(record.GameId);
              navigate(`/lobby?game_id=${record.GameId}`);
  
            }}>Join</Button> : "No action"
          }
          
        </div>

      ),
    },
  ];

  useEffect(() => {
    const asyncInUseEffect = async () => {
      setLoading(true);
      const gamesFetched = await GameAPI.getAll();
      const gamesCorrectFormat = gamesFetched.map((obj, index) => {
        return {
          key: index,
          GameId: obj.id,
          GameStatus: obj.gameStatus,
          Creator: obj.creator,
          MaxTime: obj.maxTime,
          MaxMoney: obj.maxMoney
        }
      });
      setGames(gamesCorrectFormat);
      console.log(gamesCorrectFormat);
      setLoading(false);
    };
    asyncInUseEffect();

  }, []);
  
  return (
    <div className="flex-grow flex justify-center items-center bg-pic bg-cover bg-no-repeat">
      {/* Vignette */}
      <div className="fixed w-full h-full shadow-[0_0_80px_rgba(255,255,255,0.7)_inset] left-0 top-0"></div>

      <div className="bg-[rgba(255,236,195,0.8)] pt-[50px] pb-[20px] px-5 backdrop-blur-sm border-solid border-[rgba(255,255,255,0.6)] rounded-md">
        {loading ? (
          <div className="text-center mt-5">
            <Spin indicator={antIcon} />
          </div>
        ) : (
          <Table columns={columns} dataSource={games} />
        )}
      </div>
    </div>
  );
}

export default SearchGame;
