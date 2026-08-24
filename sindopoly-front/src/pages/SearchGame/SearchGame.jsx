import { useEffect, useState, useRef } from "react";
import { GameAPI } from "../../apis/GameAPI";
import {
  Button,
  Table,
  Spin,
  Modal,
  Input,
  message,
  ConfigProvider,
} from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { sanitizeText } from "../../utils/sanitize";
import bgImg from "../../assets/images/monopoly_bg.png";

const antIcon = <LoadingOutlined style={{ fontSize: 24 }} spin />;

function SearchGame() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const inputRef = useRef(null); 
  const navigate = useNavigate();

  /* ─────────────────────────────────────────────────────────────
     columns – now sortable on Creator & Players
     ───────────────────────────────────────────────────────────── */
  const columns = [
    {
      title: "Creator",
      dataIndex: "Creator",
      key: "Creator",
      sorter: (a, b) => a.Creator.localeCompare(b.Creator),
    },
    {
      title: "Players",
      dataIndex: "PlayerCount",
      key: "PlayerCount",
      sorter: (a, b) =>
        parseInt(a.PlayerCount.split("/")[0]) -
        parseInt(b.PlayerCount.split("/")[0]),
    },
    {
      title: "Action",
      key: "action",
      render: (_, record) => {
        const current = parseInt(record.PlayerCount.split("/")[0]);
        const disabled = current >= 4;

        return (
          <Button
            disabled={disabled}
            onClick={async () => {
              try {
                await GameAPI.joinGame(record.GameId, record.StateVersion);
                navigate(`/lobby?game_id=${record.GameId}`);
              } catch (err) {
                message.error("Failed to join game.");
              }
            }}
          >
            {disabled ? "Full" : "Join"}
          </Button>
        );
      },
    },
  ];

  /* ─────────────────────────────────────────────────────────────
     fetch / refresh
     ───────────────────────────────────────────────────────────── */
  const fetchPublicGames = async () => {
    try {
      const list = await GameAPI.getPublicLobbyGames();
      const formatted = list.map((g, idx) => ({
        key: idx,
        GameId: g.gameId,
        Creator: g.creatorNickname,
        PlayerCount: `${g.playerCount}/4`,
        StateVersion: g.stateVersion,
      }));
      setGames(formatted);
    } catch (err) {
      message.error("Failed to load games");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    /* first load */
    fetchPublicGames();
    /* refresh every 3 s */
    const id = setInterval(fetchPublicGames, 10000);
    /* clean-up on unmount */
    return () => clearInterval(id);
  }, []);

  /* ─────────────────────────────────────────────────────────────
     join-by-code
     ───────────────────────────────────────────────────────────── */
  const handleJoinByInvite = async () => {
    const code = inviteCode.trim().toUpperCase();
    if (!code) return;

    try {
      // ⬅️ now use the helper
      const { gameId } = await GameAPI.joinWithInvite(code);

      message.success("Joined private game!");
      setModalOpen(false);
      setInviteCode("");
      navigate(`/lobby?game_id=${gameId}&visibility=${"private"}`);
    } catch (err) {
      message.error("Invalid or expired invite code.");
    }
  };

  const cleanInvite = (raw) => sanitizeText(raw, 5).toUpperCase();

  /* ───────────────────────────────────────────────────────────── */

  return (
    <div className="flex-grow flex justify-center items-center bg-cover bg-no-repeat" style={{ backgroundImage: `url(${bgImg})` }}>
      <div className="fixed w-full h-full shadow-[0_0_80px_rgba(255,255,255,0.7)_inset] left-0 top-0" />

      <div className="bg-[rgba(255,236,195,0.8)] pt-[50px] pb-[20px] px-5 backdrop-blur-sm border-solid border-[rgba(255,255,255,0.6)] rounded-md min-w-[700px]">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Public Lobbies</h2>
          <Button onClick={() => setModalOpen(true)}>Join by Code</Button>
        </div>

        {loading ? (
          <div className="text-center mt-5">
            <Spin indicator={antIcon} />
          </div>
        ) : (
          <ConfigProvider
            theme={{ token: { colorPrimary: "#cf971c" } }}
          >
            <Table
              columns={columns}
              dataSource={games}
              pagination={false}
              bordered
              size="small"
            />
          </ConfigProvider>
        )}
      </div>

      <Modal
        title="Join Private Game"
        open={modalOpen}
        onOk={handleJoinByInvite}
        onCancel={() => setModalOpen(false)}
        okText="Join"
        centered
        destroyOnClose
        afterOpenChange={(open) => open && inputRef.current?.focus()}
      >
        <Input
          ref={inputRef} 
          placeholder="Enter invite code..."
          value={inviteCode}
          onChange={(e) => setInviteCode(cleanInvite(e.target.value))}
          onPressEnter={handleJoinByInvite}
        />
      </Modal>
    </div>
  );
}

export default SearchGame;
