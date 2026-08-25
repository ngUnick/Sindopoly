package com.example.Sindopoly_Java.service.core;

import com.example.Sindopoly_Java.model.Card;
import com.example.Sindopoly_Java.model.Square;
import com.example.Sindopoly_Java.model.dto.SquareEventDto;
import com.example.Sindopoly_Java.repository.SquareRepository;
import com.example.Sindopoly_Java.service.GameStateService;
import com.example.Sindopoly_Java.utils.ValidationUtils;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
// The shared in-memory Redis adapter supports distinct rule paths per test.
@MockitoSettings(strictness = Strictness.LENIENT)
class SquareActionServiceRuleTest {

    @Mock private SquareRepository squareRepository;
    @Mock private CardService cardService;
    @Mock private GameStateService gameStateService;
    @Mock private RedisTemplate<String, String> redis;
    @Mock private HashOperations<String, String, String> hashOperations;

    private final Map<String, Map<String, String>> redisState = new HashMap<>();
    private SquareActionService service;

    @BeforeEach
    void setUp() {
        doAnswer(invocation -> hashOperations).when(redis).opsForHash();
        when(hashOperations.get(anyString(), anyString())).thenAnswer(invocation ->
            redisState.getOrDefault(invocation.getArgument(0), Map.of()).get(invocation.getArgument(1)));
        doAnswer(invocation -> {
            redisState.computeIfAbsent(invocation.getArgument(0), ignored -> new HashMap<>())
                .put(invocation.getArgument(1), invocation.getArgument(2));
            return null;
        }).when(hashOperations).put(anyString(), anyString(), anyString());
        doAnswer(invocation -> {
                redisState.computeIfAbsent(invocation.getArgument(0), ignored -> new HashMap<>())
                    .putAll(invocation.getArgument(1));
                return null;
            }).when(hashOperations).putAll(anyString(), org.mockito.ArgumentMatchers.<Map<String, String>>any());

        service = new SquareActionService(
            squareRepository, redis, cardService, new ValidationUtils(null), new ObjectMapper());
        ReflectionTestUtils.setField(service, "gameStateService", gameStateService);
    }

    @Test
    void taxSquareNormalizesStaticNegativeSeedToPositiveCost() {
        Square tax = square(Square.SquareType.TAX, 200, null);
        when(squareRepository.findById(4)).thenReturn(Optional.of(tax));

        SquareEventDto event = service.peekSquare(1, 4, 7);

        assertEquals("tax", event.getType());
        assertEquals(200, event.getAmount());
    }

    @Test
    void taxApplicationSubtractsPositiveCost() {
        money(1, 1000);

        service.applyAutomatic(SquareEventDto.justInfo("tax", "Pay tax", 200), 1, 7);

        assertEquals("800", field("player:1", "money"));
    }

    @Test
    void rentApplicationTransfersPositiveAmountFromPayerToOwner() {
        money(1, 1000);
        money(2, 500);

        service.applyAutomatic(SquareEventDto.rentDue("2", 200), 1, 7);

        assertEquals("800", field("player:1", "money"));
        assertEquals("700", field("player:2", "money"));
    }

    @Test
    void unownedAffordablePropertyProducesBuyOffer() {
        Square property = square(Square.SquareType.BROWN, 120, 10);
        when(squareRepository.findById(1)).thenReturn(Optional.of(property));
        when(gameStateService.getPlayersInGame(7)).thenReturn(Set.of());
        money(1, 150);

        SquareEventDto event = service.peekSquare(1, 1, 7);

        assertEquals("buyOffer", event.getType());
        assertEquals(120, event.getPrice());
    }

    @Test
    void cardSquareRetainsStaticCardEffectAmount() {
        Square cardSquare = square(Square.SquareType.CARD, null, null);
        Card card = org.mockito.Mockito.mock(Card.class);
        when(card.getTitle()).thenReturn("Scholarship");
        when(card.getType()).thenReturn(Card.CardType.money);
        when(card.getAmount()).thenReturn(250f);
        when(squareRepository.findById(2)).thenReturn(Optional.of(cardSquare));
        when(cardService.drawCard(7)).thenReturn(card);

        SquareEventDto event = service.peekSquare(1, 2, 7);

        assertEquals("card", event.getType());
        assertEquals("money", event.getCardType());
        assertEquals(250, event.getAmount());
    }

    @Test
    void jailIsVisitingAndGoToJailIsAnImmediateOutcome() {
        Square jail = square(Square.SquareType.JAIL, null, null);
        when(squareRepository.findById(10)).thenReturn(Optional.of(jail));
        assertEquals("jail", service.peekSquare(1, 10, 7).getType());

        Square goToJail = square(Square.SquareType.GOJAIL, null, null);
        when(squareRepository.findById(30)).thenReturn(Optional.of(goToJail));
        assertEquals("goToJail", service.peekSquare(1, 30, 7).getType());
    }

    @Test
    void optionalJailPaymentDeductsFeeAndReleasesPlayer() {
        money(1, 100);
        redisState.get("player:1").put("position", "10");
        redisState.get("player:1").put("jail", "true");
        redisState.get("player:1").put("jailTime", "3");

        service.completeOptionalJail(7, 1, 50);

        assertEquals("50", field("player:1", "money"));
        assertEquals("10", field("player:1", "position"));
        assertEquals("false", field("player:1", "jail"));
        assertEquals("0", field("player:1", "jailTime"));
    }

    private Square square(Square.SquareType type, Integer price, Integer rent) {
        Square square = org.mockito.Mockito.mock(Square.class);
        when(square.getId()).thenReturn(1);
        when(square.getType()).thenReturn(type);
        when(square.getPrice()).thenReturn(price);
        when(square.getRent()).thenReturn(rent);
        return square;
    }

    private void money(int playerId, int amount) {
        redisState.computeIfAbsent("player:" + playerId, ignored -> new HashMap<>())
            .put("money", String.valueOf(amount));
    }

    private String field(String key, String name) {
        return redisState.getOrDefault(key, Map.of()).get(name);
    }
}
