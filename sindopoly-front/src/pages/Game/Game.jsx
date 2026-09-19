import bgImg from "../../assets/images/monopoly_bg.png";
import AuthoritativeGame from "./AuthoritativeGame.jsx";

export default function Game() {
  return (
    <div className="flex-grow bg-[#C1FFFB] flex items-center bg-cover bg-no-repeat" style={{ backgroundImage: `url(${bgImg})` }}>
      {/* vignette */}
      <div className="fixed inset-0 shadow-[0_0_80px_rgba(255,255,255,0.7)_inset] pointer-events-none" />
      <AuthoritativeGame />
    </div>
  );
}
