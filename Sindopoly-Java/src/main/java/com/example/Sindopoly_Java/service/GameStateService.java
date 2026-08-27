package com.example.Sindopoly_Java.service;

import com.example.Sindopoly_Java.model.Player;
import com.example.Sindopoly_Java.repository.PlayerRepository;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.SetOperations;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Read-oriented access used by discovery and authorization consumers.
 *
 * <p>Authoritative game mutations belong to the transition/state-store path;
 * this facade deliberately exposes no raw field mutation helpers.</p>
 */
@Service
public class GameStateService {
    private static final String GAME_PREFIX = "game:";

    private final RedisTemplate<String, String> redisTemplate;
    private final HashOperations<String, String, String> hashOps;
    private final SetOperations<String, String> setOps;
    private final PlayerRepository playerRepo;

    public GameStateService(
            RedisTemplate<String, String> redisTemplate,
            PlayerRepository playerRepo) {
        this.redisTemplate = redisTemplate;
        this.hashOps = redisTemplate.opsForHash();
        this.setOps = redisTemplate.opsForSet();
        this.playerRepo = playerRepo;
    }

    /** Returns whether the player is currently a member of any game. */
    public boolean isPlayerInAnyGame(int playerId) {
        Set<String> keys = redisTemplate.keys("game:*:players");
        if (keys == null || keys.isEmpty()) {
            return false;
        }

        for (String key : keys) {
            Boolean isMember = setOps.isMember(key, String.valueOf(playerId));
            if (Boolean.TRUE.equals(isMember)) {
                return true;
            }
        }
        return false;
    }

    /** Returns the current Redis snapshot for a game hash. */
    public Map<String, String> getGame(int gameId) {
        return hashOps.entries(gameKey(gameId));
    }

    /** Returns public games that are still accepting lobby members. */
    public List<Map<String, String>> getAllPublicLobbyGames() {
        Set<String> keys = redisTemplate.keys("game:*");
        if (keys == null || keys.isEmpty()) {
            return List.of();
        }

        List<Map<String, String>> publicLobbyGames = new ArrayList<>();
        for (String key : keys) {
            try {
                if (key.endsWith(":players")) {
                    continue;
                }

                String visibility = hashOps.get(key, "visibility");
                String status = hashOps.get(key, "status");
                if (!"public".equalsIgnoreCase(visibility) || !"lobby".equalsIgnoreCase(status)) {
                    continue;
                }

                String gameId = key.substring(GAME_PREFIX.length());
                Map<String, String> gameData = hashOps.entries(key);
                // Frozen turn order is private active-game state, not discovery metadata.
                gameData.remove("turnOrder");
                String creatorName = playerRepo.findById(Integer.parseInt(gameId))
                        .map(Player::getName)
                        .orElse(gameId);
                gameData.put("creatorNickname", creatorName);

                long playerCount = Optional.ofNullable(setOps.size(key + ":players")).orElse(0L);
                gameData.put("playerCount", String.valueOf(playerCount));
                gameData.put("gameId", gameId);
                publicLobbyGames.add(gameData);
            } catch (RuntimeException ignored) {
                // Preserve discovery availability when one malformed/stale entry is encountered.
            }
        }
        return publicLobbyGames;
    }

    /** Returns the Redis membership set used by command authorization. */
    public Set<String> getPlayersInGame(int gameId) {
        return setOps.members(gameKey(gameId) + ":players");
    }

    private String gameKey(int gameId) {
        return GAME_PREFIX + gameId;
    }
}
