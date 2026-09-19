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
import { useContext } from "react";
import { useNavigate } from "react-router-dom";
import { GameAPI } from "../../apis/GameAPI";
import { AuthAPI } from "../../apis/AuthAPI";
import { continueGameRoute } from "../../apis/currentGame";
import bgImg from "../../assets/images/monopoly_bg.png";
import AuthContext from "../../AuthContext/AuthContext";
import {
  HOME_CONTENT,
  contentForTransportError,
} from "../../features/game/content/el.js";

function Home() {
  const navigate = useNavigate();
  const { logout, currentPlayer } = useContext(AuthContext);

  /* -------------------------- state -------------------------- */
  const [currentGameState, setCurrentGameState] = useState({ status: "loading", game: null });
  const [isModalOpen, setModalOpen] = useState(false);
  const [visibility, setVisibility] = useState("public");

  const nickname = currentPlayer?.nickname || "Guest";
  const playerId = currentPlayer?.id;

  /* ---------------------- helpers ---------------------------- */
  const fetchCurrentGame = async () => {
    setCurrentGameState({ status: "loading", game: null });
    try {
      const game = await AuthAPI.getCurrentGame();
      setCurrentGameState({ status: game ? "ready" : "none", game });
    } catch (error) {
      if (error.status === 401) {
        await logout();
        return;
      }
      console.error(error);
      setCurrentGameState({ status: "error", game: null });
      message.error(contentForTransportError(error).message);
    }
  };

  /* run once */
  useEffect(() => { void fetchCurrentGame(); }, []);

  const handleContinueGame = () => {
    const route = continueGameRoute(currentGameState.game, playerId);
    if (!route) {
      setCurrentGameState({ status: "error", game: null });
      message.error(HOME_CONTENT.cannotOpenCurrentGame);
      return;
    }
    navigate(route);
  };

  /* create-game flow */
  const handleCreateGame = async () => {
    try {
      const res     = await GameAPI.createGame(visibility);
      const gameId  = res.gameId ?? res.id ?? res.game_id;
      navigate(`/lobby?game_id=${gameId}&visibility=${visibility}`);
    } catch (error) {
      console.error(error);
      message.error(contentForTransportError(error).message);
    }
  };

  /* leave / change nickname */
  const handleLeave = async () => {
    await logout();
  };

  /* ------------------------ UI ------------------------------- */
  return (
    <div className="flex-grow flex justify-center items-center bg-cover bg-no-repeat" style={{ backgroundImage: `url(${bgImg})` }}>
      {/* vignette */}
      <div className="fixed w-full h-full shadow-[0_0_80px_rgba(255,255,255,0.7)_inset] left-0 top-0" />

      <div className="relative bg-[rgba(255,236,195,0.8)] pt-[50px] pb-[20px] px-5
                      backdrop-blur-sm border-solid border-[rgba(255,255,255,0.6)] rounded-md">
        <div className="w-[800px] flex flex-col gap-5">
          <img src={monopoly_logo} alt="logo" />
          <ConfigProvider theme={{ token: { colorPrimary: "#cf971c" } }}>
            {currentGameState.status === "ready" ? (
              <div className="flex flex-col items-center gap-5">
                <Button
                  type="primary"
                  onClick={handleContinueGame}
                >
                  {HOME_CONTENT.continueGame}
                </Button>
              </div>
            ) : currentGameState.status === "loading" ? (
              <div className="flex flex-col items-center gap-5">
                <Button type="primary" disabled>{HOME_CONTENT.checkingCurrentGame}</Button>
              </div>
            ) : currentGameState.status === "error" ? (
              <div className="flex flex-col items-center gap-5">
                <Button type="primary" disabled>{HOME_CONTENT.currentGameUnavailable}</Button>
                <Button type="primary" onClick={fetchCurrentGame}>{HOME_CONTENT.retry}</Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-5">
                <Button type="primary" onClick={() => setModalOpen(true)}>
                  {HOME_CONTENT.createGame}
                </Button>
                <Button type="primary" onClick={() => navigate("/searchGame")}>
                  {HOME_CONTENT.joinGame}
                </Button>
                <Button type="primary" onClick={() => navigate("/statistics")}>
                  {HOME_CONTENT.statistics}
                </Button>
              </div>
            )}
          </ConfigProvider>
        </div>

        {/* nickname + leave icon */}
        <div className="absolute bottom-3 right-5 flex items-center gap-2 text-gray-800 text-sm">
          <Avatar size="small" icon={<UserOutlined />} />
          <span className="font-medium">{nickname}</span>

          <Tooltip title={HOME_CONTENT.leaveChangeNickname}>
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
        title={HOME_CONTENT.createNewGame}
        open={isModalOpen}
        onOk={handleCreateGame}
        onCancel={() => setModalOpen(false)}
        okText={HOME_CONTENT.create}
        centered
      >
        <Radio.Group
          onChange={(e) => setVisibility(e.target.value)}
          value={visibility}
        >
          <Radio value="public">{HOME_CONTENT.public}</Radio>
          <Radio value="private">{HOME_CONTENT.private}</Radio>
        </Radio.Group>
      </Modal>
    </div>
  );
}

export default Home;
