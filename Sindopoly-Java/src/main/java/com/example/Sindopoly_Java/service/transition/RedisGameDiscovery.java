package com.example.Sindopoly_Java.service.transition;

import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;

import java.util.LinkedHashSet;
import java.util.OptionalInt;
import java.util.Set;

/** Read-only adapter for discovering game resources without leaking Redis scans into commands. */
@Component
public class RedisGameDiscovery {
    private static final String INVITE_CODE = "inviteCode";
    private final RedisTemplate<String, String> redis;

    public RedisGameDiscovery(RedisTemplate<String, String> redis) {
        this.redis = redis;
    }

    public Set<Integer> activeGameIds() {
        Set<String> keys = redis.keys(RedisGameKeys.gamePattern());
        Set<Integer> ids = new LinkedHashSet<>();
        if (keys == null) return ids;
        for (String key : keys) parseGameId(key).ifPresent(ids::add);
        return ids;
    }

    public OptionalInt findByInviteCode(String inviteCode) {
        for (Integer gameId : activeGameIds()) {
            Object stored = redis.opsForHash().get(RedisGameKeys.game(gameId), INVITE_CODE);
            if (stored != null && inviteCode.equalsIgnoreCase(stored.toString())) return OptionalInt.of(gameId);
        }
        return OptionalInt.empty();
    }

    public boolean isPlayerInAnyGame(int playerId) {
        Set<String> keys = redis.keys(RedisGameKeys.membersPattern());
        if (keys == null) return false;
        String member = String.valueOf(playerId);
        return keys.stream().filter(this::isCanonicalMembersKey)
                .anyMatch(key -> Boolean.TRUE.equals(redis.opsForSet().isMember(key, member)));
    }

    private OptionalInt parseGameId(String key) {
        String prefix = "game:";
        if (key == null || !key.startsWith(prefix)) return OptionalInt.empty();
        String suffix = key.substring(prefix.length());
        if (suffix.isEmpty() || !suffix.chars().allMatch(Character::isDigit)) return OptionalInt.empty();
        try {
            int gameId = Integer.parseInt(suffix);
            return gameId > 0 ? OptionalInt.of(gameId) : OptionalInt.empty();
        } catch (NumberFormatException ignored) {
            return OptionalInt.empty();
        }
    }

    private boolean isCanonicalMembersKey(String key) {
        String suffix = ":players";
        return key != null && key.endsWith(suffix)
                && parseGameId(key.substring(0, key.length() - suffix.length())).isPresent();
    }
}
