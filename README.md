# 🎓 Sindopoly – A Monopoly-inspired University-themed Online Game

## Overview  
**Sindopoly** is a digital board game inspired by **Monopoly**, themed around the **International Hellenic University (IHU)**. The game is built as a full-stack web application and combines classic Monopoly mechanics with a campus-like social environment.

---

## 🧠 Objective  
The goal is to simulate the Monopoly experience in a university setting while introducing multiplayer gameplay through modern web technologies. Players compete to accumulate money, acquire properties (university-themed), and strategically bankrupt opponents — all in real time.

* instantaneous state updates (WebSocket + Redis)  
* strict adherence to core Monopoly mechanics (rent tiers, colour sets, utilities, trains, jail, cards)  
* persistent player statistics in MariaDB  
* clean, modular Spring-Boot backend for easy feature growth

---

## ⚙️ Technology Stack

| Layer        | Technologies                                      |
|--------------|---------------------------------------------------|
| Frontend     | React, Three.js, STOMP (WebSocket)                |
| Backend      | Spring Boot 3, Spring Messaging (STOMP)           |
| Realtime DB  | Redis (game + player state)                       |
| SQL DB       | MariaDB 11 (players, squares, cards, stats)       |

---

## 💡 How the Game Works ( CURRENT )

### ✅ Game Lifecycle
1. **Create** – owner (must exist in MariaDB & not be in another game) opens a public/private lobby (max 4 players).  
2. **Join / Leave** –  
   * public → open join while `status = lobby`  
   * private → join with invite code  
   * if owner leaves while in lobby → whole game auto-deletes  
3. **Start** – owner begins; `status → inProgress`, timer & turn order start.  
4. **Play** – each turn runs through the **player-move flow** (dice → move → square action → rent / card / tax → bankruptcy check → rotate turn).  
5. **AFK Skip** – scheduler skips a player who is idle > 60 s (`afk=true`) and rotates the turn.  
6. **End** – automatic when **(a)** timer ≥ 1200 s, **(b)** only one active player, or **(c)** a player reaches 5000 € cash.  
7. **Winner** – total wealth = cash + property values; top wealth is stored as `winner`.  
8. **Stats Persist** – for every player: wins / losses / money / time saved into MariaDB `Stats`.

### 🏠 Rent & Property Logic
| Square type         | Rent rule                                                                       |
|---------------------|---------------------------------------------------------------------------------|
| **Colour property** | Base rent, **×2** if owner holds full colour set                                |
| **Train**           | 25 / 50 / 100 / 200 € depending on 1-4 trains owned                             |
| **Utility**         | 4× last dice roll, or **10×** if owner holds both utilities                     |

### 🎴 Card Deck
* Stored in MariaDB (`Card` table) – two kinds: `money` (± €) & `transport` (teleport to square **n**).  
* Each game gets a **shuffled deck** (`game:{id}:deck`) on first draw.  
* Transport cards trigger an immediate follow-up square action.

### 🔄 Turn Timer Safety  
* Redis fields `turnAge` & `turnTimeout`; scheduler adds +10 s each tick.  
* If `turnAge ≥ 60` → player marked `afk=true`, skipped, next player starts with `turnAge=0`.

### 📡 Real-Time Push  
* Spring WebSocket endpoint **`/ws`** (SockJS fallback).  
* Server broadcasts every `TurnResponse` to **`/topic/game/{gameId}`**; the React client updates instantly.

---

## 📦 Redis Schema

| Key                               | Type | Notes                                                   |
|-----------------------------------|------|---------------------------------------------------------|
| `game:{id}`                       | Hash | status, visibility, timer, playerTurn, winner, turnAge… |
| `game:{id}:players`               | Set  | IDs of active players                                   |
| `player:{id}`                     | Hash | money, position, properties[], jail flags, bankrupt…    |
| `square:{id}`                     | Hash | transient owner field                                   |
| `game:{id}:deck`                  | List | shuffled card IDs                                       |

---

## 🧪 API Preview (Current)

| Method | Endpoint                                         | Purpose                                            |
|--------|--------------------------------------------------|----------------------------------------------------|
| POST   | `/api/game-state/create`                         | Create lobby                                       |
| POST   | `/api/game-state/{gameId}/start`                 | Start game                                         |
| POST   | `/api/game-state/{gameId}/add-player`            | Join public lobby                                  |
| POST   | `/api/game-state/join-with-invite`               | Join private lobby                                 |
| POST   | `/api/game-state/{gameId}/remove-player`         | Leave game / kick player                           |
| GET    | `/api/game-state/{gameId}`                       | Full game hash                                     |
| GET    | `/api/game-state/{gameId}/players`               | Player IDs set                                     |
| POST   | `/api/turn/{gameId}/{playerId}`                  | **Play a turn** (roll, move, actions)              |
| DELETE | `/api/game-state/{gameId}`                       | Delete game (owner only)                           |
| WS     | `/topic/game/{gameId}`                           | Real-time `TurnResponse` events (STOMP subscribe)  |

---

## 🛢️ MariaDB Entities

* **Player** – fixed roster (name, created_at)  
* **Square** – board definition (type, price, rent)  
* **Card** – event cards (title, description, type, amount)  
* **Stats** – aggregated per-player stats (wins, losses, money, play time)

---

## 🔐 Validation & Error Handling (Highlights)

* Cannot create / join if player already in another game.  
* Join only when `status=lobby` and game not full (4).  
* Turn endpoint denied unless it’s **exactly** that player’s turn.  
* `writeMoney` guard: money can’t go negative except inside bankruptcy flow.  
* All rule violations throw `IllegalStateException` → `HTTP 400` with JSON `{"error": "..."}` via global `@ControllerAdvice`.

---

## 🚧 Work in Progress

- 🖥️ Front-end WebSocket integration & board rendering  
- 💬 In-game chat (share `/topic/game/{id}/chat`)  
- 🪙 Mortgage / property sell before bankruptcy  
- 🛑 Full dice-double rules & three-doubles-to-jail  
- 🧪 Unit + Testcontainers integration-tests suite  
- 📈 Admin dashboard for live games / stats  

---
