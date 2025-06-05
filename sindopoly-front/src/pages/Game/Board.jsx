import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GamePlayAPI } from "../../apis/GamePlayAPI";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHouseUser,
  faDice,
  faVolumeHigh,
  faVolumeXmark,
} from "@fortawesome/free-solid-svg-icons";
import { useSearchParams, useNavigate } from "react-router-dom";
import API_BASE_URL      from "../../apis/apiConfig";


const Board = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const gameId   = searchParams.get("game_id");           // ← passed by Lobby
  const playerId = localStorage.getItem("player_id");

  // Declarations and Initializations ---------------------------------------------------------------------------------------------
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const sphereRef = useRef(null);
  const torusRef = useRef(null);
  const cubeRef = useRef(null);
  const coneRef = useRef(null);
  // const ironRef = useRef(null);

  const rWidth = window.innerWidth; // Percentage of screen that will be used by the canvas
  const rHeight = window.innerHeight * 0.99; // Percentage of screen that will be used by the canvas

  const [posInput, setposInput] = useState(0); // State to store the numeric value entered
  const [isMyTurn, setIsMyTurn] = useState(true);
  const [playersAmount, setPlayersAmount] = useState(0);
  const [player1Info, setPlayer1Info] = useState({ money: '-' });
  const [player2Info, setPlayer2Info] = useState({ money: '-' });
  const [player3Info, setPlayer3Info] = useState({ money: '-' });
  const [player4Info, setPlayer4Info] = useState({ money: '-' });

  const [diceTotal , setDice ] = useState(0);


  const [my_sira, setSira] = useState(1);

  // Audio Management --------------------------------------------------------------------------------------------------
  const [isVolumeVisible, setIsVolumeVisible] = useState(true);
  const [audio] = useState(new Audio('src/assets/audio/massobeats-honey_jam.mp3'));


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
  document.addEventListener("click", function (event) {
    // Event listener for closing the card when clicked outside of it
    const overlay = document.querySelector("#overlay");
    if (overlay.contains(event.target)) {
      closeCard();
    }
  });

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
    { position: 2, type: "card", player: null, name: null },
    { position: 3, type: "property", player: null, name: "ΒΙΒΛΙΟΘΗΚΗ" },
    { position: 4, type: "card", player: null, name: null },
    { position: 5, type: "property", player: null, name: "ΚΙΟΣΚΙ Σ.Ε.Υ.Π." },
    { position: 6, type: "property", player: null, name: "ΣΤΑΣΗ ΔΙΠΑΕ" },
    { position: 7, type: "card", player: null, name: null },
    { position: 8, type: "property", player: null, name: "ΣΤΑΣΗ ΙΘΑΚΗ" },
    { position: 9, type: "property", player: null, name: "ΣΤΑΣΗ ΤΕΡΜΑΤΙΚΟΥ" },
    { position: 10, type: "jail", player: null, name: null },
    { position: 11, type: "property", player: null, name: "ΣΠΛΑΣ" },
    { position: 12, type: "card", player: null, name: "ΚΥΛΙΚΕΙΟ" },
    { position: 13, type: "property", player: null, name: "ΠΟΔΗΛΑΤΟ" },
    { position: 14, type: "property", player: null, name: "ΜΙΚΕΛ" },
    { position: 15, type: "property", player: null, name: "ΚΙΟΣΚΙ ΔΙΟΙΚΗΣΗΣ" },
    { position: 16, type: "property", player: null, name: "ΒΙΒΛΙΟΘΗΚΟΝΟΜΙΑΣ" },
    { position: 17, type: "card", player: null, name: null },
    { position: 18, type: "property", player: null, name: "ΠΡΟΣΧΟΛΙΚΩΝ" },
    {
      position: 19,
      type: "property",
      player: null,
      name: "ΤΕΧΝΟΛΟΓΙΑΣ ΤΡΟΦΙΜΩΝ",
    },
    { position: 20, type: "parking", player: null, name: null },
    { position: 21, type: "property", player: null, name: "ΠΕΡΙΒΑΛΛΟΝΤΟΣ" },
    { position: 22, type: "card", player: null, name: null },
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
    { position: 30, type: "goToJail", player: null, name: null },
    { position: 31, type: "property", player: null, name: "ΤΟΥΡΙΣΜΟΥ" },
    { position: 32, type: "property", player: null, name: "ΔΙΟΙΚΗΣΗΣ" },
    { position: 33, type: "card", player: null, name: null },
    { position: 34, type: "property", player: null, name: "ΛΟΓΙΣΤΙΚΗΣ" },
    {
      position: 35,
      type: "property",
      player: null,
      name: "ΚΙΟΣΚΙ ΠΛΗΡΟΦΟΡΙΚΗΣ",
    },
    { position: 36, type: "card", player: null, name: null },
    { position: 37, type: "property", player: null, name: "ΠΛΗΡΟΦΟΡΙΚΗΣ" },
    { position: 38, type: "card", player: null, name: null },
    { position: 39, type: "property", player: null, name: "ΗΛΕΚΤΡΟΝΙΚΗΣ" },
  ]);

  // Example: Accessing a specific game position
  // console.log(gamePositions[0]); // debug

  function filterAndDisplayNames() {
    console.log(gamePositions);
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

  // Handle Movement -------------------------------------------------------------------------------------------------------------
  const findSteps = (player, position) => {
    let stepInput;

    if (position > player.userData.stepCounter) {
      stepInput = position - player.userData.stepCounter;
      movePlayer(player, stepInput);
    } else if (position < player.userData.stepCounter) {
      stepInput = 40 + position - player.userData.stepCounter;
      movePlayer(player, stepInput);
    }
  };

  const movePlayer = (player, steps) => {
    const MAX_STEPS = 10; // Maximum steps before making a turn

    let remainingSteps = steps; // Remaining steps for a single move

    while (remainingSteps > 0) {
      // If the player hasn't reached the maximum steps, continue moving in the current direction
      if (
        player.userData.stepCounter % MAX_STEPS !== 0 ||
        player.userData.stepCounter == 0
      ) {
        // Update position and steps taken
        remainingSteps--;
        handleMove(player);
      } else {
        // Update direction, then update position and steps taken
        handleTurn(player);
        remainingSteps--;
        handleMove(player);
      }
    }

    getPos(player);
  };

  const handleMove = (player) => {
    // console.log(rHeight);

    let stepSize;

    if (player) {
      if (
        player.userData.stepCounter % 10 == 0 ||
        player.userData.stepCounter % 10 == 9
      ) {
        stepSize = 6;
        // console.log("big step"); // debug
      } else {
        stepSize = 4.15;
      }
    }

    switch (player.userData.caseNumber) {
      case 1:
        if (player) {
          player.position.z += stepSize; // Move the player 1 unit along the Z-axis backward
        }
        break;

      case 2:
        if (player) {
          player.position.x -= stepSize; // Move the player 1 unit along the X-axis backward
        }
        break;

      case 3:
        if (player) {
          player.position.z -= stepSize; // Move the player 1 unit along the Z-axis forward
        }
        break;

      case 4:
        if (player) {
          player.position.x += stepSize; // Move the player 1 unit along the X-axis forward
        }
        break;

      default:
        console.log("caseNumber doesn't have a correct value"); // debug
    }

    player.userData.stepCounter++;
    // console.log("step", player.userData.stepCounter); // debug
  };

  const handleTurn = (player) => {
    if (player.userData.stepCounter == 40) {
      player.userData.stepCounter = 0; // Make the counter 0 if we reach 40 steps
    }

    if (player.userData.caseNumber >= 1 && player.userData.caseNumber <= 3) {
      // Circle caseNumber from 1 to 4 and back
      player.userData.caseNumber += 1;
    } else {
      player.userData.caseNumber = 1;
    }

    // console.log("caseNumber", player.userData.caseNumber); // debug
  };

  const getPos = (player) => {
    return player.userData.stepCounter;
  };

  // Handle Dice Rolls --------------------------------------------------------------------------------------------------
  let dice1;
  let dice2;

  // Assuming you have the 'dice' loaded and available

  const randomDiceThrow = (dice, dresult) => {
    if (!dice) {
      console.error("Dice model not loaded yet");
      return;
    }

    // Randomize velocities
    let yVel = -19;
    if (dresult == 3) {
      yVel = -18.2;
      // console.log("wow");
    } else if (dresult == 4) {
      yVel = -19.9;
    }

    const rand = Math.random() * 20;
    const xVel = 5 + rand;
    const zVel = 5 + rand;
    let velocity = new THREE.Vector3(xVel, yVel, zVel);

    const angularList = [
      [12.6, 9.45, 11.0], // 1
      [11, 9.45, 11.05], // 2
      [6.25, 9.45, 9.4], // 3
      [12.55, 9.45, 12.55], // 4
      [7.85, 9.45, 10.7], // 5
      [9.4, 9.45, 11.05], // 6
    ];

    const selectedAng = angularList[dresult - 1];

    const angularVel = new THREE.Vector3(
      selectedAng[0], // First value from the selected group
      selectedAng[1], // Second value from the selected group
      selectedAng[2] // Third value from the selected group
    );

    let angularVelocity = angularVel;

    // Use these values for the dice animation
    const duration = 1000; // Duration of the animation in milliseconds
    const startTime = performance.now();

    const animateRoll = (timestamp) => {
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1); // Normalize the progress between 0 and 1

      // Apply random velocities for position and rotation
      const x = velocity.x * progress - 10;
      const y = velocity.y * progress + 20;
      const z = velocity.z * progress - 10;
      dice.position.set(x, y, z);

      const rotX = angularVelocity.x * progress;
      const rotY = angularVelocity.y * progress;
      const rotZ = angularVelocity.z * progress;
      dice.rotation.set(rotX, rotY, rotZ);

      if (elapsed < duration) {
        requestAnimationFrame(animateRoll);
      } else {
        // Animation complete, perform actions after the roll
        // console.log("Dice roll finished!");
      }
    };

    // Reveal dices
    dice.visible = true;
    // dice2.visible = true;

    // Hide dices after 5 seconds
    setTimeout(() => {
      dice.visible = false;
      // dice2.visible = false;
    }, 5000);

    // Start the animation
    requestAnimationFrame(animateRoll);
  };

  // const rollDiceWithRandomValues = (dice) => {
    
  // };

  // Call the roll animation function when needed
  // randomDiceThrow();

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


  useEffect(() => {
    // Board Creation --------------------------------------------------------------------------------------------------------
    const scene = new THREE.Scene(); // Create a Three.js scene
    sceneRef.current = scene;
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    ); // Create a perspective camera
    cameraRef.current = camera;
    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current }); // Create a WebGL renderer and attach it to the canvas
    renderer.setClearColor(0x000000, 0); // Make the scene fully transparent

    rendererRef.current = renderer;
    renderer.setSize(rWidth, rHeight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1); // Add ambient light to the scene
    ambientLight.position.set(0, 250, 0);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfff0cf, 6);
    dirLight.position.set(10, 40, -10);
    dirLight.castShadow = true;
    dirLight.shadow.camera.top = 2;
    dirLight.shadow.camera.bottom = -2;
    dirLight.shadow.camera.left = -2;
    dirLight.shadow.camera.right = 2;
    dirLight.shadow.camera.near = 0.1;
    dirLight.shadow.camera.far = 40;
    scene.add(dirLight);

    const loader = new GLTFLoader();

    // Load the GLB file
    loader.load(
      "src/assets/models/board.glb", // Replace 'path_to_your_board_model.glb' with the actual path
      (gltf) => {
        const board = gltf.scene.clone();

        const newScale = 0.035; // Set the new scale factor

        // You may need to scale, position, or rotate the board as needed
        board.scale.set(newScale, newScale, newScale); // Adjust the scale if needed
        board.position.set(0, 0, 0); // Adjust the position if needed
        board.rotation.set(0, Math.PI / 2, 0); // Adjust the rotation if needed

        scene.add(board); // Add the loaded board to the scene
      },
      undefined,
      (error) => {
        console.error("Error loading GLB model", error);
      }
    );

    // Player Creation --------------------------------------------------------------------------------------------------

    // loader.load(
    //   'src/assets/models/pawns/Iron.glb',
    //   (gltf) => {
    //     // Get the loaded model from the result
    //     const iron = gltf.scene.clone();

    //     const newScale = 0.035; // Set the new scale factor

    //     // You may need to scale, position, or rotate the board as needed
    //     iron.scale.set(newScale, newScale, newScale); // Adjust the scale if needed

    //     // Set initial position of the model
    //     iron.position.set(0, 22.8, 0);

    //     iron.rotation.set(0, 0, 0); // Adjust the rotation if needed

    //     // Add the model to the scene
    //     scene.add(iron);

    //     // Add additional properties to the model's userData
    //     iron.userData.stepCounter = 0;
    //     iron.userData.caseNumber = 1;
    //     // iron.userData.money = 1500;

    //     // Store a reference to the model for later use if needed
    //     ironRef.current = iron;
    //   },
    //   undefined,
    //   (error) => {
    //     console.error('Error loading model:', error);
    //   }
    // );

    const cubeGeometry = new THREE.BoxGeometry(); // Create a cube geometry and material
    const cubeMaterial = new THREE.MeshPhongMaterial({ color: 0xff0000 });
    const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
    cube.position.set(22, 0.5, -22); // Position of the cube on the board (x, y, z)
    cubeRef.current = cube;
    cube.userData.stepCounter = 0; // stepCounter for the specific player
    cube.userData.caseNumber = 1; // caseNumber for the specific player
    cube.userData.money = 1500; // money for the specific player
    scene.add(cube);

    const sphereGeometry = new THREE.SphereGeometry(0.5, 32, 32); // Create a sphere geometry and material
    const sphereMaterial = new THREE.MeshPhongMaterial({ color: 0x00ff00 });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.position.set(23, 0.7, -23); // Position of the sphere on the board (x, y, z)
    sphereRef.current = sphere;
    sphere.userData.stepCounter = 0; // stepCounter for the specific player
    sphere.userData.caseNumber = 1; // caseNumber for the specific player
    sphere.userData.money = 1500; // money for the specific player
    scene.add(sphere);

    const torusGeometry = new THREE.TorusGeometry(0.5, 0.2, 16, 100); // Create a torus geometry and material
    const torusMaterial = new THREE.MeshPhongMaterial({ color: 0x0000ff });
    const torus = new THREE.Mesh(torusGeometry, torusMaterial);
    torus.position.set(21.5, 0.8, -23); // Position of the torus on the board (x, y, z)
    torusRef.current = torus;
    torus.userData.stepCounter = 0; // stepCounter for the specific player
    torus.userData.caseNumber = 1; // caseNumber for the specific player
    torus.userData.money = 1500; // money for the specific player
    scene.add(torus);

    // Create a cone geometry and material
    const coneGeometry = new THREE.ConeGeometry(0.5, 1, 32);
    const coneMaterial = new THREE.MeshPhongMaterial({ color: 0xf2ff00 });
    const cone = new THREE.Mesh(coneGeometry, coneMaterial);
    cone.position.set(23.5, 0.5, -22); // Position of the cone on the board (x, y, z)
    coneRef.current = cone;
    cone.userData.stepCounter = 0; // stepCounter for the specific player
    cone.userData.caseNumber = 1; // caseNumber for the specific player
    cone.userData.money = 1500; // money for the specific player
    scene.add(cone);

    // Camera Adjustment -----------------------------------------------------------------------------------------------------
    camera.position.set(40, 25, 0); // Adjust the camera's height      ready-to-play: 40-60 15-25 0    to-see-floor-interactions:50 5 0
    camera.lookAt(0, 0, 0); // Make the camera look at the center of the scene (0, 0, 0)

    let isDragging = false;
    let previousMouseX = 0;
    const target = new THREE.Vector3(0, 0, 0); // Set a target point for the camera to orbit around

    const onMouseDown = (event) => {
      isDragging = true;
      previousMouseX = event.clientX;
    };

    const onMouseMove = (event) => {
      if (isDragging) {
        const deltaMoveX = event.clientX - previousMouseX;
        const sensitivity = 0.003; // Adjust the sensitivity for circular movement

        // Calculate the new position of the camera in a circular motion around the target point
        const angle = deltaMoveX * sensitivity;
        const newX =
          target.x +
          Math.cos(angle) * (camera.position.x - target.x) -
          Math.sin(angle) * (camera.position.z - target.z);
        const newZ =
          target.z +
          Math.sin(angle) * (camera.position.x - target.x) +
          Math.cos(angle) * (camera.position.z - target.z);

        camera.position.set(newX, camera.position.y, newZ); // Update the camera's position
        camera.lookAt(0, 0, 0); // Make the camera look at the center of the scene (0, 0, 0)

        previousMouseX = event.clientX;
      }
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    window.addEventListener("mousedown", onMouseDown, false);
    window.addEventListener("mousemove", onMouseMove, false);
    window.addEventListener("mouseup", onMouseUp, false);

    // Load Dice ---------------------------------------------------------------------------------------------
    const loader2 = new GLTFLoader();

    // Load the dice model
    loader2.load("src/assets/models/Dice.glb", (gltf) => {
      dice1 = gltf.scene.clone(); // Create a copy of the dice model
      dice2 = gltf.scene.clone(); // Create another copy for the second dice

      // Set individual positions for each dice
      dice1.scale.set(10, 10, 10);
      dice1.position.set(10, 20, -20);
      scene.add(dice1); // Add the first dice to the scene

      dice2.scale.set(10, 10, 10);
      dice2.position.set(0, 25, -20);
      scene.add(dice2); // Add the second dice to the scene

      // Hide dice1
      dice1.visible = false;

      // Hide dice2
      dice2.visible = false;
    });

    const animate = () => {
      // Function for animation rendering
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };

    animate(); // Start animation

    const HideUnnecessaryPlayers = (playersAmount) => {
        if(playersAmount == 2)
        {
          torusRef.current.visible = false;
          coneRef.current.visible = false;
          disableMoney('money3');
          disableMoney('money4');
        }
        else if(playersAmount == 3)
        {
          coneRef.current.visible = false;
          disableMoney('money4');
        }    
    }

    const updateProperties = (board__) => {
      var copyGamepositions = [];
      board__.forEach((item) => {
        let currentProperties = item["properties"];
        if(currentProperties)
        {
          copyGamepositions = [...gamePositions];
          currentProperties = currentProperties.split(",").map(function(item) {return parseInt(item, 10);});
          for (let index = 0; index < copyGamepositions.length; index++) {
            const element = copyGamepositions[index];
            if(currentProperties.includes(element["position"]))
            {
              copyGamepositions[index]["player"] = item["name"];
            }
          }
        }
      });
      setGamePositions(copyGamepositions);
    };


    const fetchBoard = async () => {
    /* a) who’s in the game & whose turn is it? */
    const [pRes, gRes] = await Promise.all([
      fetch(`${API_BASE_URL}/api/game-state/players-detailed/${gameId}`),
      fetch(`${API_BASE_URL}/api/game-state/${gameId}`)
    ]);
    if (!pRes.ok || !gRes.ok) return;

    const roster = await pRes.json();   // [{id,nickname}, … ]
    const game   = await gRes.json();   // {status, playerTurn, winner …}

    /* b) each player’s state (position / money) */
    const enriched = await Promise.all(
      roster.map(async p => {
        const sRes = await fetch(`${API_BASE_URL}/api/player-state/${p.id}`);
        const s    = sRes.ok ? await sRes.json() : {};
        return {
          player_id : p.id,
          name      : p.nickname,
          position  : s.position ?? 0,
          money     : s.money    ?? 0
        };
      })
    );

    return { board: enriched, game };
  };

  const interval = setInterval(async () => {
    const data = await fetchBoard();
    if (!data) return;

    const { board, game } = data;

    /* --- UI wiring kept from your old code --- */
    setPlayersAmount(board.length);
    updateProperties(board);
    setIsMyTurn(String(game.playerTurn) === String(playerId));
    (game.playerTurn === playerId ? enableDice() : disableDice());

    /* winner / completed check */
    if (game.status === "completed") {
      const winnerObj = board.find(b => b.player_id == game.winner);
      navigate(`/endgame?winner=${winnerObj?.name ?? "Unknown"}`);
    }

    /* money & pawn positions -------------- */
    board.forEach((p,i) => {
      if      (i===0){ findSteps(cubeRef.current  , p.position); setPlayer1Info({money:p.money}); }
      else if (i===1){ findSteps(sphereRef.current, p.position); setPlayer2Info({money:p.money}); }
      else if (i===2){ findSteps(torusRef.current , p.position); setPlayer3Info({money:p.money}); }
      else if (i===3){ findSteps(coneRef.current  , p.position); setPlayer4Info({money:p.money}); }
      if (p.player_id == playerId) setSira(i);
    });
  }, 1000);

  return () => clearInterval(interval);


    return () => {
      // Clean up or dispose Three.js elements (if needed)
    };
  }, [isMyTurn]);

  // Add Responsiveness ------------------------------------------------------------------------------------------------
  window.addEventListener("resize", () => {
    console.log("Window resized");

    // update display width and height
    let width = window.innerWidth;
    let height = window.innerHeight * 0.92;

    // Ensure canvasRef is defined and holds a reference to the canvas DOM element
    if (canvasRef.current) {
      // Update canvas width and height
      canvasRef.current.width = width;
      canvasRef.current.height = height;

      // Update camera aspect ratio
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();

      // Update renderer size and pixel ratio
      rendererRef.current.setSize(width, height);
      rendererRef.current.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      // Render the scene with updated dimensions
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
  });

  const throwDiceAction = async () => {
    if (!isMyTurn) return;
    try {
      const turn = await GamePlayAPI.playTurn(gameId, playerId);
      /** turn = {
       *    dice1, dice2,
       *    mandatory: [ {actionName,…}, … ],
       *    optional : [ {actionName, price, propertyId}, … ]
       * }  ⬅ adjust if your TurnResponse differs */
      setDice(turn.dice);                       // numeric counter
      randomDiceThrow(dice1, turn.dice);   

      /* ─ mandatory actions (rent / jail / card) */
      const m = turn.mandatory?.[0];
      if (m) {
        if (m.actionName === "drawCard") updateCard(m.title, m.description, null, null);
        if (m.actionName === "rent")     updateCard("Rent",`Pay ${m.amount}`,null,null);
        if (m.actionName === "jail")     updateCard("Go to jail","Police troubles",null,null);
      }

      /* ─ optional buy */
      if (turn.optionalAction?.type === "buyOffer") {
        updateCard(
          "Buy property",
          `Do you want to buy this property for ${o.price}?`,
          { text:"Buy", function: async () => {
              await GamePlayAPI.buyProperty(gameId, playerId, squareId);
              closeCard(); updateCard("Purchased!","",null,null);
          }},
          null
        );
      }
    } catch {
      console.error("Failed turn");
    }
  };


  // UI Elements ----------------------------------------------------------------------------------------------------
  return (
    <div className="relative h-screen w-screen">
      <canvas ref={canvasRef} />

      <div className="first-nav">
        <span className={`px-5  ${my_sira == 0 ? "animated-box" : ""}`} id="money1">
          <img src="src/assets/images/monopoly_money.png" alt="Player 1's money" />
          <p>{player1Info["money"]}</p>
        </span>
        <span className={`px-5  ${my_sira == 1 ? "animated-box" : ""}`} id="money2">
          <img src="src/assets/images/monopoly_money.png" alt="Player 2's money" />
          <p>{player2Info["money"]}</p>
        </span>
        <span className={`px-5 ${(playersAmount < 3) ? 'hidden' : ''} ${my_sira == 2 ? "animated-box" : ""}`} id="money3">
          <img src="src/assets/images/monopoly_money.png" alt="Player 3's money" />
          <p>{player3Info["money"]}</p>
        </span>
        <span className={`px-5 ${(playersAmount < 4) ? 'hidden' : ''} ${my_sira == 3 ? "animated-box" : ""}`} id="money4">
          <img src="src/assets/images/monopoly_money.png" alt="Player 4's money" />
          <p>{player4Info["money"]}</p>
        </span>
      </div>

      
      
      <div className="sec-nav">
      <button className="property-btn volume" onClick={toggleIcons}>
        <FontAwesomeIcon icon={faVolumeHigh} className={isVolumeVisible ? 'hidden' : ''}/>
        <FontAwesomeIcon icon={faVolumeXmark} className={isVolumeVisible ? '' : 'hidden'}/>
        <audio src="src/assets/audio/massobeats-honey_jam.mp3" />
      </button>

        <button
          className="property-btn"
          onClick={() => {
            filterAndDisplayNames();
          }}
        >
          <FontAwesomeIcon icon={faHouseUser} id="property" />
        </button>
        <button
          disabled={!isMyTurn}
          className={`property-btn ${!isMyTurn ? "hidden" : ""}`}
          onClick={throwDiceAction}
          
        >
          <FontAwesomeIcon icon={faDice}  id="dice" />
        </button>
      </div>

      <div className="third-nav max-w-[100px]">
        <span><p>{diceTotal}</p></span>
      </div>

      <div
        className="absolute w-full h-full bg-transparent left-0 top-0 z-2 hidden"
        id="overlay"
      ></div>

      <div
        className="absolute -translate-x-2/4 -translate-y-2/4 left-2/4 top-2/4 z-3 hidden"
        id="card"
      >
        <div
          className="relative shadow flex flex-col justify-around items-stretch min-h-[150px] min-w-[300px]
        bg-[rgba(255,236,195,0.8)] pt-[20px] pb-[20px] px-5 backdrop-blur-sm border-solid border-[rgba(255,255,255,0.6)] rounded-md"
        >
          <span
            className="text-yellow-700 font-semibold text-xl hidden"
            id="title"
          >
            Title
          </span>
          <p className="text-base text-gray-600 hidden" id="desc">
            Description{" "}
          </p>
          <div className="flex flex-col gap-2">
            <button
              className="border-2 border-yellow-600 bg-yellow-600 py-1 rounded text-gray-50 hover:bg-[rgba(240,169,16,0.95)] hover:cursor-pointer hidden"
              id="act1"
            >
              Action 1
            </button>
            <button
              className="border-2 border-yellow-600 py-1 rounded hover:bg-gray-100 hover:cursor-pointer hidden"
              id="act2"
            >
              Action 2
            </button>
          </div>
          <div
            className="absolute top-3 right-2  text-red-300 hover:text-red-500 hover:cursor-pointer"
            id="close"
          >
            <svg
              y="0"
              xmlns="http://www.w3.org/2000/svg"
              x="0"
              width="100"
              viewBox="0 0 100 100"
              preserveAspectRatio="xMidYMid meet"
              height="100"
              className="w-12 h-12 fill-current"
              onClick={() => {
                closeCard();
              }}
            >
              <path
                fillRule="evenodd"
                d="M50,87.4A37.4,37.4,0,1,0,12.6,50,37.3,37.3,0,0,0,50,87.4ZM44,37.3A4.7,4.7,0,0,0,37.3,44l6.1,6-6.1,6A4.7,4.7,0,0,0,44,62.7l6-6.1,6,6.1A4.7,4.7,0,0,0,62.7,56l-6.1-6,6.1-6A4.7,4.7,0,0,0,56,37.3l-6,6.1Z"
              ></path>
            </svg>
          </div>
        </div>
      </div>
    </div>
  ); // Return canvas element for rendering
};

export default Board;
