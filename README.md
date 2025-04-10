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
- A game is **created** by a player (owner), who must exist in MariaDB.
  - Each player can **only be in one game at a time**.
- A game includes:
  - A unique `gameId` (same as `ownerId` for lookup)
  - A `visibility` flag (`public` or `private`)
  - A unique **invite code** if the game is private
  - A Redis player set, with a **maximum of 4 players**
- Players can **join or leave** games:
  - Private games require an invite code
  - Only public, "lobby" state games are joinable
- If the **owner leaves during the lobby**, the game is **deleted** from Redis
- If a player leaves **during an active game**, their **stats are finalized and saved to MariaDB**
- When the **game starts**, it transitions to `"inProgress"` and:
  - A timer begins (0 → 1200 seconds)
  - Turn order is initiated
- The game ends automatically when:
  - The timer hits 1200 seconds
  - A player reaches 5000 in-game money
  - Or all other players go bankrupt

### 🧠 Winner Determination Logic
- Each player's **total wealth** is calculated:
  - `money` from Redis
  - `property values` fetched from MariaDB (`Square.price`)
- The player with the **highest combined total** is set as the winner

---

## 📦 Redis Schema (Current State Storage)

| Key Format                    | Type   | Description                          |
|------------------------------|--------|--------------------------------------|
| `game:{gameId}`              | Hash   | Game metadata + live game state      |
| `game:{gameId}:players`      | Set    | List of player IDs in the game       |
| `player:{playerId}`          | Hash   | Individual player state (temporary)  |

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

---

## 🧪 API Preview (Current)

| Method | Endpoint                                  | Description                        |
|--------|-------------------------------------------|------------------------------------|
| POST   | `/api/game-state/create`                  | Create a new game                  |
| POST   | `/api/game-state/{gameId}/start`          | Start the game                     |
| POST   | `/api/game-state/{gameId}/add-player`     | Add a player to a public lobby     |
| POST   | `/api/game-state/join-with-invite`        | Join a private game via invite     |
| POST   | `/api/game-state/{gameId}/remove-player`  | Remove a player from the game      |
| GET    | `/api/game-state/{gameId}`                | Get current game state             |
| GET    | `/api/game-state/{gameId}/players`        | Get all players in a game          |
| DELETE | `/api/game-state/{gameId}`                | Delete a game                      |

---

## 🛢️ MariaDB Integration

- **Player**, **Card**, **Square**, and **Stats** tables are modeled as JPA entities
- Each player's game participation is recorded in Redis and mapped to persistent `Player` and `Stats` rows
- When a game ends (or a player disconnects), stats are saved to MariaDB:
  - `total_games`, `total_wins`, `total_losses`, `total_money`, and `total_time_played`
- Players must **exist in MariaDB** before being allowed to join or create games

---

## 🔐 Validation + Error Handling

- Game creation fails if:
  - Player already in another game
  - Player does not exist in MariaDB
- Redis updates are only allowed if player is valid
- All such errors return `HTTP 400` via global exception handler using `@ControllerAdvice`

---

## 🚧 Work in Progress

- 🎲 Implementing full turn mechanics and dice roll system  
- 🗺️ Custom IHU-themed property and board layout  
- 🕹️ Interactive frontend in React + Three.js  
- 👥 Reconnection/resilience logic for disconnected players  
- 🎯 In-game action logic (cards, tax, rent, etc.)  
- 🧠 Bankruptcy handling + next-player turn system  
- 📊 Real-time dashboards for score and session tracking  
