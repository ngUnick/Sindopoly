import { useState, useEffect, useRef, useContext } from "react";
import { Button, Modal, Input, message } from "antd";
import monopoly_logo from "../../assets/images/monopoly_logo.png";
import { useNavigate } from "react-router-dom";
import { Filter } from "glin-profanity";
import { sanitizeText } from "../../utils/sanitize";
import bgImg from "../../assets/images/monopoly_bg.png";
import AuthContext from "../../AuthContext/AuthContext";
import { AuthAPI } from "../../apis/AuthAPI";
import { apiFetch, clearCsrfToken } from "../../apis/apiClient";
import { LOGIN_CONTENT } from "../../features/game/content/el.js";

const filter = new Filter({
  languages: ["english"],
  allowObfuscatedMatch: true,
  severityLevels: true,
  minSeverity: 1,
});

const Login = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const { login, currentPlayer, loading: sessionLoading } = useContext(AuthContext);

  useEffect(() => {
    if (isModalOpen && inputRef.current) {
      setTimeout(() => inputRef.current.focus(), 50);
    }
  }, [isModalOpen]);

  useEffect(() => {
    if (!sessionLoading && currentPlayer) {
      navigate("/", { replace: true });
    }
  }, [currentPlayer, navigate, sessionLoading]);

  const handleStartClick = () => {
    setIsModalOpen(true);
  };

  const isNicknameValid = (name) => {
    const trimmed = name.trim();

    if (trimmed.length < 2) {
      message.warning(LOGIN_CONTENT.nicknameMin);
      return false;
    }

    if (trimmed.length > 15) {
      message.warning(LOGIN_CONTENT.nicknameMax);
      return false;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      message.warning(LOGIN_CONTENT.nicknameCharacters);
      return false;
    }

    if (filter.isProfane(trimmed)) {
      message.error(LOGIN_CONTENT.inappropriateNickname);
      return false;
    }

    return true;
  };

  const handleOk = async () => {
    if (!isNicknameValid(nickname)) return;

    const cleanName = nickname.trim();
    sessionStorage.setItem("nickname", cleanName);

    setLoading(true);
    const hide = message.loading(LOGIN_CONTENT.creatingPlayer, 0);

    try {
      const res = await apiFetch("/api/player-state/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: cleanName }),
        csrf: false,
      });

      if (!res.ok) throw new Error("Failed to create player");

      const playerId = await res.json();
      clearCsrfToken();
      const currentPlayer = await AuthAPI.getCurrentPlayer();
      if (currentPlayer.id !== playerId) throw new Error("Session identity mismatch");
      login(currentPlayer);
      hide(); // hide loading
      setLoading(false);
      navigate("/");
    } catch (err) {
      console.error(err);
      hide();
      message.error(LOGIN_CONTENT.createFailed);
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      handleOk();
    }
  };

  return (
    <div className="flex-grow flex justify-center items-center bg-cover bg-no-repeat" style={{ backgroundImage: `url(${bgImg})` }}>
      <div className="fixed w-full h-full shadow-[0_0_80px_rgba(255,255,255,0.7)_inset] left-0 top-0"></div>
      <div className="bg-[rgba(255,236,195,0.8)] pt-[50px] pb-[20px] px-5 backdrop-blur-sm border-solid border-[rgba(255,255,255,0.6)] rounded-md">
        <div className="w-[800px] flex flex-col gap-5 items-center pb-5">
          <img src={monopoly_logo} alt="logo" className="mb-5" />
          <Button type="primary" onClick={handleStartClick} className="px-5">
            {LOGIN_CONTENT.start}
          </Button>
        </div>
      </div>

      <Modal
        centered
        width={400}
        title={LOGIN_CONTENT.chooseNickname}
        open={isModalOpen}
        onOk={handleOk}
        onCancel={() => setIsModalOpen(false)}
        okText={LOGIN_CONTENT.continue}
        confirmLoading={loading}
      >
        <Input
          ref={inputRef}
          placeholder={LOGIN_CONTENT.nicknamePlaceholder}
          value={nickname}
          onChange={(e) => setNickname(sanitizeText(e.target.value))}
          onKeyDown={handleKeyDown}
          maxLength={15}
        />
      </Modal>
    </div>
  );
};

export default Login;
