import {
  Avatar,
  Button,
  Modal,
  Radio,
  Tooltip,
  message,
} from "antd";
import {
  BarChartOutlined,
  LogoutOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  SearchOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { useCallback, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthAPI } from "../../apis/AuthAPI";
import { GameAPI } from "../../apis/GameAPI";
import { continueGameRoute } from "../../apis/currentGame";
import AuthContext from "../../AuthContext/AuthContext";
import {
  HOME_CONTENT,
  contentForTransportError,
} from "../../features/game/content/el.js";
import PregameShell from "../../features/pregame/PregameShell.jsx";

function Home() {
  const navigate = useNavigate();
  const { logout, currentPlayer } = useContext(AuthContext);
  const [currentGameState, setCurrentGameState] = useState({ status: "loading", game: null });
  const [isModalOpen, setModalOpen] = useState(false);
  const [visibility, setVisibility] = useState("public");

  const nickname = currentPlayer?.nickname || "Επισκέπτης";
  const playerId = currentPlayer?.id;

  const fetchCurrentGame = useCallback(async () => {
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
  }, [logout]);

  useEffect(() => { void fetchCurrentGame(); }, [fetchCurrentGame]);

  const handleContinueGame = () => {
    const route = continueGameRoute(currentGameState.game, playerId);
    if (!route) {
      setCurrentGameState({ status: "error", game: null });
      message.error(HOME_CONTENT.cannotOpenCurrentGame);
      return;
    }
    navigate(route);
  };

  const handleCreateGame = async () => {
    try {
      const res = await GameAPI.createGame(visibility);
      const gameId = res.gameId ?? res.id ?? res.game_id;
      navigate(`/lobby?game_id=${gameId}&visibility=${visibility}`);
    } catch (error) {
      console.error(error);
      message.error(contentForTransportError(error).message);
    }
  };

  return (
    <>
      <PregameShell
        variant="wide"
        title={`${HOME_CONTENT.welcome}, ${nickname}`}
        description={HOME_CONTENT.chooseNextStep}
      >
        {currentGameState.status === "ready" ? (
          <div className="pregame-actions">
            <Button
              type="primary"
              size="large"
              className="pregame-primary"
              icon={<PlayCircleOutlined />}
              onClick={handleContinueGame}
            >
              {HOME_CONTENT.continueGame}
            </Button>
          </div>
        ) : currentGameState.status === "loading" ? (
          <div className="pregame-status" role="status" aria-live="polite">
            <p>{HOME_CONTENT.checkingCurrentGame}</p>
          </div>
        ) : currentGameState.status === "error" ? (
          <div className="pregame-status" role="alert">
            <p>{HOME_CONTENT.currentGameUnavailable}</p>
            <Button className="pregame-utility" onClick={fetchCurrentGame}>
              {HOME_CONTENT.retry}
            </Button>
          </div>
        ) : (
          <div className="pregame-actions">
            <Button
              type="primary"
              size="large"
              className="pregame-primary"
              icon={<PlusOutlined />}
              onClick={() => setModalOpen(true)}
            >
              {HOME_CONTENT.createGame}
            </Button>
            <div className="pregame-actions pregame-actions--secondary">
              <Button
                className="pregame-secondary"
                icon={<SearchOutlined />}
                onClick={() => navigate("/searchGame")}
              >
                {HOME_CONTENT.joinGame}
              </Button>
              <Button
                className="pregame-secondary"
                icon={<BarChartOutlined />}
                onClick={() => navigate("/statistics")}
              >
                {HOME_CONTENT.statistics}
              </Button>
            </div>
          </div>
        )}

        <div className="pregame-account">
          <Avatar size="small" icon={<UserOutlined />} />
          <span className="pregame-account__name">{nickname}</span>
          <Tooltip title={HOME_CONTENT.leaveChangeNickname}>
            <Button
              type="text"
              className="pregame-utility"
              icon={<LogoutOutlined />}
              aria-label={HOME_CONTENT.leaveChangeNickname}
              onClick={logout}
            />
          </Tooltip>
        </div>
      </PregameShell>

      <Modal
        centered
        width={440}
        rootClassName="pregame-modal"
        title={HOME_CONTENT.createNewGame}
        open={isModalOpen}
        onOk={handleCreateGame}
        onCancel={() => setModalOpen(false)}
        okText={HOME_CONTENT.create}
        cancelText={HOME_CONTENT.cancel}
      >
        <p>{HOME_CONTENT.visibilityPrompt}</p>
        <Radio.Group
          className="pregame-visibility-options"
          aria-label={HOME_CONTENT.visibilityPrompt}
          onChange={(event) => setVisibility(event.target.value)}
          value={visibility}
        >
          <Radio value="public">{HOME_CONTENT.public}</Radio>
          <Radio value="private">{HOME_CONTENT.private}</Radio>
        </Radio.Group>
      </Modal>
    </>
  );
}

export default Home;
