package com.example.Sindopoly_Java.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.SetOperations;
import org.springframework.stereotype.Service;

import com.example.Sindopoly_Java.model.Square;
import com.example.Sindopoly_Java.model.Stats;
import com.example.Sindopoly_Java.exception.GameStateConflictException;
import com.example.Sindopoly_Java.repository.SquareRepository;
import com.example.Sindopoly_Java.repository.StatsRepository;
import com.example.Sindopoly_Java.utils.ValidationUtils;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;

import com.example.Sindopoly_Java.model.Player;
import com.example.Sindopoly_Java.repository.PlayerRepository;

import java.time.Instant;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.TimeUnit;

@Service
public class GameStateService {
    private static final String GAME_PREFIX = "game:";
    private static final String PLAYERS_KEY_SUFFIX = ":players";
    private static final String INVITE_PREFIX = "invite:";
    private static final int MAX_PLAYERS = 4;
    private static final int MAX_TIME = 1200;
    private static final int MAX_MONEY = 5000;
    private static final String CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    private static final int CODE_LENGTH = 5;

    private final RedisTemplate<String, String> redisTemplate;
    private final HashOperations<String, String, String> hashOps;
    private final SetOperations<String, String> setOps;
    private final Random random = new Random();

    @Autowired
    private final StatsRepository statsRepo;
    @Autowired
    private SquareRepository squareRepo;
    @Autowired
    private ValidationUtils validationUtils;
    @Autowired
    private final PlayerRepository playerRepo;
    
    private final PlayerStateService playerStateService;

    


    @Autowired
    public GameStateService(RedisTemplate<String, String> redisTemplate,
                            StatsRepository statsRepo,
                            PlayerRepository playerRepo,
                            PlayerStateService playerStateService) {
        this.redisTemplate = redisTemplate;
        this.hashOps = redisTemplate.opsForHash();
        this.setOps = redisTemplate.opsForSet();
        this.statsRepo = statsRepo;
        this.playerRepo = playerRepo;
        this.playerStateService = playerStateService;
    }

    /* =============================================================== */
    /* DTO kept in Redis as JSON – used by SquareActionService,        */
    /* TurnService and the controllers to verify/complete decisions.   */
    /* =============================================================== */
    public static record OptionalAction(
            String  type,        // "buyOffer", "payJail", … (add more later)
            int     playerId,    // who must answer
            Integer squareId,    // property offered (nullable)
            Integer price,       // price of property (nullable)
            Integer fee          // jail fee etc.        (nullable)
    ) {}



    /** Create Game */
    // This method creates a new game in Redis
    // It takes the owner ID and visibility as parameters
    // It checks if the owner exists in the database
    // It checks if the owner is already in another game
    // It generates a unique game key and players key
    // It sets the game status to "lobby" and the creation time
    // It sets the visibility and invite code if the game is private
    // It adds the owner to the players set
    // It sets the expiration time for the game and players keys
    // It returns the game data as a map
    // The game data includes the status, creation time, visibility, and invite code
    // The game key is in the format "game:{ownerId}"
    public Map<String, String> createGame(int ownerId, String visibility) {
        
        validationUtils.validatePlayerExists(ownerId);

        // Check if this player is already in any game
        Set<String> keys = redisTemplate.keys("game:*:players");
        if (keys != null) {
            for (String key : keys) {
                Boolean isMember = setOps.isMember(key, String.valueOf(ownerId));
                if (Boolean.TRUE.equals(isMember)) {
                    throw new IllegalStateException("Player is already in another game.");
                }
            }
        }

        
        String gameKey = GAME_PREFIX + ownerId;
        String playersKey = gameKey + ":players";
    
        Map<String, String> gameData = new HashMap<>();
        gameData.put("status", "lobby");
        gameData.put("creationTime", Instant.now().toString());
        gameData.put("visibility", visibility);
    
        if ("private".equalsIgnoreCase(visibility)) {
            String inviteCode = generateInviteCode();
            gameData.put("inviteCode", inviteCode);
        }
    
        hashOps.putAll(gameKey, gameData);
        setOps.add(playersKey, String.valueOf(ownerId));
        redisTemplate.expire(gameKey, 24, TimeUnit.HOURS);
        redisTemplate.expire(playersKey, 24, TimeUnit.HOURS);
    
        return gameData;
    }
    
