package com.example.Sindopoly_Java.service;

import com.example.Sindopoly_Java.exception.GameStateConflictException;
import com.example.Sindopoly_Java.model.dto.CurrentGameDto;
import com.example.Sindopoly_Java.service.transition.GameSnapshot;
import com.example.Sindopoly_Java.service.transition.RedisGameDiscovery;
import com.example.Sindopoly_Java.service.transition.RedisGameTransitionStore;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/** Resolves a session player's single resumable game from authoritative Redis state. */
@Service
public class CurrentGameService {
    private static final Logger log = LoggerFactory.getLogger(CurrentGameService.class);
    private static final String STATUS_LOBBY = "lobby";
    private static final String STATUS_IN_PROGRESS = "inProgress";

    private final RedisGameDiscovery discovery;
    private final RedisGameTransitionStore store;

    public CurrentGameService(RedisGameDiscovery discovery, RedisGameTransitionStore store) {
        this.discovery = discovery;
        this.store = store;
    }

    public Optional<CurrentGameDto> findForPlayer(int playerId) {
        List<CurrentGameDto> resumable = new ArrayList<>();
        for (Integer gameId : discovery.gameIdsForPlayer(playerId)) {
            GameSnapshot snapshot = store.loadStable(gameId);
            if (snapshot.game().isEmpty()
                    || !snapshot.members().contains(String.valueOf(playerId))) {
                continue;
            }

            String status = resumableStatus(snapshot.game().get("status"));
            if (status == null) {
                continue;
            }
            String visibility = snapshot.game().get("visibility");
            if (!"public".equalsIgnoreCase(visibility) && !"private".equalsIgnoreCase(visibility)) {
                throw new IllegalStateException("Resumable game visibility is missing or invalid");
            }
            resumable.add(new CurrentGameDto(
                    gameId, status, snapshot.stateVersion(), visibility.toLowerCase(java.util.Locale.ROOT)));
        }

        if (resumable.size() > 1) {
            // SCAN order is not authority. Fail closed instead of routing into an arbitrary game.
            log.error("Current-game invariant violated for authenticated player (resumableCount={})",
                    resumable.size());
            throw new GameStateConflictException("Player has multiple resumable games");
        }
        return resumable.stream().findFirst();
    }

    private String resumableStatus(String status) {
        if (STATUS_LOBBY.equalsIgnoreCase(status)) {
            return STATUS_LOBBY;
        }
        if (STATUS_IN_PROGRESS.equalsIgnoreCase(status)) {
            return STATUS_IN_PROGRESS;
        }
        return null;
    }
}
