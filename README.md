# 🎓 Sindopoly – A Monopoly-inspired University-themed Online Game

## Overview  
**Sindopoly** is a digital board game inspired by **Monopoly**, themed around the **International Hellenic University (IHU)**. The game is built as a full-stack web application and combines classic Monopoly mechanics with a campus-like social environment.

---

## 🧠 Objective  
The goal is to simulate the Monopoly experience in a university setting while introducing multiplayer gameplay through modern web technologies. Players compete to accumulate money, acquire properties (university-themed), and strategically bankrupt opponents — all in real time.

---

## ⚙️ Technology Stack

| Layer        | Technologies                      |
|--------------|-----------------------------------|
| Frontend     | React, Three.js                   |
| Backend      | Spring Boot, Redis                |
| Database     | MariaDB                           |

---

## 💡 How the Game Works (Current Progress)

### ✅ Game Lifecycle (Back-End Logic)
- A game is **created** by a player (owner), who automatically joins it.
- Each game has:
  - A unique `gameId` (currently set to the owner's ID for lookup simplicity)
  - A `visibility` setting (public/private)
  - A randomly generated **invite code** if it’s private
  - A list of players (max 4)
- Players can **join/leave** lobbies.
- If the **owner leaves**, the game is automatically **deleted**.
- When the **owner starts** the game:
  - The timer starts
  - Initial turn is set
  - Win/loss conditions are monitored:
    - Max time: 20 minutes (1200 seconds)
    - Max money: 5000
- A game ends if:
  - Timer runs out
  - A player reaches the money cap
  - All other players go bankrupt

---

## 📦 Redis Schema (Current State Storage)

| Key Format                    | Type   | Description                          |
|------------------------------|--------|--------------------------------------|
| `game:{gameId}`              | Hash   | Game metadata + live game state      |
| `game:{gameId}:players`      | Set    | List of player IDs in the game       |
| `player:{playerId}`          | Hash   | Individual player state              |

### Example game data
```json
{
  "status": "inProgress",
  "visibility": "private",
  "inviteCode": "AB12C",
  "creationTime": "2025-01-05T10:00:00Z",
  "startTime": "2025-01-05T10:01:00Z",
  "playerTurn": 1,
  "timer": 0,
  "maxTime": 1200,
  "maxMoney": 5000,
  "winner": null
}
```

### Example player data
```json
{
  "position": 5,
  "money": 1500,
  "properties": [3, 7],
  "jail": false,
  "jailTime": 0,
  "bankrupt": false
}
```

## 🧪 API Preview (WIP)

| Method | Endpoint                                  | Description                        |
|--------|-------------------------------------------|------------------------------------|
| POST   | `/api/game-state/create`                  | Create a new game                  |
| POST   | `/api/game-state/{gameId}/start`          | Start the game                     |
| POST   | `/api/game-state/{gameId}/add-player`     | Add a player to the game lobby     |
| POST   | `/api/game-state/{gameId}/remove-player`  | Remove a player from the lobby     |
| GET    | `/api/game-state/{gameId}`                | Retrieve the current game state    |
| GET    | `/api/game-state/{gameId}/players`        | Get all players in a specific game |
| DELETE | `/api/game-state/{gameId}`                | Delete a game (only by owner)      |


## 🚧 Work in Progress

- 🎲 Implementing full turn mechanics and dice roll system  
- 🗺️ Custom IHU-themed property and board layout  
- 🕹️ Interactive frontend in React + Three.js  
- 👥 Support for multiplayer real-time interaction via Redis  
- 🧠 Game end logic (max time, money cap, bankruptcy)  
- 📊 Live player dashboards and score tracking  
- 🔐 Invite-based private games with secure code system