    /** Check if Player is in any Game */
    public boolean isPlayerInAnyGame(int playerId) {
        Set<String> keys = redisTemplate.keys("game:*:players");
        if (keys.isEmpty()) return false;

        for (String key : keys) {
            Boolean isMember = setOps.isMember(key, String.valueOf(playerId));
            if (Boolean.TRUE.equals(isMember)) return true;
        }
        return false;
    }



    /**
     * Owner kicks off the game:
     *  - set status, turn, timers, etc.
     *  - initialize each player’s Redis state hash
     */
    public void startGame(int gameId, int actorId) {
        System.out.printf(">>> startGame called: gameId=%d, actorId=%d%n", gameId, actorId);
        // only the owner may start
        if (gameId != actorId) {
            throw new IllegalStateException("Only the owner can start the game.");
        }

        String gameKey = GAME_PREFIX + gameId;
        if (!redisTemplate.hasKey(gameKey)) {
            throw new IllegalStateException("Game not found");
        }

        // 1) mark inProgress and seed game‐level fields
        hashOps.put(gameKey, "status",     "inProgress");
        hashOps.put(gameKey, "playerTurn", String.valueOf(actorId));
        hashOps.put(gameKey, "timer",      "0");
        hashOps.put(gameKey, "startTime",  Instant.now().toString());
        hashOps.put(gameKey, "maxTime",    String.valueOf(MAX_TIME));
        hashOps.put(gameKey, "maxMoney",   String.valueOf(MAX_MONEY));
        hashOps.put(gameKey, "winner",     "null");

        // 2) fetch the set of players in this game
        @SuppressWarnings("unchecked")
        Set<String> playerIds = redisTemplate
            .opsForSet()
            .members(GAME_PREFIX + gameId + ":players");

        // 3) initialize each player's state hash
        for (String pidStr : playerIds) {
            int pid = Integer.parseInt(pidStr);
            playerStateService.initializePlayer(pid);
        }

        // (Optional) Set TTL on the game hash as well
        // redisTemplate.expire(gameKey, Duration.ofHours(2));
    }


    /** Get Game */
    public Map<String, String> getGame(int gameId) {
        String gameKey = GAME_PREFIX + gameId;
        return hashOps.entries(gameKey);
    }

    /** Delete Game */
    public void deleteGame(int gameId) {
        String gameKey = GAME_PREFIX + gameId;
        redisTemplate.delete(gameKey);
        redisTemplate.delete(gameKey + PLAYERS_KEY_SUFFIX);
    }

