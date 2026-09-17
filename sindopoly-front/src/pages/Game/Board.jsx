import React, { useEffect, useRef, useState } from "react";
import { GamePlayAPI, boardFromSnapshot } from "../../apis/GamePlayAPI";
import {
  applyOwnershipToSquares, deriveOwnershipProjection, propertyIdsForPlayer,
} from "../../apis/ownershipProjection";
import {
  enqueueNotification, observerNotification,
} from "../../apis/gameEvents";
import {
  isOptionalTurnChoice, OBSERVER_NOTIFICATION_DURATION_MS, ObserverNotificationToast, TurnResultModal,
} from "../../components/GameFeedback";
import { useGameRealtime } from "../../hooks/useGameRealtime";
import { TurnAPI }    from "../../apis/TurnAPI";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHouseUser,
  faDice,
  faVolumeHigh,
  faVolumeXmark,
} from "@fortawesome/free-solid-svg-icons";
import { useSearchParams, useNavigate } from "react-router-dom";
import API_BASE_URL      from "../../apis/apiConfig";
import honeyJam from "../../assets/audio/massobeats-honey_jam.mp3";
import boardGLB from "../../assets/models/board.glb?url";  // ⬅ forces asset handling
import diceModelUrl from "../../assets/models/Dice.glb?url";
import moneyImg from "../../assets/images/monopoly_money.png";
import { BoardSceneAdapter } from "../../features/game/board/BoardSceneAdapter.js";
import { buildDicePresentationModel } from "../../features/game/presentation/dicePresentationModel.js";
import { buildCompletionViewModel } from "../../features/game/presentation/gameViewModel.js";


function reportOwnershipIssues(ownership) {
  if (ownership.conflicts.length) {
    console.error("Conflicting property ownership in authoritative snapshot", ownership.conflicts);
  }
  if (ownership.invalidPlayers.length || ownership.invalidPropertyClaims.length) {
    console.warn("Ignored malformed property ownership claims", {
      invalidPlayers: ownership.invalidPlayers,
      invalidPropertyClaims: ownership.invalidPropertyClaims,
    });
  }
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}


