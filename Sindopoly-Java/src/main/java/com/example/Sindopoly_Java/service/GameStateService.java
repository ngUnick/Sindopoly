package com.example.Sindopoly_Java.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.SetOperations;
import org.springframework.stereotype.Service;

import com.example.Sindopoly_Java.model.Square;
import com.example.Sindopoly_Java.model.Stats;
import com.example.Sindopoly_Java.repository.SquareRepository;
import com.example.Sindopoly_Java.repository.StatsRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;

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
    public GameStateService(RedisTemplate<String, String> redisTemplate, StatsRepository statsRepo) {
        this.redisTemplate = redisTemplate;
        this.hashOps = redisTemplate.opsForHash();
        this.setOps = redisTemplate.opsForSet();
        this.statsRepo = statsRepo;
    }


    /** Create Game */
    public Map<String, String> createGame(int ownerId, String visibility) {
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
    

    /** Start Game */
    public void startGame(int gameId) {
        String gameKey = GAME_PREFIX + gameId;
        if (!redisTemplate.hasKey(gameKey)) return;

        hashOps.put(gameKey, "status", "inProgress");
        hashOps.put(gameKey, "playerTurn", getOwner(gameId));
        hashOps.put(gameKey, "timer", "0");
        hashOps.put(gameKey, "startTime", Instant.now().toString());
        hashOps.put(gameKey, "maxTime", String.valueOf(MAX_TIME));
        hashOps.put(gameKey, "maxMoney", String.valueOf(MAX_MONEY));
        hashOps.put(gameKey, "winner", "null");
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

    /** Add Player */
    public String addPlayerToGame(int gameId, int playerId) {
        String gameKey = GAME_PREFIX + gameId;
        String playerSetKey = gameKey + PLAYERS_KEY_SUFFIX;
    
        // Game must exist
        if (!redisTemplate.hasKey(gameKey)) {
            return "Game not found.";
        }
    
        // Check visibility and status
        String visibility = hashOps.get(gameKey, "visibility");
        String status = hashOps.get(gameKey, "status");
    
        if (!"public".equalsIgnoreCase(visibility)) {
            return "Game is private.";
        }
    
        if (!"lobby".equalsIgnoreCase(status)) {
            return "Game is already in progress or ended.";
        }
    
        Long playerCount = setOps.size(playerSetKey);
        if (playerCount == null) playerCount = 0L;
    
        if (playerCount >= MAX_PLAYERS) {
            return "Game is full.";
        }
    
        setOps.add(playerSetKey, String.valueOf(playerId));
        return "Player added.";
    }
    
    /** Add Player with Invite Code */
    public String addPlayerToGameWithInviteCode(String inviteCode, int playerId) {
        // Loop through all games to match invite code (or add an index later)
        Set<String> keys = redisTemplate.keys(GAME_PREFIX + "*");
        
        // The keys variable is never null with redisTemplate.keys(), so we can just handle the case when keys is empty
        if (keys.isEmpty()) return "No games found.";
    
        for (String gameKey : keys) {
            String storedInvite = hashOps.get(gameKey, "inviteCode");
            String status = hashOps.get(gameKey, "status");
    
            if (inviteCode.equalsIgnoreCase(storedInvite)) {
                if (!"lobby".equalsIgnoreCase(status)) {
                    return "Game is already in progress or ended.";
                }
    
                String playerSetKey = gameKey + PLAYERS_KEY_SUFFIX;
                Long playerCount = setOps.size(playerSetKey);
                if (playerCount == null) playerCount = 0L;
    
                if (playerCount >= MAX_PLAYERS) {
                    return "Game is full.";
                }
    
                setOps.add(playerSetKey, String.valueOf(playerId));
                return "Player added to private game.";
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
        String gameKey = GAME_PREFIX + gameId;
        String playerSetKey = gameKey + PLAYERS_KEY_SUFFIX;
    
        setOps.remove(playerSetKey, String.valueOf(playerId));
    
        String owner = hashOps.get(gameKey, "owner");
        String status = hashOps.get(gameKey, "status");
    
        if (String.valueOf(playerId).equals(owner) && "lobby".equalsIgnoreCase(status)) {
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
        Stats stats = statsRepo.findByPlayer(playerId).orElseGet(() -> {
            Stats s = new Stats();
            s.setPlayer(playerId);
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
        String gameKey = "game:" + gameId;
        redisTemplate.delete(gameKey);
        redisTemplate.delete(gameKey + ":players");
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
    
        hashOps.put(gameKey, "status", "ended");
    
        String winner = determineGameWinner(gameId);
        hashOps.put(gameKey, "winner", winner);
    
        String startTimeStr = hashOps.get(gameKey, "startTime");
        Instant now = Instant.now();
        Instant startTime = startTimeStr != null ? Instant.parse(startTimeStr) : now;
        int sessionSeconds = (int) Duration.between(startTime, now).getSeconds();
    
        for (String pid : playerIds) {
            int money = Integer.parseInt((String) redisTemplate.opsForHash().get("player:" + pid, "money"));
            finalizePlayerStats(Integer.parseInt(pid), pid.equals(winner), money, sessionSeconds);
        }
    
        deleteGameAndPlayers(gameId);
    }
    

    
    
}
