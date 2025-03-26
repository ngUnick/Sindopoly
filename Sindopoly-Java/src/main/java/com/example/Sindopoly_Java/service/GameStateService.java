// GameStateService.java
package com.example.Sindopoly_Java.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.SetOperations;
import org.springframework.stereotype.Service;

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

    @Autowired
    public GameStateService(RedisTemplate<String, String> redisTemplate) {
        this.redisTemplate = redisTemplate;
        this.hashOps = redisTemplate.opsForHash();
        this.setOps = redisTemplate.opsForSet();
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
            redisTemplate.opsForValue().set(INVITE_PREFIX + inviteCode, String.valueOf(ownerId));
        }
    
        hashOps.putAll(gameKey, gameData);
        setOps.add(playersKey, String.valueOf(ownerId)); // ✅ Add owner to player list
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
        String playerSetKey = GAME_PREFIX + gameId + PLAYERS_KEY_SUFFIX;
        if (setOps.size(playerSetKey) >= MAX_PLAYERS) {
            return "Game is full.";
        }
        setOps.add(playerSetKey, String.valueOf(playerId));
        return "Player added.";
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
}
