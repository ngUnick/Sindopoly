import { useEffect, useRef, useState } from "react";
import { Button, Input, Modal, Spin, message } from "antd";
import { ArrowLeftOutlined, KeyOutlined, UsergroupAddOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { GameAPI } from "../../apis/GameAPI";
import { SEARCH_GAME_CONTENT } from "../../features/game/content/el.js";
import PregameShell from "../../features/pregame/PregameShell.jsx";
import { sanitizeText } from "../../utils/sanitize";

function SearchGame() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const inputRef = useRef(null);
  const navigate = useNavigate();

  const handleJoinGame = async (game) => {
    try {
      await GameAPI.joinGame(game.GameId, game.StateVersion);
      navigate(`/lobby?game_id=${game.GameId}`);
    } catch (err) {
      message.error(SEARCH_GAME_CONTENT.failedJoin);
    }
  };

  const fetchPublicGames = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const list = await GameAPI.getPublicLobbyGames();
      setGames(list.map((game, index) => ({
        key: index,
        GameId: game.gameId,
        Creator: game.creatorNickname,
        PlayerCount: `${game.playerCount}/4`,
        StateVersion: game.stateVersion,
      })));
      setLoadFailed(false);
    } catch (err) {
      setLoadFailed(true);
      message.error(SEARCH_GAME_CONTENT.failedLoad);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchPublicGames();
    const id = setInterval(fetchPublicGames, 10000);
    return () => clearInterval(id);
  }, []);

  const handleJoinByInvite = async () => {
    const code = inviteCode.trim().toUpperCase();
    if (!code) return;

    try {
      const { gameId } = await GameAPI.joinWithInvite(code);
      message.success(SEARCH_GAME_CONTENT.joinedPrivate);
      setModalOpen(false);
      setInviteCode("");
      navigate(`/lobby?game_id=${gameId}&visibility=private`);
    } catch (err) {
      message.error(SEARCH_GAME_CONTENT.invalidInvite);
    }
  };

  const cleanInvite = (raw) => sanitizeText(raw, 5).toUpperCase();

  return (
    <>
      <PregameShell
        variant="wide"
        title={SEARCH_GAME_CONTENT.title}
        description={SEARCH_GAME_CONTENT.description}
      >
        <div className="pregame-toolbar">
          <h2 className="pregame-section__title">{SEARCH_GAME_CONTENT.publicLobbies}</h2>
          <Button
            className="pregame-secondary pregame-secondary--compact"
            icon={<KeyOutlined />}
            onClick={() => setModalOpen(true)}
          >
            {SEARCH_GAME_CONTENT.joinByCode}
          </Button>
        </div>

        {loading ? (
          <div className="pregame-status" role="status" aria-live="polite">
            <Spin size="small" />
            <p>{SEARCH_GAME_CONTENT.loading}</p>
          </div>
        ) : loadFailed ? (
          <div className="pregame-status" role="alert">
            <p>{SEARCH_GAME_CONTENT.failedLoad}</p>
            <Button className="pregame-utility" onClick={() => fetchPublicGames(true)}>
              {SEARCH_GAME_CONTENT.retry}
            </Button>
          </div>
        ) : games.length === 0 ? (
          <div className="pregame-empty" role="status">
            <p>{SEARCH_GAME_CONTENT.noGames}</p>
          </div>
        ) : (
          <ul className="pregame-list pregame-game-list" aria-label={SEARCH_GAME_CONTENT.publicLobbies}>
            {games.map(game => {
              const currentPlayers = parseInt(game.PlayerCount.split("/")[0], 10);
              const isFull = currentPlayers >= 4;
              return (
                <li className="pregame-list__row" key={game.key}>
                  <div className="pregame-list__copy">
                    <span className="pregame-list__eyebrow">{SEARCH_GAME_CONTENT.creator}</span>
                    <strong>{game.Creator}</strong>
                    <span className="pregame-list__meta">{SEARCH_GAME_CONTENT.players}: {game.PlayerCount}</span>
                  </div>
                  <Button
                    className={isFull ? "pregame-secondary pregame-secondary--compact" : "pregame-primary"}
                    disabled={isFull}
                    icon={!isFull && <UsergroupAddOutlined />}
                    onClick={() => handleJoinGame(game)}
                  >
                    {isFull ? SEARCH_GAME_CONTENT.full : SEARCH_GAME_CONTENT.join}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="pregame-navigation">
          <Button
            type="text"
            className="pregame-utility"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate("/")}
          >
            {SEARCH_GAME_CONTENT.backHome}
          </Button>
        </div>
      </PregameShell>

      <Modal
        centered
        width={440}
        rootClassName="pregame-modal"
        title={SEARCH_GAME_CONTENT.joinPrivate}
        open={modalOpen}
        onOk={handleJoinByInvite}
        onCancel={() => setModalOpen(false)}
        okText={SEARCH_GAME_CONTENT.join}
        cancelText={SEARCH_GAME_CONTENT.cancel}
        destroyOnClose
        afterOpenChange={open => open && inputRef.current?.focus()}
      >
        <Input
          ref={inputRef}
          autoFocus
          size="large"
          aria-label={SEARCH_GAME_CONTENT.invitePlaceholder}
          placeholder={SEARCH_GAME_CONTENT.invitePlaceholder}
          value={inviteCode}
          onChange={(event) => setInviteCode(cleanInvite(event.target.value))}
          onPressEnter={handleJoinByInvite}
        />
      </Modal>
    </>
  );
}

export default SearchGame;
