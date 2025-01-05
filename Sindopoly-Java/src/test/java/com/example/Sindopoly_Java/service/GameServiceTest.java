package com.example.Sindopoly_Java.service;

import com.example.Sindopoly_Java.model.*;
import com.example.Sindopoly_Java.repository.*;
import com.example.Sindopoly_Java.SindopolyJavaApplication;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;

@SpringBootTest(classes = SindopolyJavaApplication.class)
class GameServiceTest {

    @Autowired
    private GameService gameService;

    @Test
    void contextLoads() {
        // Test that the context loads successfully
        assertNotNull(gameService);
    }

    @MockBean
    private GameRepository gameRepository;

    @MockBean
    private PlayerRepository playerRepository;

    @MockBean
    private PlayerGameRepository playerGameRepository;

    @MockBean
    private SquareRepository squareRepository;

    @MockBean
    private PropertyRepository propertyRepository;

    @MockBean
    private PlayerPropertyRepository playerPropertyRepository;

    private Player testPlayer;

    @BeforeEach
    void setup() {
        // Set up a test player
        testPlayer = new Player();
        testPlayer.setId(1);
        testPlayer.setName("Test Player");
        testPlayer.setEmail("test@example.com");

        // Mock player repository to return the test player
        Mockito.when(playerRepository.findById(1)).thenReturn(Optional.of(testPlayer));
    }

    @Test
    void createGame_shouldReturnGameId() {
        // Arrange
        Game savedGame = new Game();
        savedGame.setId(100);
        savedGame.setGameStatus(GameStatus.lobby);

        Mockito.when(gameRepository.save(any(Game.class))).thenReturn(savedGame);
        Mockito.when(gameRepository.findById(100)).thenReturn(Optional.of(savedGame));
        Mockito.when(squareRepository.findByGameAndPosition(savedGame, 0)).thenReturn(new Square());

        // Act
        Integer gameId = gameService.createGame(1, 30, 500);

        // Assert
        assertEquals(100, gameId);
        Mockito.verify(gameRepository, Mockito.times(1)).save(any(Game.class));
        Mockito.verify(playerGameRepository, Mockito.times(1)).save(any(PlayerGame.class));
    }


    @Test
    void createGame_shouldThrowExceptionIfPlayerNotFound() {
        // Arrange
        Mockito.when(playerRepository.findById(99)).thenReturn(Optional.empty());

        // Act & Assert
        assertThrows(RuntimeException.class, () -> gameService.createGame(99, 30, 500));
    }

    @Test
    void createGame_shouldThrowExceptionIfMaxTimeExceedsLimit() {
        // Act & Assert
        assertThrows(IllegalArgumentException.class, () -> gameService.createGame(1, 61, 500));
    }


    @Test
    void joinGame_shouldAddPlayerToGame() {
        // Arrange
        Game game = new Game();
        game.setId(100);
        game.setGameStatus(GameStatus.lobby);
        Mockito.when(gameRepository.findById(100)).thenReturn(Optional.of(game));
        Mockito.when(squareRepository.findByGameAndPosition(game, 0)).thenReturn(new Square());

        // Act
        gameService.joinGame(100, 1);

        // Assert
        Mockito.verify(playerGameRepository, Mockito.times(1)).save(any(PlayerGame.class));
    }

    @Test
    void joinGame_shouldThrowExceptionIfGameNotInLobby() {
        // Arrange
        Game game = new Game();
        game.setId(100);
        game.setGameStatus(GameStatus.inProgress);
        Mockito.when(gameRepository.findById(100)).thenReturn(Optional.of(game));

        // Act & Assert
        assertThrows(RuntimeException.class, () -> gameService.joinGame(100, 1));
    }

    @Test
    void startGame_shouldChangeGameStatusToInProgress() {
        // Arrange
        Game game = new Game();
        game.setId(100);
        game.setGameStatus(GameStatus.lobby);
        game.setCreator(testPlayer);
        Mockito.when(gameRepository.findById(100)).thenReturn(Optional.of(game));
        Mockito.when(playerGameRepository.countPlayersInGame(100)).thenReturn(2L);

        // Act
        gameService.startGame(100);

        // Assert
        assertEquals(GameStatus.inProgress, game.getGameStatus());
        Mockito.verify(gameRepository, Mockito.times(1)).save(game);
    }

    @Test
    void startGame_shouldThrowExceptionIfLessThanTwoPlayers() {
        // Arrange
        Game game = new Game();
        game.setId(100);
        game.setGameStatus(GameStatus.lobby);
        Mockito.when(gameRepository.findById(100)).thenReturn(Optional.of(game));
        Mockito.when(playerGameRepository.countPlayersInGame(100)).thenReturn(1L);

        // Act & Assert
        assertThrows(RuntimeException.class, () -> gameService.startGame(100));
    }
}
