import { Button, message } from "antd";
import { CrownOutlined, DeleteOutlined, LogoutOutlined, PlayCircleOutlined } from "@ant-design/icons";
import { useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { GameAPI } from "../../apis/GameAPI";
import { acceptGameSnapshot } from "../../apis/gameCommandState";
import { useGameRealtime } from "../../hooks/useGameRealtime";
import {
  LOBBY_CONTENT,
  contentForTransportError,
} from "../../features/game/content/el.js";
import PregameShell from "../../features/pregame/PregameShell.jsx";

const Lobby = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);

  const gameId = params.get("game_id");
  const visibility = params.get("visibility") || "public";
  const playerId = localStorage.getItem("player_id");

  const [players, setPlayers] = useState([]);
  const [inviteCode, setInviteCode] = useState(null);
  const [stateVersion, setStateVersion] = useState(null);
  const isOwner = String(playerId) === String(gameId);
  const canStart = isOwner && players.length >= 2 && Number.isSafeInteger(stateVersion);

  const handleStartGame = async () => {
    try {
      await GameAPI.startGame(gameId, playerId, stateVersion);
      navigate(`/Game?game=${gameId}&player=${playerId}`);
    } catch (err) {
      console.error(err);
      message.error(contentForTransportError(err).message);
    }
  };

  const applyLobbySnapshot = (snapshot) => {
    if (snapshot.status === "inProgress") {
      navigate(`/Game?game=${gameId}&player=${playerId}`, { replace: true });
      return;
    }
    setPlayers((snapshot.players ?? []).map(player => ({
      id: player.playerId,
      nickname: player.nickname,
    })));
    setStateVersion(snapshot.stateVersion);
    if (visibility === "private") setInviteCode(snapshot.inviteCode ?? null);
  };

  const fetchPlayers = async () => {
    try {
      const snapshot = await GameAPI.getRealtimeSnapshot(gameId);
      if (acceptGameSnapshot(gameId, snapshot)) applyLobbySnapshot(snapshot);
    } catch (err) {
      console.error(err);
    }
  };

  useGameRealtime(gameId, applyLobbySnapshot);

  const handleLeaveGame = async () => {
    try {
      await GameAPI.removePlayer(gameId, playerId);
      navigate("/");
    } catch (err) {
      console.error(err);
    }
  };

  const handleKick = async (targetId) => {
    try {
      await GameAPI.kickPlayer(gameId, targetId);
      message.success(LOBBY_CONTENT.playerRemoved);
      fetchPlayers();
    } catch (err) {
      console.error(err);
      message.error(contentForTransportError(err).message);
    }
  };

  useEffect(() => {
    // STOMP drives normal updates; this slower poll repairs missed delivery/socket failure.
    let polling = false;
    const poll = async () => {
      if (polling) return;
      polling = true;
      try { await fetchPlayers(); } finally { polling = false; }
    };
    void poll();
    const interval = setInterval(poll, 10000);
    return () => clearInterval(interval);
  }, [gameId]);

  const visibilityLabel = visibility === "private" ? LOBBY_CONTENT.private : LOBBY_CONTENT.public;

  return (
    <PregameShell
      variant="wide"
      title={LOBBY_CONTENT.title}
      description={LOBBY_CONTENT.description}
    >
      <div className="pregame-lobby-summary" aria-label={LOBBY_CONTENT.visibility}>
        <span className="pregame-list__eyebrow">{LOBBY_CONTENT.visibility}</span>
        <strong className="pregame-badge">{visibilityLabel}</strong>
        {visibility === "private" && inviteCode && (
          <span className="pregame-invite-code">
            {LOBBY_CONTENT.inviteCode}: <strong>{inviteCode}</strong>
          </span>
        )}
      </div>

      <section className="pregame-section" aria-labelledby="lobby-players-heading">
        <h2 id="lobby-players-heading" className="pregame-section__title">{LOBBY_CONTENT.players}</h2>
        {players.length === 0 ? (
          <div className="pregame-empty" role="status"><p>{LOBBY_CONTENT.playerListEmpty}</p></div>
        ) : (
          <ul className="pregame-list pregame-player-list">
            {players.map(player => {
              const isCurrentPlayer = String(player.id) === String(playerId);
              const isLobbyOwner = String(player.id) === String(gameId);
              return (
                <li className="pregame-list__row" key={player.id}>
                  <div className="pregame-list__copy">
                    <strong>{player.nickname ?? `Παίκτης #${player.id}`}</strong>
                    <span className="pregame-player-labels">
                      {isCurrentPlayer && <span className="pregame-badge">{LOBBY_CONTENT.you}</span>}
                      {isLobbyOwner && <span className="pregame-badge pregame-badge--owner"><CrownOutlined /> {LOBBY_CONTENT.owner}</span>}
                    </span>
                  </div>
                  {isOwner && !isCurrentPlayer && (
                    <Button
                      type="text"
                      className="pregame-utility pregame-utility--destructive"
                      icon={<DeleteOutlined />}
                      aria-label={`${LOBBY_CONTENT.removePlayer}: ${player.nickname ?? player.id}`}
                      onClick={() => handleKick(player.id)}
                    >
                      {LOBBY_CONTENT.removePlayer}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {isOwner ? (
        <div className="pregame-actions pregame-lobby-actions">
          <div className="pregame-status" role="status" aria-live="polite">
            <p>{
              players.length < 2
                ? LOBBY_CONTENT.requiresPlayers
                : canStart ? LOBBY_CONTENT.readyToStart : LOBBY_CONTENT.synchronizing
            }</p>
          </div>
          <Button
            type="primary"
            size="large"
            className="pregame-primary"
            disabled={!canStart}
            icon={<PlayCircleOutlined />}
            onClick={handleStartGame}
          >
            {LOBBY_CONTENT.start}
          </Button>
        </div>
      ) : (
        <div className="pregame-status" role="status" aria-live="polite">
          <p>{LOBBY_CONTENT.ownerWaiting}</p>
        </div>
      )}

      <div className="pregame-navigation">
        <Button
          type="text"
          className="pregame-utility pregame-utility--destructive"
          icon={<LogoutOutlined />}
          onClick={handleLeaveGame}
        >
          {LOBBY_CONTENT.leave}
        </Button>
      </div>
    </PregameShell>
  );
};

export default Lobby;