const Board = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const gameParam   = searchParams.get("game");    // e.g. "3"
  const playerParam = searchParams.get("player");  // e.g. "3"

  const gameId   = gameParam   ? parseInt(gameParam, 10)   : null;
  const playerId = playerParam ? parseInt(playerParam, 10) : null;

  // Declarations and Initializations ---------------------------------------------------------------------------------------------
  const sceneContainerRef = useRef(null);
  const sceneAdapterRef = useRef(null);

  const [posInput, setposInput] = useState(0); // State to store the numeric value entered
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [playersAmount, setPlayersAmount] = useState(0);
  // const [player1Info, setPlayer1Info] = useState({ money: '-' });
  // const [player2Info, setPlayer2Info] = useState({ money: '-' });
  // const [player3Info, setPlayer3Info] = useState({ money: '-' });
  // const [player4Info, setPlayer4Info] = useState({ money: '-' });

  // [{ nickname: 'Alice', money: 1500 }, …]
  const [playersData, setPlayersData] = useState([]);

  // const moneySetters = [
  //   setPlayer1Info,
  //   setPlayer2Info,
  //   setPlayer3Info,
  //   setPlayer4Info,
  // ];

  const [diceTotal , setDice ] = useState(0);


  const [my_sira, setSira] = useState(1);

  const [selfIdx, setSelfIdx] = useState(null);
  const [turnIdx, setTurnIdx] = useState(null);



  // ── properties-modal state & handler ──────────────────────────────────
  const [propModalVisible, setPropModalVisible] = useState(false);
  const [propList, setPropList] = useState([]);  // array of strings like "Alice: 1,5,9"

  const showProperties = async () => {
    if (!gameId) return;
    try {
      const snapshot = await GamePlayAPI.getSnapshot(gameId);
      if (!snapshot) return;
      const ownership = deriveOwnershipProjection(snapshot);
      reportOwnershipIssues(ownership);

      // build lookup: position (0–39) -> name
      const nameByPos = new Map(
        gamePositions.map(({ position, name }) => [position, name])
      );

      const lines = (snapshot.players ?? []).flatMap(player => {
        if (!Number.isSafeInteger(player?.playerId) || player.playerId <= 0) return [];
        const labels = propertyIdsForPlayer(ownership, player.playerId).map(id =>
          nameByPos.get(id) ?? `#${id}`
        );
        const props = labels.length ? labels.join(", ") : "none";
        return [`${player.nickname}: ${props}`];
      });

      setPropList(lines);
      setPropModalVisible(true);
    } catch (e) {
      console.error("Failed to load properties:", e);
    }
  };


  // Audio Management --------------------------------------------------------------------------------------------------
  const [isVolumeVisible, setIsVolumeVisible] = useState(true);
  const [audio] = useState(() => new Audio(honeyJam));


  useEffect(() => {
    audio.volume = 0.5; // Set the volume of the audio element
    if (isVolumeVisible) {
      audio.pause();
    } else {
      audio.play();
    }
  }, [audio, isVolumeVisible]);
  

  const toggleIcons = () => {
    setIsVolumeVisible(!isVolumeVisible);
  };


  // Card Functionalities --------------------------------------------------------------------------------------------------


  function updateCard(
    newTitle,
    newDescription,
    newButton1Text,
    newButton2Text
  ) {
    const card = document.querySelector("#card"); // Select the hidden card
    const overlay = document.querySelector("#overlay");

    if (card && overlay) {
      card.classList.remove("hidden"); // Unhide the card
      overlay.classList.remove("hidden");

      const title = card.querySelector("#title");
      const description = card.querySelector("#desc");
      const action1 = card.querySelector("#act1");
      const action2 = card.querySelector("#act2");

      // Hide all elements initially (possibly redudant)
      if (title) title.classList.add("hidden");
      if (description) description.classList.add("hidden");
      if (action1) action1.classList.add("hidden");
      if (action2) action2.classList.add("hidden");

      // Update the title, description, and button texts
      if (newTitle !== null && title) {
        title.classList.remove("hidden");
        title.innerText = newTitle;
      } else if (title) {
        title.classList.add("hidden");
      }

      if (newDescription !== null && description) {
        description.classList.remove("hidden");
        description.innerText = newDescription;
      } else if (description) {
        description.classList.add("hidden");
      }

      if (newButton1Text !== null && action1) {
        action1.classList.remove("hidden");
        action1.innerText = newButton1Text["text"];
        action1.onclick = newButton1Text["function"];
      } else if (action1) {
        action1.classList.add("hidden");
      }

      if (newButton2Text !== null && action2) {
        action2.classList.remove("hidden");
        action2.innerText = newButton2Text["text"];
      } else if (action2) {
        action2.classList.add("hidden");
      }
    }
  }

  // Example usage:
  // updateCard('New Title', 'New Description', 'New Action 1', 'New Action 2');

  const closeCard = () => {
    const card = document.querySelector("#card");
    const overlay = document.querySelector("#overlay");

    card.classList.add("hidden");
    overlay.classList.add("hidden");
  };

  // Manage Properties ---------------------------------------------------------------------------------------------
  const [gamePositions, setGamePositions] = useState([
    { position: 0, type: "start", player: null, name: null },
    { position: 1, type: "property", player: null, name: "ΓΥΜΝΑΣΤΗΡΙΟ" },
    { position: 2, type: "card", player: null, name: "ΚΑΡΤΑ ΑΠΟΦΑΣΗΣ" },
    { position: 3, type: "property", player: null, name: "ΒΙΒΛΙΟΘΗΚΗ" },
    { position: 4, type: "", player: null, name: "ΕΝΟΙΚΙΟ" },
    { position: 5, type: "property", player: null, name: "ΚΙΟΣΚΙ Σ.Ε.Υ.Π." },
    { position: 6, type: "property", player: null, name: "ΣΤΑΣΗ ΔΙΠΑΕ" },
    { position: 7, type: "card", player: null, name: "ΚΑΡΤΑ ΕΝΤΟΛΗΣ" },
    { position: 8, type: "property", player: null, name: "ΣΤΑΣΗ ΙΘΑΚΗ" },
    { position: 9, type: "property", player: null, name: "ΣΤΑΣΗ ΤΕΡΜΑΤΙΚΟΥ" },
    { position: 10, type: "jail", player: null, name: "ΦΥΛΑΚΗ" },
    { position: 11, type: "property", player: null, name: "ΣΠΛΑΣ" },
    { position: 12, type: "card", player: null, name: "ΚΥΛΙΚΕΙΟ" },
    { position: 13, type: "property", player: null, name: "ΠΟΔΗΛΑΤΟ" },
    { position: 14, type: "property", player: null, name: "ΜΙΚΕΛ" },
    { position: 15, type: "property", player: null, name: "ΚΙΟΣΚΙ ΔΙΟΙΚΗΣΗΣ" },
    { position: 16, type: "property", player: null, name: "ΒΙΒΛΙΟΘΗΚΟΝΟΜΙΑΣ" },
    { position: 17, type: "card", player: null, name: "ΚΑΡΤΑ ΑΠΟΦΑΣΗΣ" },
    { position: 18, type: "property", player: null, name: "ΠΡΟΣΧΟΛΙΚΩΝ" },
    {
      position: 19,
      type: "property",
      player: null,
      name: "ΤΕΧΝΟΛΟΓΙΑΣ ΤΡΟΦΙΜΩΝ",
    },
    { position: 20, type: "parking", player: null, name: "ΝΑΥΤΙΛΟΣ" },
    { position: 21, type: "property", player: null, name: "ΠΕΡΙΒΑΛΛΟΝΤΟΣ" },
    { position: 22, type: "card", player: null, name: "ΚΑΡΤΑ ΕΝΤΟΛΗΣ" },
    { position: 23, type: "property", player: null, name: "ΓΕΩΠΟΝΙΑΣ" },
    {
      position: 24,
      type: "property",
      player: null,
      name: "ΔΙΑΤΡΟΦΗΣ/ΔΙΑΙΤΟΛΟΓΙΑΣ",
    },
    { position: 25, type: "property", player: null, name: "ΚΙΟΣΚΙ ΕΞΟΔΟΥ" },
    { position: 26, type: "property", player: null, name: "ΜΑΙΕΥΤΙΚΗΣ" },
    { position: 27, type: "property", player: null, name: "ΝΟΣΗΛΕΥΤΙΚΗΣ" },
    { position: 28, type: "property", player: null, name: "ΛΕΣΧΗ" },
    { position: 29, type: "property", player: null, name: "ΒΙΟΪΑΤΡΙΚΩΝ" },
    { position: 30, type: "goToJail", player: null, name: "ΠΑΝΕ ΣΤΗ ΦΥΛΑΚΗ" },
    { position: 31, type: "property", player: null, name: "ΤΟΥΡΙΣΜΟΥ" },
    { position: 32, type: "property", player: null, name: "ΔΙΟΙΚΗΣΗΣ" },
    { position: 33, type: "card", player: null, name: "ΚΑΡΤΑ ΑΠΟΦΑΣΗΣ" },
    { position: 34, type: "property", player: null, name: "ΛΟΓΙΣΤΙΚΗΣ" },
    {
      position: 35,
      type: "property",
      player: null,
      name: "ΚΙΟΣΚΙ ΠΛΗΡΟΦΟΡΙΚΗΣ",
    },
    { position: 36, type: "card", player: null, name: "ΚΑΡΤΑ ΕΝΤΟΛΗΣ" },
    { position: 37, type: "property", player: null, name: "ΠΛΗΡΟΦΟΡΙΚΗΣ" },
    { position: 38, type: "card", player: null, name: "ΕΞΟΔΑ ΓΙΑ ΨΩΝΙΑ" },
    { position: 39, type: "property", player: null, name: "ΗΛΕΚΤΡΟΝΙΚΗΣ" },
  ]);

  // ─── new state for our two-step turn modal ─────────────────────────
  // holds the event data (buyOffer, rentDue, card, jailOffer…)
  // holds the raw ThrowResultDto: { dice,newPosition,passedGo,squareType,data }
  const [turnResult,  setTurnResult]   = useState(null);
  const optionalPromptKeyRef = useRef(null);
  // whether to show the modal overlay
  const [modalVisible, setModalVisible] = useState(false);
  const [observerQueue, setObserverQueue] = useState([]);
  const activeObserverNotification = observerQueue[0] ?? null;
  const activeObserverNotificationId = activeObserverNotification?.id;

  useEffect(() => {
    if (!activeObserverNotificationId) return undefined;
    const timeout = window.setTimeout(
      () => setObserverQueue(queue => queue.slice(1)),
      OBSERVER_NOTIFICATION_DURATION_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [activeObserverNotificationId]);

  function filterAndDisplayNames() {
    const filteredPositions = gamePositions.filter(
      (position) => position.type === "property" && position.player !== null
    );

    let description = "";
    filteredPositions.forEach((position) => {
      const playerName = position.player !== null ? position.player : "";
      description += `${position.name}: ${playerName}\n`;
    });

    // Display names in the card description using updateCard function
    updateCard("ΙΔΙΟΚΤΗΣΙΕΣ", description, null, null);
  }

  // Example usage:
  // filterAndDisplayNames();

  // Function to add the "disable" class to the button with id "dice"
  function disableDice() {
    const diceButton = document.getElementById('dice');
    if (diceButton) {
      diceButton.classList.add('disable');
    }
  }

  // Function to remove the "disable" class from the button with id "dice"
  function enableDice() {
    const diceButton = document.getElementById('dice');
    if (diceButton) {
      diceButton.classList.remove('disable');
    }
  }

  // Function to add the "disable" class to the button with id "money"
  function disableMoney(id) {
    const moneyChip = document.getElementById(id);
    if (moneyChip) {
      moneyChip.classList.add('hidden');
    }
  }

  // Function to remove the "disable" class from the button with id "money"
  function enableMoney(id) {
    const moneyChip = document.getElementById(id);
    if (moneyChip) {
      moneyChip.classList.remove('hidden');
    }
  }






  // Handle Game Tick --------------------------------------------------------------------------------------------------
  const handleTick = async (realtimeSnapshot = null) => {
    if (!gameId) return;

      const snapshot = realtimeSnapshot?.stateVersion != null
        ? realtimeSnapshot
        : await GamePlayAPI.getSnapshot(gameId);

      // A slower polling response may be rejected after a newer socket snapshot.
      if (!snapshot) return;
      const board = boardFromSnapshot(snapshot);
      if (!board.length) return;

      const ownership = deriveOwnershipProjection(snapshot);
      reportOwnershipIssues(ownership);
      setGamePositions(positions => applyOwnershipToSquares(positions, ownership));

      // who am I in that array?
      const myIndex   = board.findIndex(p => String(p.player_id) === String(playerId));
      // whose turn is it in that array?
      const turnIndex = board.findIndex(p => String(p.player_id) === String(board[0].playerTurn));

      
      setSelfIdx(  myIndex);
      setTurnIdx( turnIndex);

      const { gameStatus: status, playerTurn, ...me } = board[0];



      // ── 0. re-orient camera to the side YOU are on ──────────────────
      if (myIndex >= 0) {
        const myPos = board[myIndex].position;  // 0–39
        sceneAdapterRef.current?.orientCameraForPosition(myPos);
      }



      // build array of { nickname, money } in Redis order
      setPlayersData(board.map(p => ({
        playerId: p.player_id,
        nickname: p.nickname,
        money:     p.money != null ? p.money : 0
      })));
      
      // update turn + UI
      setPlayersAmount(board.length);
      setIsMyTurn(playerTurn == playerId);
      playerTurn === playerId ? enableDice() : disableDice();

      // Reconnect/poll recovery for server-created choices, including a jailed
      // player selected by the previous player's atomic turn completion.
      if (playerTurn == playerId && board[0].optionalAction) {
        try {
          const pending = JSON.parse(board[0].optionalAction);
          const promptKey = `${pending.type}:${pending.stateVersion}`;
          if (String(pending.playerId) === String(playerId) && optionalPromptKeyRef.current !== promptKey) {
            optionalPromptKeyRef.current = promptKey;
            setTurnResult({
              squareType: pending.type === "PAY_JAIL_EXIT" ? 10 : 5,
              data: pending.cost,
              newPosition: pending.squareId
            });
            setModalVisible(true);
          }
        } catch (error) {
          console.error("Invalid server optional-action projection", error);
        }
      } else if (!board[0].optionalAction) {
        optionalPromptKeyRef.current = null;
      }

      // completed?
      if (status === "ended") {
        const completion = buildCompletionViewModel(snapshot);
        if (!completion.available) {
          console.error("Authoritative completion result is unavailable");
          return;
        }
        navigate("/endgame", { replace: true, state: { completion } });
        return
      }


      sceneAdapterRef.current?.setPawnPositions(board);
  };

  const handleRealtimeEvent = event => {
    const diceDetail = event?.payload?.details?.find(detail => detail.type === "DICE_ROLLED");
    const dicePresentation = buildDicePresentationModel({
      ...diceDetail,
      presentationId: event?.stateVersion,
    });
    if (dicePresentation) {
      setDice(dicePresentation.total);
      sceneAdapterRef.current?.presentDiceRoll({
        ...dicePresentation,
        reducedMotion: prefersReducedMotion(),
      });
    }
    const playerName = id => playersData.find(player => String(player.playerId) === String(id))?.nickname
      ?? `Παίκτης ${id}`;
    const squareName = id => gamePositions.find(square => square.position === id)?.name ?? `#${id}`;
    const notification = observerNotification(event, playerId, playerName, squareName);
    if (notification) setObserverQueue(queue => enqueueNotification(queue, notification));
  };

  useGameRealtime(gameId, handleTick, handleRealtimeEvent);


  useEffect(() => {
    if (gameId == null) {
      console.error("Board.jsx: missing or invalid gameId");
      return undefined;
    }
    const adapter = new BoardSceneAdapter({ boardModelUrl: boardGLB, diceModelUrl });
    sceneAdapterRef.current = adapter;
    adapter.mount(sceneContainerRef.current);

    let polling = false;
    const poll = async () => {
      if (polling) return;
      polling = true;
      try { await handleTick(); } finally { polling = false; }
    };
    void poll();
    
    
    // STOMP drives normal updates; retain a bounded recovery poll for broker/socket loss.
    const id = setInterval(poll, 15000);
    return () => {
      clearInterval(id);
      adapter.dispose();
      if (sceneAdapterRef.current === adapter) sceneAdapterRef.current = null;
    };
  }, [gameId, playerId, navigate]);

  /** STEP 1: click dice → throw & move */
  const throwDiceAction = async () => {
    if (!isMyTurn) return;

    try {
      // 1️⃣ roll & move
      const tr = await TurnAPI.throwDice(gameId, playerId);
      const {
        total,
        newPosition,
        passedGo,
        squareType,
        data
      } = tr;

      // disable UI & show dice
      setIsMyTurn(false);
      setDice(total ?? 0);
      const dicePresentation = buildDicePresentationModel({
        ...tr,
        presentationId: tr.stateVersion,
      });
      if (dicePresentation) {
        sceneAdapterRef.current?.presentDiceRoll({
          ...dicePresentation,
          reducedMotion: prefersReducedMotion(),
        });
      }
      await new Promise(r => setTimeout(r, 1000));
      sceneAdapterRef.current?.setPawnPosition(playerId, newPosition);

      // 2️⃣ always show modal with the raw result
      setTurnResult(tr);
      setModalVisible(true);
      // your modal will read squareType/data to show Yes/No or just OK

      } catch (e) {
        console.error("Turn failed:", e);
        // optionally re-sync
        await handleTick();
      }
  };

  /** STEP 2: modal button handler */
  const handleModalChoice = async (choice) => {
    if (!turnResult) return;
    try {
      // Automatic square effects were already committed with RollDice. Only
      // genuine server-created choices submit a second command.
      if (isOptionalTurnChoice(turnResult)) {
        if (choice) {
          await TurnAPI.doAction(gameId, playerId, true);
        } else {
          await TurnAPI.pass(gameId, playerId);
        }
      }

      setModalVisible(false);
      setTurnResult(null);

      // 3️⃣ refresh & re-enable
       await handleTick();
     } catch (e) {
       console.error("Action failed:", e);
     }
  };


  // UI Elements ----------------------------------------------------------------------------------------------------
  return (
    <div className="relative h-screen w-screen">
      <div ref={sceneContainerRef} className="absolute inset-0" />

      <div className="first-nav">
        {playersData.map((p, idx) => (
          <span
            key={p.playerId}
            className={`
              px-5 
              ${idx === turnIdx ? "animated-box" : ""}`}
          >
            <img
              src={moneyImg}
              alt={`${p.nickname}'s money`}
              style={{ width: "25px", height: "25px", marginRight: "10px" }}
            />
            <div className="flex flex-col items-start">
              <small className="text-xs font-medium" style={{ position: "absolute", transform: "translateX(-50%) translateY(-250%)", fontWeight: idx === selfIdx ? "700" : "500", color: "black" , fontSize: idx === selfIdx ? "1.2rem" : "1rem" }}>{p.nickname}</small>
              <p className="text-lg font-semibold">€{p.money}</p>
            </div>
          </span>
        ))}
      </div>

      <ObserverNotificationToast
        notification={activeObserverNotification}
        onDismiss={() => setObserverQueue(queue => queue.slice(1))}
      />

      
      
      <div className="sec-nav">
      <button className="property-btn volume" onClick={toggleIcons}>
        <FontAwesomeIcon icon={faVolumeHigh} className={isVolumeVisible ? 'hidden' : ''}/>
        <FontAwesomeIcon icon={faVolumeXmark} className={isVolumeVisible ? '' : 'hidden'}/>
      </button>

        <button
          className="property-btn"
          onClick={() => {
            showProperties();
          }}
        >
          <FontAwesomeIcon icon={faHouseUser} id="property" />
        </button>
        <button
          disabled={!isMyTurn}
          className={`property-btn`}
          onClick={throwDiceAction}
          
        >
          <FontAwesomeIcon icon={faDice}  id="dice" />
        </button>
      </div>

      <div className="third-nav max-w-[100px]">
        <span><p>{diceTotal}</p></span>
      </div>



      {/* Modal Overlay & Card */}
      <TurnResultModal
        visible={modalVisible}
        turnResult={turnResult}
        gamePositions={gamePositions}
        onChoice={handleModalChoice}
      />


      {/* ── Properties Modal ─────────────────────────────────────────────────── */}
      {propModalVisible && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-[rgba(255,236,195,0.8)] backdrop-blur-sm border border-white/60 rounded-md p-6 shadow-lg max-w-sm">
            <h2 className="text-xl font-semibold mb-4">Player Properties</h2>
            <ul className="mb-4 list-disc list-inside space-y-1">
              {propList.map((line, i) => (
                <li key={i} className="text-sm">{line}</li>
              ))}
            </ul>
            <button
              className="px-5 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              onClick={() => setPropModalVisible(false)}
            >
              OK
            </button>
          </div>
        </div>
      )}



    </div>
  ); // Return canvas element for rendering
};

export default Board;
