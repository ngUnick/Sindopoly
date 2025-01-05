package com.example.Sindopoly_Java.repository;

import com.example.Sindopoly_Java.model.Game;
import com.example.Sindopoly_Java.model.Player;
import com.example.Sindopoly_Java.model.PlayerGame;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface PlayerGameRepository extends JpaRepository<PlayerGame, Integer> {

    @Query("SELECT pg FROM PlayerGame pg WHERE pg.game.id = :gameId")
    List<PlayerGame> findByGameId(Integer gameId);

    @Query("SELECT pg FROM PlayerGame pg WHERE pg.playerId = :playerId")
    PlayerGame findByPlayerId(Integer playerId);

    @Query("SELECT COUNT(pg) FROM PlayerGame pg WHERE pg.game.id = :gameId")
    long countPlayersInGame(Integer gameId);

    @Query("SELECT pg FROM PlayerGame pg WHERE pg.game.id = :gameId ORDER BY pg.playerId ASC")
    List<PlayerGame> findPlayersOrderedByIdInGame(Integer gameId);

    @Query("SELECT pg FROM PlayerGame pg WHERE pg.game.id = :gameId ORDER BY pg.money DESC")
    List<PlayerGame> findPlayersByWealthDesc(Integer gameId);

    @Query("SELECT pg FROM PlayerGame pg WHERE pg.game.id = :gameId ORDER BY pg.money ASC")
    List<PlayerGame> findPlayersByWealthAsc(Integer gameId);

    // For checking if player can afford property: done in service
}
