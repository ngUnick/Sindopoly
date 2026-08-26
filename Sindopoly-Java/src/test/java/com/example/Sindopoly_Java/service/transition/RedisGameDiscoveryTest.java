package com.example.Sindopoly_Java.service.transition;

import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.SetOperations;

import java.util.OptionalInt;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RedisGameDiscoveryTest {
    @SuppressWarnings("unchecked")
    @Test
    void discoversOnlyNumericGameKeys() {
        RedisTemplate<String, String> redis = mock(RedisTemplate.class);
        when(redis.keys(RedisGameKeys.gamePattern())).thenReturn(Set.of(
                "game:12", "game:", "game:0", "game:-1", "game:abc",
                "game:1:players", "game:1:commands", "game:1:deck", "prefix-game:2"));

        assertThat(new RedisGameDiscovery(redis).activeGameIds()).containsExactly(12);
    }

    @SuppressWarnings("unchecked")
    @Test
    void findsInviteCodeCaseInsensitivelyWithoutChangingKeyFormat() {
        RedisTemplate<String, String> redis = mock(RedisTemplate.class);
        HashOperations<String, Object, Object> hashes = mock(HashOperations.class);
        when(redis.keys(RedisGameKeys.gamePattern())).thenReturn(Set.of("game:12", "game:12:players"));
        when(redis.opsForHash()).thenReturn(hashes);
        when(hashes.get("game:12", "inviteCode")).thenReturn("Ab12C");

        OptionalInt result = new RedisGameDiscovery(redis).findByInviteCode("aB12c");

        assertThat(result).hasValue(12);
        verify(redis).keys("game:*");
        verify(hashes).get("game:12", "inviteCode");
    }

    @SuppressWarnings("unchecked")
    @Test
    void reportsMissingInviteWithoutInventingState() {
        RedisTemplate<String, String> redis = mock(RedisTemplate.class);
        HashOperations<String, Object, Object> hashes = mock(HashOperations.class);
        when(redis.keys(RedisGameKeys.gamePattern())).thenReturn(Set.of("game:12"));
        when(redis.opsForHash()).thenReturn(hashes);

        assertThat(new RedisGameDiscovery(redis).findByInviteCode("NONE1")).isEmpty();
    }

    @SuppressWarnings("unchecked")
    @Test
    void checksMembershipOnlyInCanonicalMembershipSets() {
        RedisTemplate<String, String> redis = mock(RedisTemplate.class);
        SetOperations<String, String> sets = mock(SetOperations.class);
        when(redis.keys(RedisGameKeys.membersPattern())).thenReturn(Set.of(
                "game:12:players", "game:0:players", "game:bad:players", "game:12:commands"));
        when(redis.opsForSet()).thenReturn(sets);
        when(sets.isMember("game:12:players", "7")).thenReturn(true);

        assertThat(new RedisGameDiscovery(redis).isPlayerInAnyGame(7)).isTrue();
        verify(sets).isMember("game:12:players", "7");
    }
}
