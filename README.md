# 🎓 Sindopoly – A Monopoly-inspired University-themed Online Game

## Overview

**Sindopoly** is a full-stack web re-imagining of **Monopoly** set on the
campus of the *International Hellenic University (IHU)*.
Play in real time with friends, trade university buildings, pay rent at the
library kiosk, or end up in the administration building-jail.

---

## 🧠 Objective

Simulate the classic board-game while adding:

* 🔴 **Real-time state** (Redis + WebSocket/STOMP)
* 🟠 Strict Monopoly rules (colour sets, utilities/train scaling, jail, cards)
* 🟢 Persistent player & leaderboard stats in MariaDB
* 🔵 A modular Spring-Boot 3 backend that is easy to extend

---

## ⚙️ Technology Stack

| Layer         | Technologies                                                              |
| ------------- | ------------------------------------------------------------------------- |
| Front-end     | React + Vite, Three.js (3-D board), TailwindCSS, Ant Design, SockJS/STOMP |
| Back-end      | Spring Boot 3.2, Spring Web & Messaging, Lombok, MapStruct                |
| Real-time DB  | Redis 7 (game state, timers, card decks, dice entropy)                    |
| SQL DB        | MariaDB 11 (players, squares, cards, aggregated statistics)               |
| Build / Other | Maven, Docker + docker-compose, OpenAPI-generated Postman collection      |

---

## 💡 Game Lifecycle (Current Implementation)

| Phase          | Details                                                                                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Create**     | `POST /api/game-state/create` – owner ID + visibility → lobby *(auto-creates Redis keys & invite code if **private**).*                                                                          |
| **Join/Leave** | *Public:* `POST /api/game-state/add/{gameId}/{playerId}`   •   *Private:* `POST /api/game-state/join-with-invite?inviteCode=…&playerId=…`  <br> Owner leaving during **lobby** deletes the game. |
| **Start**      | Only owner: `POST /api/game-state/{gameId}/start?playerId={ownerId}` → `status=inProgress`, turn = owner, timers zeroed.                                                                         |
| **Play**       | React calls `POST /api/turn/{gameId}/{playerId}`  ➜ backend rolls dice, resolves square, returns **TurnResponse** *(dice, mandatory, optional)*.                                                 |
| **AFK Skip**   | `GameLoopScheduler` increments `turnAge` every 2 s; at ≥ 60 s marks player `afk=true` and rotates turn.                                                                                          |
| **End**        | Game ends automatically when <br>① 1200 s total <br>② only 1 active player <br>③ a player reaches €5 000.                                                                                        |
| **Scoring**    | Winner = highest **cash + property value**; stats row in MariaDB is updated (`wins / losses / money / time`).                                                                                    |

---

### 🏠 Rent & Property Rules

| Square type     | Rent computation                                       |
| --------------- | ------------------------------------------------------ |
| Colour property | base × 2 if owner controls the full colour set         |
| Train           | 25 / 50 / 100 / 200 € depending on 1-4 trains owned    |
| Utility         | 4 × latest dice roll – or 10 × if both utilities owned |

### 🎴 Card Deck

* Two kinds: **money** (± €) & **transport** (teleport) – rows in `card` table.
* Each game receives a *shuffled* deck in `game:{id}:deck` on first draw.

---

## 📦 Redis Key-Schema (runtime)

| Key                 | Type  | Description                                            |
| ------------------- | ----- | ------------------------------------------------------ |
| `game:{id}`         | Hash  | status, visibility, playerTurn, winner, timers, etc.   |
| `game:{id}:players` | Set   | active player IDs                                      |
| `player:{id}`       | Hash  | money, position, jail flags, bankrupt, properties list |
| `game:{id}:deck`    | List  | shuffled card IDs                                      |
| `dice:entropy`      | List  | pre-fetched random.org dice values (refilled 30 s job) |
| `stats:leaderboard` | Z-SET | *(materialised leaderboard – recreated if missing)*    |

---

## 🧪 REST & WS API Snapshot

| Method            | Endpoint & Query                                             | Purpose / Notes                                 |
| ----------------- | ------------------------------------------------------------ | ----------------------------------------------- |
| **Players**       |                                                              |                                                 |
| `POST`            | `/api/player-state/create` *(body:{nickname})*               | Create player → returns ID                      |
| `GET`             | `/api/player-state/{playerId}`                               | Current money/position/properties               |
| **Games / Lobby** |                                                              |                                                 |
| `POST`            | `/api/game-state/create`                                     | New lobby (body: `{ownerId, visibility}`)       |
| `GET`             | `/api/game-state/public-lobby`                               | List open public lobbies                        |
| `POST`            | `/api/game-state/add/{gameId}/{playerId}`                    | Join public                                     |
| `POST`            | `/api/game-state/join-with-invite?inviteCode=ABC&playerId=7` | Join private                                    |
| `GET`             | `/api/game-state/players-detailed/{gameId}`                  | IDs + nicknames                                 |
| `POST`            | `/api/game-state/{gameId}/start?playerId=OWNER`              | Owner starts game                               |
| `POST`            | `/api/game-state/{gameId}/remove-player?playerId=X`          | Leave / kick                                    |
| **Turn / Play**   |                                                              |                                                 |
| `POST`            | `/api/turn/{gameId}/{playerId}`                              | Roll dice, move, returns **TurnResponse** JSON  |
| `POST`            | `/api/player-state/{gameId}/{playerId}/buy?propertyId=N`     | Forced buy (optional turn action)               |
| **Statistics**    |                                                              |                                                 |
| `GET`             | `/api/statistics/leaderboard`                                | Top players (wins & win-rate)                   |
| `GET`             | `/api/statistics/user/{playerId}`                            | Personal aggregated stats                       |
| **WebSocket**     |                                                              |                                                 |
| `STOMP SUB`       | `/topic/game/{gameId}`                                       | Broadcast of every TurnResponse (instant board) |

---

## 🛢️ MariaDB Schema Highlights

```text
player(id, name, created_at)
square(id, type, colour, price, rent_base, rent_set, rent_train_index, ...)
card(id, title, description, card_type, amount, target_square)
stats(id, player (FK->player.id), total_wins, total_losses, total_games,
      total_money, total_time_played)
```

A trigger ensures a zero-filled **stats** row is created whenever a new player
row is inserted.

---

## 🔐 Validation & Error Handling

* **One-game-at-a-time** check before join/create.
* **Owner-only** guards (`start`, `kick`, `delete`) – 403 on violation.
* Turn endpoint validates *it is exactly the caller’s turn*.
* All rule breaches throw `IllegalStateException` → JSON
  `{ "error": "reason" }` with correct HTTP status by `@ControllerAdvice`.

---

## 🚧 Planned / Work-In-Progress

* 🎲 Dice-double logic & three-doubles-to-jail
* 🖼️ WebSocket-powered 3-D board updates (eliminate poll)
* 💬 In-game chat on `/topic/game/{id}/chat`
* 🪙 Mortgage & auction flow
* 🧪 Testcontainers integration-tests

