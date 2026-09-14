package com.example.Sindopoly_Java.service;

import com.example.Sindopoly_Java.exception.GameStateConflictException;
import com.example.Sindopoly_Java.model.dto.CurrentGameDto;
import com.example.Sindopoly_Java.service.transition.GameSnapshot;
import com.example.Sindopoly_Java.service.transition.RedisGameDiscovery;
import com.example.Sindopoly_Java.service.transition.RedisGameTransitionStore;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CurrentGameServiceTest {
    @Mock RedisGameDiscovery discovery;
    @Mock RedisGameTransitionStore store;

    @Test
    void returnsResumableLobbyWithAuthoritativeProjection() {
        when(discovery.gameIdsForPlayer(7)).thenReturn(Set.of(11));
        when(store.loadStable(11)).thenReturn(snapshot(11, "lobby", 3, "private", "7"));

        assertThat(service().findForPlayer(7)).contains(
                new CurrentGameDto(11, "lobby", 3, "private"));
    }

    @Test
    void returnsResumableInProgressGameWithAuthoritativeProjection() {
        when(discovery.gameIdsForPlayer(7)).thenReturn(Set.of(12));
        when(store.loadStable(12)).thenReturn(snapshot(12, "inProgress", 8, "public", "7"));

        assertThat(service().findForPlayer(7)).contains(
                new CurrentGameDto(12, "inProgress", 8, "public"));
    }

    @Test
    void returnsEmptyWhenDiscoveryFindsNoMembership() {
        when(discovery.gameIdsForPlayer(7)).thenReturn(Set.of());

        assertThat(service().findForPlayer(7)).isEmpty();
        verify(store, never()).loadStable(org.mockito.ArgumentMatchers.anyInt());
    }

    @Test
    void excludesMissingGameBehindStaleMembershipKey() {
        when(discovery.gameIdsForPlayer(7)).thenReturn(Set.of(13));
        when(store.loadStable(13)).thenReturn(snapshot(13, null, 0, null, "7"));

        assertThat(service().findForPlayer(7)).isEmpty();
    }

    @Test
    void excludesCandidateWhenStableSnapshotNoLongerContainsPlayer() {
        when(discovery.gameIdsForPlayer(7)).thenReturn(Set.of(14));
        when(store.loadStable(14)).thenReturn(snapshot(14, "lobby", 1, "public", "9"));

        assertThat(service().findForPlayer(7)).isEmpty();
    }

    @Test
    void excludesRetainedEndedGame() {
        when(discovery.gameIdsForPlayer(7)).thenReturn(Set.of(15));
        when(store.loadStable(15)).thenReturn(snapshot(15, "ended", 19, "public", "7"));

        assertThat(service().findForPlayer(7)).isEmpty();
    }

    @Test
    void failsExplicitlyWhenPlayerHasMultipleResumableGames() {
        when(discovery.gameIdsForPlayer(7)).thenReturn(Set.of(17, 16));
        when(store.loadStable(16)).thenReturn(snapshot(16, "lobby", 1, "public", "7"));
        when(store.loadStable(17)).thenReturn(snapshot(17, "inProgress", 2, "private", "7"));

        assertThatThrownBy(() -> service().findForPlayer(7))
                .isInstanceOf(GameStateConflictException.class)
                .hasMessage("Player has multiple resumable games");
    }

    private CurrentGameService service() {
        return new CurrentGameService(discovery, store);
    }

    private GameSnapshot snapshot(
            int gameId, String status, long stateVersion, String visibility, String... members) {
        Map<String, String> game = status == null
                ? Map.of()
                : Map.of("status", status, "stateVersion", String.valueOf(stateVersion),
                        "visibility", visibility);
        return new GameSnapshot(gameId, game, Set.of(members), Map.of(), List.of());
    }
}
