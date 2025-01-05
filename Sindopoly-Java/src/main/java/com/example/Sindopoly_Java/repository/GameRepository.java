package com.example.Sindopoly_Java.repository;

import com.example.Sindopoly_Java.model.Game;
import com.example.Sindopoly_Java.model.GameStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface GameRepository extends JpaRepository<Game, Integer> {

    // Find games by their status
    List<Game> findByGameStatus(GameStatus status);

    // Find active games by creator (games not completed)
    @Query("SELECT g FROM Game g WHERE g.creator.id = :creatorId AND g.gameStatus <> 'completed'")
    List<Game> findActiveGamesByCreator(@Param("creatorId") Integer creatorId);

    // Find a game by ID and ensure it's not completed
    @Query("SELECT g FROM Game g WHERE g.id = :gameId AND g.gameStatus <> 'completed'")
    Optional<Game> findActiveGameById(@Param("gameId") Integer gameId);

    // Find games that are in the lobby state
    @Query("SELECT g FROM Game g WHERE g.gameStatus = 'lobby'")
    List<Game> findLobbyGames();

    // Find games created within a specific time range
    @Query("SELECT g FROM Game g WHERE g.startTime BETWEEN :startTime AND :endTime")
    List<Game> findGamesCreatedWithinTimeRange(
            @Param("startTime") LocalDateTime startTime, 
            @Param("endTime") LocalDateTime endTime
    );
}
