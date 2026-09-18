import { ConfigProvider } from "antd";
import Board from "./Board";
import bgImg from "../../assets/images/monopoly_bg.png";
import GameShell from "../../features/game/shell/GameShell";
import AuthoritativeGame from "./AuthoritativeGame.jsx";

// FE-REVAMP-021 keeps a local rollback path without mounting duplicate live owners.
export const FIRST_VERTICAL_SLICE_ENABLED = true;

export default function Game() {
  const legacyBoard = (
    <ConfigProvider theme={{ token: { colorPrimary: "#00BF41" } }}>
      <Board />
    </ConfigProvider>
  );

  return (
    <div className="flex-grow bg-[#C1FFFB] flex items-center bg-cover bg-no-repeat" style={{ backgroundImage: `url(${bgImg})` }}>
      {/* vignette */}
      <div className="fixed inset-0 shadow-[0_0_80px_rgba(255,255,255,0.7)_inset] pointer-events-none" />
      {FIRST_VERTICAL_SLICE_ENABLED
        ? <AuthoritativeGame />
        : <GameShell board={legacyBoard} legacy />}
    </div>
  );
}
