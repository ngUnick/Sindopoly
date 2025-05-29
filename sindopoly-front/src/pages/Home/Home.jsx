import monopoly_logo from "../../assets/images/monopoly_logo.png";
import {
  Button,
  ConfigProvider,
  Avatar,
  Modal,
  Radio,
  message,
  Tooltip,
} from "antd";
import {
  UserOutlined,
  LogoutOutlined,      // ⬅️ icon
} from "@ant-design/icons";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GamePlayAPI } from "../../apis/GamePlayAPI";
import { GameAPI } from "../../apis/GameAPI";

function Home() {
  const navigate = useNavigate();

  /* -------------------------- state -------------------------- */
  const [isOnGame, setIsOnGame]   = useState(false);
  const [isModalOpen, setModalOpen] = useState(false);
  const [visibility, setVisibility] = useState("public");

  const nickname  = sessionStorage.getItem("nickname") || "Guest";
  const playerId  = localStorage.getItem("player_id");

  /* ---------------------- helpers ---------------------------- */
  const fetchIsOnGame = async () => {
    if (!playerId) return;
    const inGame = await GamePlayAPI.getInGameStatus(playerId);
    setIsOnGame(inGame);
  };

  /* run once */
  useEffect(() => { fetchIsOnGame(); }, []);

  /* create-game flow */
  const handleCreateGame = async () => {
    try {
      const res     = await GameAPI.createGame(visibility);
      const gameId  = res.gameId ?? res.id ?? res.game_id;
      navigate(`/lobby?game_id=${gameId}&visibility=${visibility}`);
    } catch (e) {
      console.error(e);
      message.error("Failed to create game.");
    }
  };

  /* leave / change nickname */
  const handleLeave = () => {
    sessionStorage.removeItem("nickname");
    localStorage.removeItem("player_id");
    navigate("/login");          // adjust if your login route differs
  };

  /* ------------------------ UI ------------------------------- */
  return (
    <div className="flex-grow flex justify-center items-center bg-pic bg-cover bg-no-repeat">
      {/* vignette */}
      <div className="fixed w-full h-full shadow-[0_0_80px_rgba(255,255,255,0.7)_inset] left-0 top-0" />

      <div className="relative bg-[rgba(255,236,195,0.8)] pt-[50px] pb-[20px] px-5
                      backdrop-blur-sm border-solid border-[rgba(255,255,255,0.6)] rounded-md">
        <div className="w-[800px] flex flex-col gap-5">
          <img src={monopoly_logo} alt="logo" />
          <ConfigProvider theme={{ token: { colorPrimary: "#cf971c" } }}>
            {isOnGame ? (
              <div className="flex flex-col items-center gap-5">
                <Button
                  type="primary"
                  onClick={() => navigate(`/Game?player=${playerId}`)}
                >
                  Continue Game
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-5">
                <Button type="primary" onClick={() => setModalOpen(true)}>
                  Create Game
                </Button>
                <Button type="primary" onClick={() => navigate("/searchGame")}>
                  Join Game
                </Button>
                <Button type="primary" onClick={() => navigate("/statistics")}>
                  Statistics
                </Button>
              </div>
            )}
          </ConfigProvider>
        </div>

        {/* nickname + leave icon */}
        <div className="absolute bottom-3 right-5 flex items-center gap-2 text-gray-800 text-sm">
          <Avatar size="small" icon={<UserOutlined />} />
          <span className="font-medium">{nickname}</span>

          <Tooltip title="Leave & change nickname">
            <Button
              type="text"
              size="small"
              icon={<LogoutOutlined />}
              onClick={handleLeave}
              style={{ color: "white", backgroundColor: "red", hover: { color: "white", backgroundColor: "#ff4d4f" }, fontWeight: "bold" }}
            />
          </Tooltip>
        </div>
      </div>

      {/* create-game modal */}
      <Modal
        title="Create a New Game"
        open={isModalOpen}
        onOk={handleCreateGame}
        onCancel={() => setModalOpen(false)}
        okText="Create"
        centered
      >
        <Radio.Group
          onChange={(e) => setVisibility(e.target.value)}
          value={visibility}
        >
          <Radio value="public">Public</Radio>
          <Radio value="private">Private</Radio>
        </Radio.Group>
      </Modal>
    </div>
  );
}

export default Home;
