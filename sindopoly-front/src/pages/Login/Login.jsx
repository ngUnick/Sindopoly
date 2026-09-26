import { useContext, useEffect, useRef, useState } from "react";
import { Button, Input, Modal, message } from "antd";
import { useNavigate } from "react-router-dom";
import { AuthAPI } from "../../apis/AuthAPI";
import { apiFetch, clearCsrfToken } from "../../apis/apiClient";
import AuthContext from "../../AuthContext/AuthContext";
import { LOGIN_CONTENT } from "../../features/game/content/el.js";
import PregameShell from "../../features/pregame/PregameShell.jsx";
import { validateNickname } from "../../features/player/nicknamePolicy.js";

const Login = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const { login, currentPlayer, loading: sessionLoading } = useContext(AuthContext);

  useEffect(() => {
    if (!sessionLoading && currentPlayer) navigate("/", { replace: true });
  }, [currentPlayer, navigate, sessionLoading]);

  const isNicknameValid = (name) => {
    const result = validateNickname(name);
    if (result.reason === "short") {
      message.warning(LOGIN_CONTENT.nicknameMin);
    } else if (result.reason === "long") {
      message.warning(LOGIN_CONTENT.nicknameMax);
    } else if (!result.valid) {
      message.warning(LOGIN_CONTENT.nicknameCharacters);
    }
    return result;
  };

  const handleOk = async () => {
    const result = isNicknameValid(nickname);
    if (!result.valid) return;

    setLoading(true);
    const hide = message.loading(LOGIN_CONTENT.creatingPlayer, 0);

    try {
      const res = await apiFetch("/api/player-state/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: result.nickname }),
        csrf: false,
      });

      if (!res.ok) throw new Error("Failed to create player");

      const playerId = await res.json();
      clearCsrfToken();
      const currentPlayer = await AuthAPI.getCurrentPlayer();
      if (currentPlayer.id !== playerId) throw new Error("Session identity mismatch");
      login(currentPlayer);
      sessionStorage.setItem("nickname", currentPlayer.nickname);
      hide();
      setLoading(false);
      navigate("/");
    } catch (err) {
      console.error(err);
      hide();
      message.error(LOGIN_CONTENT.createFailed);
      setLoading(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter") handleOk();
  };

  return (
    <>
      <PregameShell title={LOGIN_CONTENT.title} description={LOGIN_CONTENT.description}>
        <div className="pregame-actions">
          <Button
            type="primary"
            size="large"
            className="pregame-primary"
            onClick={() => setIsModalOpen(true)}
          >
            {LOGIN_CONTENT.start}
          </Button>
        </div>
      </PregameShell>

      <Modal
        centered
        width={440}
        rootClassName="pregame-modal"
        title={LOGIN_CONTENT.chooseNickname}
        open={isModalOpen}
        onOk={handleOk}
        onCancel={() => setIsModalOpen(false)}
        afterOpenChange={open => open && inputRef.current?.focus()}
        okText={LOGIN_CONTENT.continue}
        cancelText={LOGIN_CONTENT.cancel}
        confirmLoading={loading}
        cancelButtonProps={{ disabled: loading }}
      >
        <Input
          ref={inputRef}
          autoFocus
          size="large"
          aria-label={LOGIN_CONTENT.nicknamePlaceholder}
          placeholder={LOGIN_CONTENT.nicknamePlaceholder}
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          onKeyDown={handleKeyDown}
          autoComplete="nickname"
        />
      </Modal>
    </>
  );
};

export default Login;
