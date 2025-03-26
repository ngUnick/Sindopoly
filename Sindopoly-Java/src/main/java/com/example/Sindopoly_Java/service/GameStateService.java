package com.example.Sindopoly_Java.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.SetOperations;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

@Service
public class GameStateService {
    private static final String GAME_PREFIX = "game:";
    private static final String PLAYERS_KEY_SUFFIX = ":players";
    private static final String INVITE_PREFIX = "invite:";
    private static final String CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    private static final int CODE_LENGTH = 5;

    private final RedisTemplate<String, String> redisTemplate;
    private final HashOperations<String, String, String> hashOps;
    private final SetOperations<String, String> setOps;
    private final SecureRandom random = new SecureRandom();

    @Autowired
    public GameStateService(RedisTemplate<String, String> redisTemplate) {
        this.redisTemplate = redisTemplate;
        this.hashOps = redisTemplate.opsForHash();
        this.setOps = redisTemplate.opsForSet();
    }

    public void saveGame(int gameId, Map<String, Object> gameData) {
        String gameKey = GAME_PREFIX + gameId;

        // Handle invite code logic
        if ("private".equals(gameData.get("visibility"))) {
            String inviteCode = generateUniqueInviteCode();
            gameData.put("inviteCode", inviteCode);
            redisTemplate.opsForValue().set(INVITE_PREFIX + inviteCode, String.valueOf(gameId), 24, TimeUnit.HOURS);
        }

        // Save the game data as string values
        gameData.forEach((k, v) -> hashOps.put(gameKey, k, String.valueOf(v)));
        redisTemplate.expire(gameKey, 24, TimeUnit.HOURS);
    }

    public Map<String, String> getGame(int gameId) {
        return hashOps.entries(GAME_PREFIX + gameId);
    }

    public void deleteGame(int gameId) {
        String gameKey = GAME_PREFIX + gameId;
        String inviteCode = hashOps.get(gameKey, "inviteCode");
        if (inviteCode != null) redisTemplate.delete(INVITE_PREFIX + inviteCode);

        redisTemplate.delete(gameKey);
        redisTemplate.delete(gameKey + PLAYERS_KEY_SUFFIX);
    }

    public void addPlayerToGame(int gameId, int playerId) {
        setOps.add(GAME_PREFIX + gameId + PLAYERS_KEY_SUFFIX, String.valueOf(playerId));
    }

    public Set<String> getPlayersInGame(int gameId) {
        return setOps.members(GAME_PREFIX + gameId + PLAYERS_KEY_SUFFIX);
    }

    private String generateUniqueInviteCode() {
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
