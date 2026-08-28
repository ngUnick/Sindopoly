package com.example.Sindopoly_Java.service.transition;

import org.springframework.data.redis.core.Cursor;
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ScanOptions;
import org.springframework.data.redis.serializer.RedisSerializer;
import org.springframework.stereotype.Component;

import java.util.LinkedHashSet;
import java.util.OptionalInt;
import java.util.Set;
import java.util.TreeSet;

/** Read-only adapter for discovering game resources without leaking Redis scans into commands. */
@Component
public class RedisGameDiscovery {
    private static final String INVITE_CODE = "inviteCode";
    private static final long SCAN_COUNT_HINT = 128;
    private final RedisTemplate<String, String> redis;

    public RedisGameDiscovery(RedisTemplate<String, String> redis) {
        this.redis = redis;
    }

    public Set<Integer> activeGameIds() {
        Set<Integer> ids = new TreeSet<>();
        Set<String> keys = scanKeys(RedisGameKeys.gamePattern());
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
        Set<String> keys = scanKeys(RedisGameKeys.membersPattern());
        String member = String.valueOf(playerId);
        return keys.stream().filter(this::isCanonicalMembersKey)
                .anyMatch(key -> Boolean.TRUE.equals(redis.opsForSet().isMember(key, member)));
    }

    /**
     * Traverses the existing keyspace incrementally. SCAN is weakly consistent,
     * so callers treat discovery as a candidate set and authoritative commands
     * still validate the selected game through normal Redis reads/CAS.
     */
    Set<String> scanKeys(String pattern) {
        ScanOptions options = ScanOptions.scanOptions().match(pattern).count(SCAN_COUNT_HINT).build();
        Set<String> keys = redis.execute((RedisCallback<Set<String>>) connection -> {
            try (Cursor<byte[]> cursor = connection.keyCommands().scan(options)) {
                return collectScannedKeys(cursor, redis.getKeySerializer());
            }
        });
        return keys == null ? Set.of() : keys;
    }

    static Set<String> collectScannedKeys(Cursor<byte[]> cursor, RedisSerializer<?> serializer) {
        Set<String> keys = new LinkedHashSet<>();
        while (cursor.hasNext()) {
            Object decoded = serializer.deserialize(cursor.next());
            if (decoded instanceof String key) keys.add(key);
        }
        return keys;
    }

    OptionalInt parseGameId(String key) {
        String prefix = "game:";
        if (key == null || !key.startsWith(prefix)) return OptionalInt.empty();
        return parseCanonicalIdSegment(key.substring(prefix.length()));
    }

    private OptionalInt parseCanonicalIdSegment(String segment) {
        if (segment == null || segment.isEmpty() || segment.charAt(0) < '1' || segment.charAt(0) > '9') {
            return OptionalInt.empty();
        }

        int value = 0;
        for (int index = 0; index < segment.length(); index++) {
            char character = segment.charAt(index);
            if (character < '0' || character > '9') return OptionalInt.empty();
            int digit = character - '0';
            if (value > (Integer.MAX_VALUE - digit) / 10) return OptionalInt.empty();
            value = value * 10 + digit;
        }
        return OptionalInt.of(value);
    }

    boolean isCanonicalMembersKey(String key) {
        String suffix = ":players";
        return key != null && key.endsWith(suffix)
                && parseGameId(key.substring(0, key.length() - suffix.length())).isPresent();
    }
}
