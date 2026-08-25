package com.example.Sindopoly_Java.service.transition;

import com.example.Sindopoly_Java.model.Player;
import com.example.Sindopoly_Java.model.Stats;
import com.example.Sindopoly_Java.repository.PlayerRepository;
import com.example.Sindopoly_Java.repository.StatsRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

/** Applies a frozen terminal result to durable statistics exactly once. */
@Service
public class GameFinalizationService {

    public enum Outcome { APPLIED, ALREADY_FINALIZED }

    private final JdbcTemplate jdbc;
    private final PlayerRepository players;
    private final StatsRepository stats;
    private final FinalizationFailureProbe failureProbe;

    public GameFinalizationService(JdbcTemplate jdbc, PlayerRepository players, StatsRepository stats,
                                   FinalizationFailureProbe failureProbe) {
        this.jdbc = jdbc;
        this.players = players;
        this.stats = stats;
        this.failureProbe = failureProbe;
    }

    @Transactional
    public Outcome finalizeGame(TerminalGameResult result) {
        if (!insertMarker(result)) return Outcome.ALREADY_FINALIZED;
        int updated = 0;
        for (TerminalGameResult.TerminalPlayerResult terminalPlayer : result.players()) {
            Player player = players.findById(terminalPlayer.playerId())
                    .orElseThrow(() -> new DataIntegrityViolationException(
                            "Finalization player is missing: " + terminalPlayer.playerId()));
            Stats row = stats.findForUpdateByPlayer(player)
                    .orElseThrow(() -> new DataIntegrityViolationException(
                            "Finalization Stats row is missing: " + terminalPlayer.playerId()));
            row.setTotalGames(Math.addExact(row.getTotalGames(), 1));
            if (terminalPlayer.winner()) row.setTotalWins(Math.addExact(row.getTotalWins(), 1));
            else row.setTotalLosses(Math.addExact(row.getTotalLosses(), 1));
            row.setTotalMoney(Math.addExact(row.getTotalMoney(), terminalPlayer.money()));
            row.setTotalTimePlayed(Math.addExact(row.getTotalTimePlayed(), result.durationSeconds()));
            stats.save(row);
            failureProbe.afterPlayerUpdate(++updated);
        }
        return Outcome.APPLIED;
    }

    private boolean insertMarker(TerminalGameResult result) {
        try {
            jdbc.update("""
                    INSERT INTO game_finalization
                      (finalization_id, game_id, game_created_at_epoch_ms, winner_player_id, completed_at_epoch_ms)
                    VALUES (?, ?, ?, ?, ?)
                    """, result.finalizationId(), result.gameId(), result.gameCreatedAtEpochMs(),
                    result.winnerPlayerId(), result.completedAtEpochMs());
            return true;
        } catch (DuplicateKeyException duplicate) {
            List<Map<String, Object>> stored = jdbc.queryForList("""
                    SELECT finalization_id, game_id, game_created_at_epoch_ms, winner_player_id, completed_at_epoch_ms
                    FROM game_finalization
                    WHERE finalization_id = ? OR (game_id = ? AND game_created_at_epoch_ms = ?)
                    """, result.finalizationId(), result.gameId(), result.gameCreatedAtEpochMs());
            boolean exact = stored.size() == 1
                    && result.finalizationId().equals(stored.get(0).get("finalization_id"))
                    && number(stored.get(0), "game_id") == result.gameId()
                    && number(stored.get(0), "game_created_at_epoch_ms") == result.gameCreatedAtEpochMs()
                    && number(stored.get(0), "winner_player_id") == result.winnerPlayerId()
                    && number(stored.get(0), "completed_at_epoch_ms") == result.completedAtEpochMs();
            if (!exact) {
                throw new DataIntegrityViolationException("Finalization identity conflicts with durable history", duplicate);
            }
            return false;
        }
    }

    private long number(Map<String, Object> row, String key) {
        return ((Number) row.get(key)).longValue();
    }
}
