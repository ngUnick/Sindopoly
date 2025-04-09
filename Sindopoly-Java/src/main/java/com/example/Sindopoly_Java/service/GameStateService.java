package com.example.Sindopoly_Java.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.SetOperations;
import org.springframework.stereotype.Service;

import com.example.Sindopoly_Java.model.Stats;
import com.example.Sindopoly_Java.repository.StatsRepository;

import java.time.Instant;
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

    private final StatsRepository statsRepo;

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
    public String removePlayerFromGame(int gameId, int playerId) {
        String gameKey = GAME_PREFIX + gameId;
        String playerSetKey = gameKey + PLAYERS_KEY_SUFFIX;
        setOps.remove(playerSetKey, String.valueOf(playerId));

        // If owner left, delete game
        String owner = hashOps.get(gameKey, "owner");
        if (String.valueOf(playerId).equals(owner)) {
            deleteGame(gameId);
            return "Owner left. Game deleted.";
        }

        return "Player removed.";
    }

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
    public boolean checkEndCondition(int gameId) {
        String gameKey = "game:" + gameId;
        String timerStr = hashOps.get(gameKey, "timer");
    
        if (timerStr != null && Integer.parseInt(timerStr) >= 1200) {
            finalizeGameStatsAndCleanup(gameId);
            return true;
        }
    
        Set<String> playerIds = setOps.members(gameKey + ":players");
        if (playerIds != null) {
            for (String pid : playerIds) {
                String moneyStr = (String) redisTemplate.opsForHash().get("player:" + pid, "money");
                if (moneyStr != null && Integer.parseInt(moneyStr) >= 5000) {
                    finalizeGameStatsAndCleanup(gameId);
                    return true;
                }
            }
        }
    
        return false;
    }

    private void finalizeGameStatsAndCleanup(int gameId) {
        String gameKey = "game:" + gameId;
        hashOps.put(gameKey, "status", "ended");

        Set<String> playerIds = setOps.members(gameKey + ":players");
        String startTimeStr = hashOps.get(gameKey, "startTime");

        Instant now = Instant.now();
        Instant startTime = startTimeStr != null ? Instant.parse(startTimeStr) : now;
        int sessionSeconds = (int) java.time.Duration.between(startTime, now).getSeconds();

        // Determine winner (first with >= 5000 or highest money)
        String winner = null;
        int highestMoney = -1;

        for (String pid : playerIds) {
            String moneyStr = (String) redisTemplate.opsForHash().get("player:" + pid, "money");
            int money = moneyStr != null ? Integer.parseInt(moneyStr) : 0;

            if (money >= 5000 || money > highestMoney) {
                winner = pid;
                highestMoney = money;
            }
        }

        hashOps.put(gameKey, "winner", winner);

        // Persist stats for each player
        for (String pid : playerIds) {
            int playerId = Integer.parseInt(pid);
            int money = Integer.parseInt((String) redisTemplate.opsForHash().get("player:" + pid, "money"));

            Stats stats = statsRepo.findByPlayer(playerId).orElseGet(() -> {
                Stats s = new Stats();
                s.setPlayer(playerId);
                return s;
            });

            stats.setTotalGames(stats.getTotalGames() + 1);
            if (pid.equals(winner)) {
                stats.setTotalWins(stats.getTotalWins() + 1);
            } else {
                stats.setTotalLosses(stats.getTotalLosses() + 1);
            }
            stats.setTotalMoney(stats.getTotalMoney() + money);
            stats.setTotalTimePlayed(stats.getTotalTimePlayed() + sessionSeconds);

            statsRepo.save(stats);
        }

        // Cleanup Redis
        redisTemplate.delete(gameKey);
        redisTemplate.delete(gameKey + ":players");

        System.out.println("Game " + gameId + " ended. Winner: " + winner);
    }

    
    
}
