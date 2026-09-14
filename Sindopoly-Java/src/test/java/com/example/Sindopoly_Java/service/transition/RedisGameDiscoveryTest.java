package com.example.Sindopoly_Java.service.transition;

import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.Cursor;
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.SetOperations;
import org.springframework.data.redis.serializer.StringRedisSerializer;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.OptionalInt;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;

class RedisGameDiscoveryTest {
    @SuppressWarnings("unchecked")
    @Test
    void discoversOnlyNumericGameKeys() {
        RedisTemplate<String, String> redis = mock(RedisTemplate.class);
        scannedKeys(redis,
                "game:1", "game:10", "game:2147483647",
                "game:", "game:0", "game:00", "game:01", "game:001",
                "game:-1", "game:+1", "game: 1", "game:1 ", "game:1.0",
                "game:\u0661", "game:abc", "game:2147483648",
                "game:1:players", "game:1:commands", "game:1:deck", "prefix-game:2");

        assertThat(new RedisGameDiscovery(redis).activeGameIds())
                .containsExactly(1, 10, Integer.MAX_VALUE);
        verify(redis, never()).keys(anyString());
    }

    @SuppressWarnings("unchecked")
    @Test
    void returnsEmptyDiscoveryWhenScanHasNoMatches() {
        RedisTemplate<String, String> redis = mock(RedisTemplate.class);
        scannedKeys(redis);

        assertThat(new RedisGameDiscovery(redis).activeGameIds()).isEmpty();
        verify(redis, never()).keys(anyString());
    }

    @SuppressWarnings("unchecked")
    @Test
    void findsInviteCodeCaseInsensitivelyWithoutChangingKeyFormat() {
        RedisTemplate<String, String> redis = mock(RedisTemplate.class);
        HashOperations<String, Object, Object> hashes = mock(HashOperations.class);
        scannedKeys(redis, "game:12", "game:12:players");
        when(redis.opsForHash()).thenReturn(hashes);
        when(hashes.get("game:12", "inviteCode")).thenReturn("Ab12C");

        OptionalInt result = new RedisGameDiscovery(redis).findByInviteCode("aB12c");

        assertThat(result).hasValue(12);
        verify(hashes).get("game:12", "inviteCode");
    }

    @SuppressWarnings("unchecked")
    @Test
    void reportsMissingInviteWithoutInventingState() {
        RedisTemplate<String, String> redis = mock(RedisTemplate.class);
        HashOperations<String, Object, Object> hashes = mock(HashOperations.class);
        scannedKeys(redis, "game:12");
        when(redis.opsForHash()).thenReturn(hashes);

        assertThat(new RedisGameDiscovery(redis).findByInviteCode("NONE1")).isEmpty();
    }

    @SuppressWarnings("unchecked")
    @Test
    void checksMembershipOnlyInCanonicalMembershipSets() {
        RedisTemplate<String, String> redis = mock(RedisTemplate.class);
        SetOperations<String, String> sets = mock(SetOperations.class);
        scannedKeys(redis, "game:1:players", "game:01:players", "game:0:players",
                "game:bad:players", "game:1:players:extra", "game:1:commands");
        when(redis.opsForSet()).thenReturn(sets);
        when(sets.isMember("game:1:players", "7")).thenReturn(true);

        assertThat(new RedisGameDiscovery(redis).isPlayerInAnyGame(7)).isTrue();
        verify(sets).isMember("game:1:players", "7");
        verify(sets, never()).isMember("game:01:players", "7");
    }

    @SuppressWarnings("unchecked")
    @Test
    void returnsEveryCanonicalMembershipCandidateInGameIdOrder() {
        RedisTemplate<String, String> redis = mock(RedisTemplate.class);
        SetOperations<String, String> sets = mock(SetOperations.class);
        scannedKeys(redis, "game:12:players", "game:2:players", "game:02:players",
                "game:12:commands", "game:4:players");
        when(redis.opsForSet()).thenReturn(sets);
        when(sets.isMember("game:12:players", "7")).thenReturn(true);
        when(sets.isMember("game:2:players", "7")).thenReturn(true);

        assertThat(new RedisGameDiscovery(redis).gameIdsForPlayer(7))
                .containsExactly(2, 12);
        verify(redis, never()).keys(anyString());
    }

    @SuppressWarnings("unchecked")
    @Test
    void deduplicatesKeysReturnedAcrossCursorBatches() {
        Cursor<byte[]> cursor = mock(Cursor.class);
        when(cursor.hasNext()).thenReturn(true, true, true, false);
        when(cursor.next()).thenReturn(
                "game:7".getBytes(StandardCharsets.UTF_8),
                "game:7".getBytes(StandardCharsets.UTF_8),
                "game:8".getBytes(StandardCharsets.UTF_8));

        assertThat(RedisGameDiscovery.collectScannedKeys(cursor, new StringRedisSerializer()))
                .containsExactly("game:7", "game:8");
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private static void scannedKeys(RedisTemplate<String, String> redis, String... keys) {
        when(redis.execute(any(RedisCallback.class)))
                .thenReturn(new LinkedHashSet<>(List.of(keys)));
    }
}
