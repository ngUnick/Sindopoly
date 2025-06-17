import { ConfigProvider } from "antd";
import Board from "./Board";
import bgImg from "../../assets/images/monopoly_bg.png";

export default function Game() {
  return (
    <div className="flex-grow bg-[#C1FFFB] flex items-center bg-cover bg-no-repeat" style={{ backgroundImage: `url(${bgImg})` }}>
      {/* vignette */}
      <div className="fixed inset-0 shadow-[0_0_80px_rgba(255,255,255,0.7)_inset] pointer-events-none" />
      <div className="w-[800px]">
        <ConfigProvider theme={{ token: { colorPrimary: "#00BF41" } }}>
          <Board />
        </ConfigProvider>
      </div>
    </div>
  );
}