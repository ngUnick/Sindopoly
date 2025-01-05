import { useEffect, useState } from "react";
import { GameAPI } from "../../apis/GameAPI";
import { Button, ConfigProvider, Table, Spin } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';
import { useNavigate } from "react-router-dom";
import { StatisticsAPI } from "../../apis/StatisticsAPI";


const antIcon = (
  <LoadingOutlined
    style={{
      fontSize: 24,
    }}
    spin
  />
);

const Statistics = () => {
    const [stats, setStats] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    const columns = [
        {
          title: 'winner',
          dataIndex: 'winner',
          key: 'winner',
        },
        {
          title: 'wins',
          dataIndex: 'wins',
          key: 'wins',
        },
    ];

    useEffect(() => {
        const asyncInUseEffect = async () => {
          setLoading(true);
          const winsFetched = await StatisticsAPI.getWinners();
          const winsCorrectFormat = winsFetched.map((obj, index) => {
            obj.key = index;
            return obj;
          });
          setStats(winsCorrectFormat);
          console.log(winsCorrectFormat);
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
                <Table columns={columns} dataSource={stats} />
                )}
            </div>
        </div>
    );
}
 
export default Statistics;