    /** Get All Public Lobby Games */
    public List<Map<String, String>> getAllPublicLobbyGames() {
        Set<String> keys = redisTemplate.keys("game:*");
        if (keys.isEmpty()) return List.of();

        List<Map<String, String>> publicLobbyGames = new ArrayList<>();

        for (String key : keys) {
            try {
                /* keep "game:4", skip "game:4:players" */
                if (key.endsWith(":players")) continue;

                String visibility = hashOps.get(key, "visibility");
                String status     = hashOps.get(key, "status");

                if ("public".equalsIgnoreCase(visibility) &&
                    "lobby".equalsIgnoreCase(status)) {

                    String gameId = key.replace("game:", "");

                    Map<String, String> gameData = hashOps.entries(key);
                    /* creator is the owner → same as gameId */
                    String creatorIdStr = gameId;
                    String creatorName  = playerRepo.findById(Integer.parseInt(creatorIdStr))
                                                    .map(Player::getName)
                                                    .orElse(creatorIdStr);

                    gameData.put("creatorNickname", creatorName);

                    /* how many players are in */
                    long count = Optional.ofNullable(
                                    redisTemplate.opsForSet()
                                                .size("game:" + gameId + ":players")
                                ).orElse(0L);
                    gameData.put("playerCount", String.valueOf(count));
                    gameData.put("gameId",      gameId);

                    publicLobbyGames.add(gameData);
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        }
        return publicLobbyGames;
    }


    /** Add Player */
    public String addPlayerToGame(int gameId, int playerId) {

        validationUtils.validatePlayerExists(playerId);

        String gameKey       = GAME_PREFIX + gameId;
        String playerSetKey  = gameKey + PLAYERS_KEY_SUFFIX;


        /* ── reconnect: player already in set ─────────────────────────── */
        Boolean isMember = setOps.isMember(playerSetKey, String.valueOf(playerId));
        if (Boolean.TRUE.equals(isMember)) {
            return "Reconnected.";
        }

        // Game must exist
        if (!redisTemplate.hasKey(gameKey))
            throw new IllegalStateException("Game not found.");

        /* ── lobby-only check ───────────────────────────── */
        String status = hashOps.get(gameKey, "status");        // <- correct field
        validationUtils.ensureLobby(status);                   // throws if not "lobby"

        /* ── visibility check ───────────────────────────── */
        String visibility = hashOps.get(gameKey, "visibility");
        if (!"public".equalsIgnoreCase(visibility))
            throw new IllegalStateException("Game is private.");

        /* ── max-players check ──────────────────────────── */
        Long playerCount = setOps.size(playerSetKey);
        if (playerCount != null && playerCount >= MAX_PLAYERS)
            throw new IllegalStateException("Game is full (4 players).");

        /* ── add player ─────────────────────────────────── */
        setOps.add(playerSetKey, String.valueOf(playerId));
        return "Player added.";
    }

    
    /** Add Player with Invite Code */
    public String addPlayerToGameWithInviteCode(String inviteCode, int playerId) {

        validationUtils.validatePlayerExists(playerId);
        validationUtils.validateInviteCode(inviteCode);

        Set<String> keys = redisTemplate.keys(GAME_PREFIX + "*");
        if (keys.isEmpty()) return "No games found.";

        for (String gameKey : keys) {
        /* 🚫 skip auxiliary hashes like game:4:players */
        if (gameKey.endsWith(":players")) continue;

            String storedInvite = hashOps.get(gameKey, "inviteCode");
            String status       = hashOps.get(gameKey, "status");

            /* Add player when invite matches */
            if (inviteCode.equalsIgnoreCase(storedInvite)) {

                if (!"lobby".equalsIgnoreCase(status))
                    return "Game is already in progress or ended.";

                String playerSetKey = gameKey + PLAYERS_KEY_SUFFIX;
                if (Boolean.TRUE.equals(setOps.isMember(playerSetKey, String.valueOf(playerId)))) {
                    return gameKey.replace("game:", "");
                }
                if (isPlayerInAnyGame(playerId)) {
                    throw new GameStateConflictException("Player is already in another game");
                }
                Long count = Optional.ofNullable(setOps.size(playerSetKey)).orElse(0L);
                if (count >= MAX_PLAYERS) return "Game is full.";

                /* ✅ add player */
                setOps.add(playerSetKey, String.valueOf(playerId));

                /* ✅ send back just the id, e.g.  "4" */
                return gameKey.replace("game:", "");
            }

        }
        return "Invalid invite code.";
    }

    

    /** Remove Player */
    // public String removePlayerFromGame(int gameId, int playerId) {
    //     String gameKey = GAME_PREFIX + gameId;
    //     String playerSetKey = gameKey + PLAYERS_KEY_SUFFIX;
    //     setOps.remove(playerSetKey, String.valueOf(playerId));

    //     // If owner left, delete game
    //     String owner = hashOps.get(gameKey, "owner");
    //     if (String.valueOf(playerId).equals(owner)) {
    //         deleteGame(gameId);
    //         return "Owner left. Game deleted.";
    //     }

    //     return "Player removed.";
    // }

    /** Get Players */
    public Set<String> getPlayersInGame(int gameId) {
        String playersKey = "game:" + gameId + ":players";
        return redisTemplate.opsForSet().members(playersKey);
    }
    

    /** Get Owner */
    private String getOwner(int gameId) {
        return hashOps.get(GAME_PREFIX + gameId, "owner");
    }

    /** Generate Invite Code */
    private String generateInviteCode() {
        String code;
        do {
            code = random.ints(CODE_LENGTH, 0, CODE_CHARS.length())
                    .mapToObj(CODE_CHARS::charAt)
                    .collect(StringBuilder::new, StringBuilder::append, StringBuilder::append)
                    .toString();
        } while (redisTemplate.hasKey(INVITE_PREFIX + code));

        return code;
    }

    /** Check the End Conditions */
    // This method is called periodically to check if the game should end
    // It checks if the game is in progress and if there are players
    // It checks if the timer has reached the maximum time
    // It checks if any player has reached the maximum money
    // If any condition is met, it ends the game
    public boolean checkEndCondition(int gameId) {
        String gameKey = "game:" + gameId;
        String timerStr = hashOps.get(gameKey, "timer");
    
        if (timerStr != null && Integer.parseInt(timerStr) >= 1200) {
            endGame(gameId);
            return true;
        }
    
        Set<String> playerIds = setOps.members(gameKey + ":players");
        if (playerIds != null) {
            for (String pid : playerIds) {
                String moneyStr = (String) redisTemplate.opsForHash().get("player:" + pid, "money");
                if (moneyStr != null && Integer.parseInt(moneyStr) >= 5000) {
                    endGame(gameId);
                    return true;
                }
            }
        }
    
        return false;
    }

    /** Remove Player */
    // This method is called when a player leaves the game
    // It checks if the player is the owner and if the game is in lobby status
    // If so, it deletes the game and all players
    // If the player is not the owner, it just removes the player from the game
    // If the game is in progress, it finalizes the player stats
    // and removes the player from the game
    public String removePlayerFromGame(int gameId, int playerId) {

        validationUtils.validatePlayerExists(playerId);

        System.out.println("Removing player " + playerId + " from game " + gameId);

        String gameKey = "game:" + gameId;
        String playerSetKey = gameKey + ":players";

        // Remove player from Redis set
        setOps.remove(playerSetKey, String.valueOf(playerId));

        String status = hashOps.get(gameKey, "status");

        // If the owner leaves while in lobby, delete the game
        if (gameId == playerId && "lobby".equalsIgnoreCase(status)) {
            deleteGameAndPlayers(gameId);
            return "Owner left during lobby. Game deleted.";
        }


        // Handle player leaving mid-game
        if ("inProgress".equalsIgnoreCase(status)) {
            String startTimeStr = hashOps.get(gameKey, "startTime");
            Instant now = Instant.now();
            Instant startTime = startTimeStr != null ? Instant.parse(startTimeStr) : now;
            int sessionSeconds = (int) Duration.between(startTime, now).getSeconds();

            int money = Integer.parseInt((String) redisTemplate.opsForHash().get("player:" + playerId, "money"));
            finalizePlayerStats(playerId, false, money, sessionSeconds);
        }

        return "Player removed.";
    }

    
    
    public void updateGameFields(int gameId, Map<String, String> fields) {
        hashOps.putAll(GAME_PREFIX + gameId, fields);
    }    

    /** Find the Winner */
    // This method is called when the game ends
    // It checks if the game is in progress and if there are players
    // It determines the winner by calculating the total value of each player
    // It compares the total value of each player and returns the player with the highest value
    // It uses the player's money and properties to calculate the total value
    public String determineGameWinner(int gameId) {
        String playersKey = "game:" + gameId + ":players";
        Set<String> playerIds = setOps.members(playersKey);
        if (playerIds == null) return null;

        String winner = null;
        int maxTotalValue = -1;

        for (String pid : playerIds) {
            String playerKey = "player:" + pid;
            int money = Integer.parseInt((String) redisTemplate.opsForHash().get(playerKey, "money"));

            String propertiesJson = (String) redisTemplate.opsForHash().get(playerKey, "properties");
            List<Integer> propertyIds = new ArrayList<>();
            if (propertiesJson != null && !propertiesJson.isEmpty()) {
                try {
                    propertyIds = new ObjectMapper().readValue(propertiesJson, new TypeReference<List<Integer>>() {});
                } catch (Exception ignored) {}
            }

            List<Square> squares = squareRepo.findAllById(propertyIds);
            int totalValue = money;
            for (Square s : squares) {
                if (s.getPrice() != null)
                    totalValue += s.getPrice();
            }

            if (totalValue > maxTotalValue) {
                maxTotalValue = totalValue;
                winner = pid;
            }
        }

        return winner;
    }

    /** Finalize Player Stats */
    // This method is called when the game ends
    // It updates the player's stats in the database
    // It checks if the player already has stats, if not, it creates a new stats object
    // It updates the total games, wins, losses, money, and time played
    // Finally, it saves the stats object to the database
    // This method is called for each player in the game
    // It checks if the player is the winner and updates the stats accordingly
    public void finalizePlayerStats(int playerId, boolean isWinner, int money, int sessionSeconds) {
        Player player = playerRepo.findById(playerId)
        .orElseThrow(() -> new IllegalArgumentException("Player not found"));

        Stats stats = statsRepo.findByPlayer(player).orElseGet(() -> {
            Stats s = new Stats();
            s.setPlayer(player); // 👈 Now Player object, not int
            return s;
        });


    
        stats.setTotalGames(stats.getTotalGames() + 1);
        if (isWinner) {
            stats.setTotalWins(stats.getTotalWins() + 1);
        } else {
            stats.setTotalLosses(stats.getTotalLosses() + 1);
        }
        stats.setTotalMoney(stats.getTotalMoney() + money);
        stats.setTotalTimePlayed(stats.getTotalTimePlayed() + sessionSeconds);
    
        statsRepo.save(stats);
    }
    
    /** Delete Game and Players */
    // This method is called when the game ends
    // It deletes the game and all players from Redis
    public void deleteGameAndPlayers(int gameId) {
        String gameKey    = "game:" + gameId;
        String playersKey = gameKey + ":players";

        // 1) fetch the list of player IDs
        Set<String> playerIds = redisTemplate.opsForSet().members(playersKey);

        // 2) delete the game-level keys
        redisTemplate.delete(gameKey);
        redisTemplate.delete(playersKey);

        // 3) delete each player:<pid> hash
        if (playerIds != null) {
            for (String pid : playerIds) {
                redisTemplate.delete("player:" + pid);
            }
        }
    }
    

    /** End Game */
    // This method is called when the game ends
    // It checks if the game is in progress and if there are players
    // It updates the game status to ended
    // It determines the winner and updates the game data
    // It finalizes the player stats and deletes the game and players
    public void endGame(int gameId) {
        String gameKey = "game:" + gameId;
        Set<String> playerIds = setOps.members(gameKey + ":players");
        if (playerIds == null || playerIds.isEmpty()) return;

        // 1) mark ended + winner
        hashOps.put(gameKey, "status", "ended");
        String winner = determineGameWinner(gameId);
        hashOps.put(gameKey, "winner", winner);

        // 2) finalize per-player stats
        String startTimeStr = hashOps.get(gameKey, "startTime");
        Instant now = Instant.now();
        Instant startTime = startTimeStr != null
            ? Instant.parse(startTimeStr)
            : now;
        int sessionSeconds = (int) Duration.between(startTime, now).getSeconds();
        for (String pid : playerIds) {
            int money = Integer.parseInt(
                (String) redisTemplate.opsForHash().get("player:" + pid, "money")
            );
            finalizePlayerStats(
                Integer.parseInt(pid),
                pid.equals(winner),
                money,
                sessionSeconds
            );

            // 2a) expire the individual player hash after 30s
            redisTemplate.expire("player:" + pid, 30, TimeUnit.SECONDS);
        }

        // 3) instead of immediate delete, set a TTL so you have time to notify clients
        redisTemplate.expire(gameKey,            30, TimeUnit.SECONDS);
        redisTemplate.expire(gameKey + ":players", 30, TimeUnit.SECONDS);
    }
    
    /* ------------------------------------------------------------------
    * Convenience: set a single field in the game hash
    * ------------------------------------------------------------------ */
    public void setGameField(int gameId, String field, String value) {
        String key = GAME_PREFIX + gameId;
        if (value == null) {
            // delete a field when null is passed
            hashOps.delete(key, field);
        } else {
            hashOps.put(key, field, value);
        }
    }

    /* ------------------------------------------------------------------
    * Convenience: set any field inside player:{playerId} hash
    * ------------------------------------------------------------------ */
    public void setPlayerField(int playerId, String field, String value) {
        hashOps.put("player:" + playerId, field, value);
    }


    public void forceRotateTurn(int gameId, String currentId) {
        Set<String> set = getPlayersInGame(gameId);
        if (set == null || set.size() <= 1) return;    // nothing to rotate
    
        List<Integer> ids = set.stream()
                .map(Integer::parseInt)
                .sorted()
                .toList();
    
        int idx = ids.indexOf(Integer.parseInt(currentId));
        int next = ids.get((idx + 1) % ids.size());
    
        hashOps.put("game:" + gameId, "playerTurn", String.valueOf(next));
    }
    
    
    /* ──────────────────────────────────────────────────────────── */
    /* Optional-action helpers – buy / pay-jail “pause” mechanism   */
    /* ──────────────────────────────────────────────────────────── */

    private static final String OPT_KEY = "optionalAction";   // field in game hash
    private record Opt(int playerId, String type, String arg) {}

    public void setOptionalAction(int gameId, int playerId,
                                String type, String arg) {

        String payload = playerId + ":" + type + ":" + arg;   // simple CSV
        hashOps.put(gameKey(gameId), OPT_KEY, payload);
    }

    public void clearOptionalAction(int gameId) {
        hashOps.delete(gameKey(gameId), OPT_KEY);
    }

    /** Generic check – only verifies that an optionalAction exists and
     *  that it belongs to <code>playerId</code>.  No type / square match. */
    public void assertOptionalAction(int gameId, int playerId) {

        String json = hashOps.get("game:" + gameId, "optionalAction");
        if (json == null)
            throw new IllegalStateException("No pending optional action.");

        try {
            OptionalAction dto =
                new ObjectMapper().readValue(json, OptionalAction.class);

            if (dto.playerId() != playerId)
                throw new IllegalStateException("Action belongs to another player");
        } catch (Exception e) {
            throw new IllegalStateException("Corrupted optionalAction JSON", e);
        }
    }

    /** verify that an optional action exists and matches what the caller tries */
    public void assertOptionalAction(int gameId, int playerId,
                                    String expectedType) {

        assertOptionalAction(gameId, playerId, expectedType, null);
    }

    public void assertOptionalAction(int gameId, int playerId,
                                    String expectedType, Integer expectedArg) {

        String raw = hashOps.get(gameKey(gameId), OPT_KEY);
        if (raw == null)
            throw new IllegalStateException("No optional action pending");

        String[] parts = raw.split(":");
        Opt opt = new Opt(Integer.parseInt(parts[0]), parts[1],
                        parts.length > 2 ? parts[2] : "");

        if (opt.playerId != playerId)
            throw new IllegalStateException("Not your pending action");
        if (!opt.type.equals(expectedType))
            throw new IllegalStateException("Wrong action type");
        if (expectedArg != null && !opt.arg.equals(String.valueOf(expectedArg)))
            throw new IllegalStateException("Argument mismatch");
    }

    /* helper */
    private String gameKey(int id) { return "game:" + id; }

}
