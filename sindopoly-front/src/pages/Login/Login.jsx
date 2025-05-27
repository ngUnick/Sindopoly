import { useState, useEffect, useRef } from "react"; // ✅ add useRef
import { Button, Modal, Input, message } from "antd";
import monopoly_logo from "../../assets/images/monopoly_logo.png";
import { useNavigate } from "react-router-dom";
import { Filter } from 'glin-profanity';

const filter = new Filter({
  languages: ['english'],
  allowObfuscatedMatch: true,
  severityLevels: true,
  minSeverity: 1,
});

const Login = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [nickname, setNickname] = useState("");
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (isModalOpen && inputRef.current) {
      setTimeout(() => inputRef.current.focus(), 50);
    }
  }, [isModalOpen]);

  const handleStartClick = () => {
    setIsModalOpen(true);
  };

  const isNicknameValid = (name) => {
    const trimmed = name.trim();

    if (trimmed.length < 2) {
      message.warning("Nickname must be at least 2 characters.");
      return false;
    }

    if (trimmed.length > 15) {
      message.warning("Nickname must be no more than 15 characters.");
      return false;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      message.warning("Nickname can only contain letters, numbers, and underscores.");
      return false;
    }

    if (filter.isProfane(trimmed)) {
      message.error("Inappropriate nickname.");
      return false;
    }

    return true;
  };

  const handleOk = async () => {
    if (!isNicknameValid(nickname)) return;

    // store nickname locally
    const cleanName = nickname.trim();
    sessionStorage.setItem("nickname", cleanName);

    // ✅ Call backend to create player in DB
    try {
      const res = await fetch("http://localhost:8080/api/player-state/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: cleanName })
      });

      if (!res.ok) throw new Error("Failed to create player");

      const playerId = await res.json();
      localStorage.setItem("player_id", playerId); // ✅ used for all game flows

      navigate("/");
    } catch (err) {
      console.error(err);
      message.error("Could not save nickname. Try again.");
    }
  };


  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleOk();
    }
  };

  return (
    <div className="flex-grow flex justify-center items-center bg-pic bg-cover bg-no-repeat">
      {/* Vignette */}
      <div className="fixed w-full h-full shadow-[0_0_80px_rgba(255,255,255,0.7)_inset] left-0 top-0"></div>
      <div className="bg-[rgba(255,236,195,0.8)] pt-[50px] pb-[20px] px-5 backdrop-blur-sm border-solid border-[rgba(255,255,255,0.6)] rounded-md">
        <div className="w-[800px] flex flex-col gap-5 items-center pb-5">
          <img src={monopoly_logo} alt="logo" className="mb-5" />
          <Button type="primary" onClick={handleStartClick} className="px-5">
            Start
          </Button>
        </div>
      </div>

      <Modal
        title="Choose a Nickname"
        open={isModalOpen}
        onOk={handleOk}
        onCancel={() => setIsModalOpen(false)}
        okText="Continue"
      >
        <Input
          ref={inputRef}
          placeholder="Enter your nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          onKeyDown={handleKeyDown} // ✅ Listen for Enter
          maxLength={15}
        />
      </Modal>
    </div>
  );
};

export default Login;
