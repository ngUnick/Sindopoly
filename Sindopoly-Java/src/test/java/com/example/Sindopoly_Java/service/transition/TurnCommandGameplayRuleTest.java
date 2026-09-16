package com.example.Sindopoly_Java.service.transition;

import com.example.Sindopoly_Java.exception.GameStateConflictException;
import com.example.Sindopoly_Java.model.Card;
import com.example.Sindopoly_Java.model.Square;
import com.example.Sindopoly_Java.model.dto.ActionResultDto;
import com.example.Sindopoly_Java.model.dto.ThrowResultDto;
import com.example.Sindopoly_Java.repository.CardRepository;
import com.example.Sindopoly_Java.repository.SquareRepository;
import com.example.Sindopoly_Java.service.core.DiceService;
import com.example.Sindopoly_Java.realtime.GameEventPublisher;
import com.example.Sindopoly_Java.realtime.GameEventDetailType;
import com.example.Sindopoly_Java.realtime.GameEventPayload;
import com.example.Sindopoly_Java.realtime.GameEventType;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.security.access.AccessDeniedException;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class TurnCommandGameplayRuleTest {
    private static final Instant NOW = Instant.parse("2026-09-17T10:00:00Z");
    private static final String RENEWED_DEADLINE = String.valueOf(NOW.plusSeconds(60).toEpochMilli());

    @Mock RedisGameTransitionStore store;
    @Mock DiceService dice;
    @Mock SquareRepository squares;
    @Mock CardRepository cards;
    @Mock GameEventPublisher events;

    private final ObjectMapper mapper = new ObjectMapper();
    private TurnCommandService service;

    @BeforeEach
    void setUp() {
        service = new TurnCommandService(store, dice, squares, cards, mapper, events,
                new GameTimingService(Clock.fixed(NOW, ZoneOffset.UTC), new GameLifecycleProperties()));
        when(store.replayIfPresent(anyInt(), any(), anyString())).thenReturn(Optional.empty());
        when(store.commit(anyInt(), any(), anyString(), any(), any(JsonNode.class))).thenAnswer(invocation -> {
            CommandMetadata metadata = invocation.getArgument(1);
            return new TransitionExecution(TransitionExecution.Status.APPLIED,
                    metadata.expectedStateVersion() + 1, invocation.getArgument(4));
        });
    }

    @Test
    void positiveTaxIsDeductedAutomaticallyAndTurnRotates() {
        when(store.load(41)).thenReturn(snapshot(0, player(2, 1500, "[]"), player(0, 1500, "[]"), List.of()));
        when(dice.roll()).thenReturn(2);
        stubSquare(4, Square.SquareType.TAX, -200, null);

        ThrowResultDto result = service.throwDice(41, 41, metadata(0));
        GameTransitionPlan plan = committedPlan();

        assertThat(result.data()).isEqualTo(200);
        assertThat(plan.playerPuts().get(41).get("money")).isEqualTo("1300");
        assertThat(plan.gamePuts()).containsEntry("playerTurn", "7")
                .containsEntry("turnDeadlineEpochMs", RENEWED_DEADLINE)
                .doesNotContainKey("optionalAction");
    }

    @Test
    void rentIsOnePositiveAtomicTransfer() {
        when(store.load(41)).thenReturn(snapshot(0, player(0, 1500, "[]"), player(0, 1500, "[1]"), List.of()));
        when(dice.roll()).thenReturn(1);
        stubSquare(1, Square.SquareType.BROWN, 60, 100);
        when(squares.findIdsByColour(Square.SquareType.BROWN)).thenReturn(List.of(1, 3));

        ThrowResultDto result = service.throwDice(41, 41, metadata(0));
        GameTransitionPlan plan = committedPlan();

        assertThat(result.data()).isEqualTo(100);
        assertThat(plan.playerPuts().get(41).get("money")).isEqualTo("1400");
        assertThat(plan.playerPuts().get(7).get("money")).isEqualTo("1600");
        assertThat(plan.gamePuts()).containsEntry("playerTurn", "7").doesNotContainKey("optionalAction");
        ArgumentCaptor<GameEventPayload> event = ArgumentCaptor.forClass(GameEventPayload.class);
        verify(events).publish(eq(41), eq(1L), eq(GameEventType.TURN_UPDATED), event.capture());
        assertThat(event.getValue().details()).extracting(detail -> detail.type())
                .containsExactly(GameEventDetailType.DICE_ROLLED, GameEventDetailType.PLAYER_MOVED,
                        GameEventDetailType.LANDED_ON_TILE, GameEventDetailType.RENT_PAID,
                        GameEventDetailType.TURN_CHANGED);
        assertThat(event.getValue().details().get(3).counterpartyPlayerId()).isEqualTo(7);
    }

    @Test
    void selfOwnedPropertyDoesNotTransferRent() {
        when(store.load(41)).thenReturn(snapshot(0, player(0, 1500, "[1]"), player(0, 1500, "[]"), List.of()));
        when(dice.roll()).thenReturn(1);
        stubSquare(1, Square.SquareType.BROWN, 60, 100);

        service.throwDice(41, 41, metadata(0));
        GameTransitionPlan plan = committedPlan();

        assertThat(plan.playerPuts().get(41).get("money")).isEqualTo("1500");
        assertThat(plan.playerPuts()).doesNotContainKey(7);
    }

    @Test
    void affordableUnownedPropertyCreatesOnlyCanonicalPendingChoice() throws Exception {
        when(store.load(41)).thenReturn(snapshot(0, player(0, 1500, "[]"), player(0, 1500, "[]"), List.of()));
        when(dice.roll()).thenReturn(1);
        stubSquare(1, Square.SquareType.BROWN, 60, 2);

        ThrowResultDto result = service.throwDice(41, 41, metadata(0));
        GameTransitionPlan plan = committedPlan();
        PendingOptionalAction pending = mapper.readValue(plan.gamePuts().get("optionalAction"), PendingOptionalAction.class);

        assertThat(result.squareType()).isEqualTo(5);
        assertThat(pending.type()).isEqualTo(PendingOptionalAction.Type.PURCHASE_PROPERTY);
        assertThat(pending.playerId()).isEqualTo(41);
        assertThat(pending.stateVersion()).isEqualTo(1);
        assertThat(pending.cost()).isEqualTo(60);
        assertThat(plan.gamePuts()).containsEntry("turnDeadlineEpochMs", RENEWED_DEADLINE)
                .doesNotContainKey("playerTurn");
        ArgumentCaptor<GameEventPayload> event = ArgumentCaptor.forClass(GameEventPayload.class);
        verify(events).publish(eq(41), eq(1L), eq(GameEventType.TURN_UPDATED), event.capture());
        assertThat(event.getValue().details()).extracting(detail -> detail.type())
                .containsExactly(GameEventDetailType.DICE_ROLLED, GameEventDetailType.PLAYER_MOVED,
                        GameEventDetailType.LANDED_ON_TILE, GameEventDetailType.PROPERTY_AVAILABLE);
    }

    @Test
    void unaffordablePropertyDoesNotCreateInvalidChoice() {
        when(store.load(41)).thenReturn(snapshot(0, player(0, 50, "[]"), player(0, 1500, "[]"), List.of()));
        when(dice.roll()).thenReturn(1);
        stubSquare(1, Square.SquareType.BROWN, 60, 2);

        service.throwDice(41, 41, metadata(0));

        assertThat(committedPlan().gamePuts()).containsEntry("playerTurn", "7").doesNotContainKey("optionalAction");
    }

    @Test
    void startRewardCoversPassAndExactLandingButNotOrdinaryMove() {
        assertMoveMoney(35, 4, 39, 1500, false);
        org.mockito.Mockito.reset(store, dice, squares, cards, events);
        setUp();
        assertMoveMoney(39, 2, 1, 1700, true);
        org.mockito.Mockito.reset(store, dice, squares, cards, events);
        setUp();
        assertMoveMoney(38, 2, 0, 1700, true);
    }

    @Test
    void cardMoneyAndCyclingAreAppliedOnceInTheRollPlan() {
        Card card = card(5, Card.CardType.money, -50);
        when(store.load(41)).thenReturn(snapshot(0, player(0, 1500, "[]"), player(0, 1500, "[]"), List.of("5", "6")));
        when(dice.roll()).thenReturn(2);
        stubSquare(2, Square.SquareType.CARD, null, null);
        when(cards.findById(5)).thenReturn(Optional.of(card));

        ThrowResultDto result = service.throwDice(41, 41, metadata(0));
        GameTransitionPlan plan = committedPlan();

        assertThat(result.data()).isEqualTo(-50);
        assertThat(result.card().title()).isEqualTo("Community Chest");
        assertThat(result.card().text()).isEqualTo("Έληξε η κάρτα του ΟΑΣΘ. Πλήρωσε €50.");
        assertThat(plan.playerPuts().get(41).get("money")).isEqualTo("1450");
        assertThat(plan.deckReplacement()).containsExactly("6", "5");
        ArgumentCaptor<GameEventPayload> event = ArgumentCaptor.forClass(GameEventPayload.class);
        verify(events).publish(eq(41), eq(1L), eq(GameEventType.TURN_UPDATED), event.capture());
        assertThat(event.getValue().actorPlayerId()).isEqualTo(41);
        assertThat(event.getValue().details()).extracting(detail -> detail.type())
                .containsExactly(GameEventDetailType.DICE_ROLLED, GameEventDetailType.PLAYER_MOVED,
                        GameEventDetailType.LANDED_ON_TILE, GameEventDetailType.CARD_DRAWN,
                        GameEventDetailType.TURN_CHANGED);
        assertThat(event.getValue().details().stream()
                .filter(detail -> detail.type() == GameEventDetailType.CARD_DRAWN)
                .findFirst().orElseThrow().card().text())
                .isEqualTo("Έληξε η κάρτα του ΟΑΣΘ. Πλήρωσε €50.");
    }

    @Test
    void positiveMoneyCardCreditsThePlayer() {
        Card card = card(5, Card.CardType.money, 75);
        when(store.load(41)).thenReturn(snapshot(0, player(0, 1500, "[]"), player(0, 1500, "[]"), List.of("5")));
        when(dice.roll()).thenReturn(2);
        stubSquare(2, Square.SquareType.CARD, null, null);
        when(cards.findById(5)).thenReturn(Optional.of(card));

        ThrowResultDto result = service.throwDice(41, 41, metadata(0));

        assertThat(result.data()).isEqualTo(75);
        assertThat(committedPlan().playerPuts().get(41).get("money")).isEqualTo("1575");
    }

    @Test
    void transportCardCrossingStartMovesAuthoritativelyAndAwardsReward() {
        Card card = card(5, Card.CardType.transport, 5);
        when(store.load(41)).thenReturn(snapshot(0, player(35, 1500, "[]"), player(0, 1500, "[]"), List.of("5")));
        when(dice.roll()).thenReturn(1);
        stubSquare(36, Square.SquareType.CARD, null, null);
        when(cards.findById(5)).thenReturn(Optional.of(card));

        ThrowResultDto result = service.throwDice(41, 41, metadata(0));

        assertThat(result.newPosition()).isEqualTo(5);
        assertThat(result.passedGo()).isTrue();
        assertThat(result.card().title()).isEqualTo("Chance");
        assertThat(result.card().text()).isEqualTo("Πήγαινε στο ΚΙΟΣΚΙ Σ.Ε.Υ.Π.");
        assertThat(committedPlan().playerPuts().get(41).get("money")).isEqualTo("1700");
    }

    @Test
    void goToJailIsAutomaticWhileNormalJailIsVisiting() {
        when(store.load(41)).thenReturn(snapshot(0, player(28, 1500, "[]"), player(0, 1500, "[]"), List.of()));
        when(dice.roll()).thenReturn(2);
        stubSquare(30, Square.SquareType.GOJAIL, null, null);

        service.throwDice(41, 41, metadata(0));
        Map<String, String> jailed = committedPlan().playerPuts().get(41);
        assertThat(jailed).containsEntry("position", "10").containsEntry("jail", "true").containsEntry("jailTime", "3");

        org.mockito.Mockito.reset(store, dice, squares, cards, events);
        setUp();
        when(store.load(41)).thenReturn(snapshot(0, player(8, 1500, "[]"), player(0, 1500, "[]"), List.of()));
        when(dice.roll()).thenReturn(2);
        stubSquare(10, Square.SquareType.JAIL, null, null);
        service.throwDice(41, 41, metadata(0));
        assertThat(committedPlan().playerPuts().get(41)).containsEntry("jail", "false").containsEntry("position", "10");
    }

    @Test
    void jailedPlayerGetsPaymentChoiceAndPayingKeepsTheSameTurn() throws Exception {
        Map<String, String> jailed = player(10, 1500, "[]", true, 3);
        when(store.load(41)).thenReturn(snapshot(0, jailed, player(0, 1500, "[]"), List.of()));

        ThrowResultDto offered = service.throwDice(41, 41, metadata(0));
        GameTransitionPlan offeredPlan = committedPlan();
        String option = offeredPlan.gamePuts().get("optionalAction");

        assertThat(offered.squareType()).isEqualTo(10);
        assertThat(offeredPlan.gamePuts()).containsEntry("turnDeadlineEpochMs", RENEWED_DEADLINE);
        verify(dice, never()).roll();

        org.mockito.Mockito.reset(store, dice, squares, cards, events);
        setUp();
        when(store.load(41)).thenReturn(snapshot(1, Map.of("optionalAction", option), jailed,
                player(0, 1500, "[]"), List.of()));
        ActionResultDto result = service.action(41, 41, true, metadata(1));
        GameTransitionPlan paid = committedPlan();

        assertThat(result.nextPlayerId()).isEqualTo(41);
        assertThat(paid.gamePuts()).containsEntry("turnDeadlineEpochMs", RENEWED_DEADLINE);
        assertThat(paid.playerPuts().get(41)).containsEntry("money", "1450")
                .containsEntry("jail", "false").containsEntry("jailTime", "0");
    }

    @Test
    void thirdJailPassReleasesForNextTurnWithoutCharging() throws Exception {
        String option = mapper.writeValueAsString(PendingOptionalAction.jailPayment(41, 41, 2));
        Map<String, String> jailed = player(10, 1500, "[]", true, 1);
        when(store.load(41)).thenReturn(snapshot(2, Map.of("optionalAction", option), jailed,
                player(0, 1500, "[]"), List.of()));

        ActionResultDto result = service.pass(41, 41, metadata(2));
        Map<String, String> released = committedPlan().playerPuts().get(41);

        assertThat(result.nextPlayerId()).isEqualTo(7);
        assertThat(released).containsEntry("money", "1500").containsEntry("jail", "false")
                .containsEntry("jailTime", "0");
    }

    @Test
    void earlierJailPassKeepsPlayerJailedAndDecrementsExactlyOnce() throws Exception {
        String option = mapper.writeValueAsString(PendingOptionalAction.jailPayment(41, 41, 2));
        Map<String, String> jailed = player(10, 1500, "[]", true, 3);
        when(store.load(41)).thenReturn(snapshot(2, Map.of("optionalAction", option), jailed,
                player(0, 1500, "[]"), List.of()));

        ActionResultDto result = service.pass(41, 41, metadata(2));

        assertThat(result.nextPlayerId()).isEqualTo(7);
        assertThat(committedPlan().playerPuts().get(41))
                .containsEntry("money", "1500").containsEntry("jail", "true").containsEntry("jailTime", "2");
    }

    @Test
    void completingTurnMaterializesNextJailedPlayersChoiceAtCommittedVersion() throws Exception {
        Map<String, String> nextJailed = player(10, 1500, "[]", true, 2);
        when(store.load(41)).thenReturn(snapshot(4, player(0, 1500, "[]"), nextJailed, List.of()));
        when(dice.roll()).thenReturn(1);
        stubSquare(1, Square.SquareType.BROWN, 2000, 2);

        service.throwDice(41, 41, metadata(4));

        GameTransitionPlan plan = committedPlan();
        assertThat(plan.gamePuts()).containsEntry("playerTurn", "7")
                .containsEntry("turnDeadlineEpochMs", RENEWED_DEADLINE);
        PendingOptionalAction pending = mapper.readValue(
                plan.gamePuts().get("optionalAction"), PendingOptionalAction.class);
        assertThat(pending.type()).isEqualTo(PendingOptionalAction.Type.PAY_JAIL_EXIT);
        assertThat(pending.playerId()).isEqualTo(7);
        assertThat(pending.stateVersion()).isEqualTo(5);
    }

    @Test
    void staleJailPaymentAndInsufficientFundsFailWithoutMutation() throws Exception {
        String stale = mapper.writeValueAsString(PendingOptionalAction.jailPayment(41, 41, 1));
        Map<String, String> poorJailed = player(10, 40, "[]", true, 2);
        when(store.load(41)).thenReturn(snapshot(2, Map.of("optionalAction", stale), poorJailed,
                player(0, 1500, "[]"), List.of()));

        assertThatThrownBy(() -> service.action(41, 41, true, metadata(2)))
                .isInstanceOf(GameStateConflictException.class);
        verify(store, never()).commit(anyInt(), any(), anyString(), any(), any(JsonNode.class));

        org.mockito.Mockito.reset(store, dice, squares, cards, events);
        setUp();
        String current = mapper.writeValueAsString(PendingOptionalAction.jailPayment(41, 41, 2));
        when(store.load(41)).thenReturn(snapshot(2, Map.of("optionalAction", current), poorJailed,
                player(0, 1500, "[]"), List.of()));

        assertThatThrownBy(() -> service.action(41, 41, true, metadata(2)))
                .isInstanceOf(GameStateConflictException.class).hasMessageContaining("Insufficient funds");
        verify(store, never()).commit(anyInt(), any(), anyString(), any(), any(JsonNode.class));
    }

    @Test
    void purchaseCommitsPriceOwnershipClearAndOneRotation() throws Exception {
        String option = mapper.writeValueAsString(PendingOptionalAction.purchase(41, 41, 3, 1, 60));
        when(store.load(41)).thenReturn(snapshot(3, Map.of("optionalAction", option),
                player(1, 1500, "[]"), player(0, 1500, "[]"), List.of()));
        stubSquare(1, Square.SquareType.BROWN, 60, 2);

        ActionResultDto result = service.action(41, 41, true, metadata(3));
        GameTransitionPlan plan = committedPlan();

        assertThat(result.newBalance()).isEqualTo(1440);
        assertThat(result.acquiredProperties()).containsExactly(1);
        assertThat(plan.playerPuts().get(41).get("properties")).isEqualTo("[1]");
        assertThat(plan.gameDeletes()).contains("optionalAction");
        assertThat(plan.gamePuts()).containsEntry("playerTurn", "7");
        ArgumentCaptor<GameEventPayload> event = ArgumentCaptor.forClass(GameEventPayload.class);
        verify(events).publish(eq(41), eq(4L), eq(GameEventType.TURN_UPDATED), event.capture());
        assertThat(event.getValue().details()).extracting(detail -> detail.type())
                .containsExactly(GameEventDetailType.PROPERTY_PURCHASED, GameEventDetailType.TURN_CHANGED);
    }

    @Test
    void purchasePassClearsChoiceWithoutOwnershipAndRotates() throws Exception {
        String option = mapper.writeValueAsString(PendingOptionalAction.purchase(41, 41, 3, 1, 60));
        when(store.load(41)).thenReturn(snapshot(3, Map.of("optionalAction", option),
                player(1, 1500, "[]"), player(0, 1500, "[]"), List.of()));

        ActionResultDto result = service.pass(41, 41, metadata(3));
        GameTransitionPlan plan = committedPlan();

        assertThat(result.newBalance()).isEqualTo(1500);
        assertThat(result.nextPlayerId()).isEqualTo(7);
        assertThat(plan.playerPuts()).isEmpty();
        assertThat(plan.gameDeletes()).contains("optionalAction");
        assertThat(plan.gamePuts()).containsEntry("playerTurn", "7");
    }

    @Test
    void wrongPlayerCannotResolvePendingChoice() throws Exception {
        String option = mapper.writeValueAsString(PendingOptionalAction.purchase(41, 41, 3, 1, 60));
        GameSnapshot snapshot = snapshot(3, Map.of("optionalAction", option),
                player(1, 1500, "[]"), player(0, 1500, "[]"), List.of());
        when(store.load(41)).thenReturn(snapshot);

        assertThatThrownBy(() -> service.action(41, 7, true, metadata(3)))
                .isInstanceOf(AccessDeniedException.class);
        verify(store, never()).commit(anyInt(), any(), anyString(), any(), any(JsonNode.class));
    }

    @Test
    void legacyInProgressGameWithoutOrderFailsBeforeDiceOrMutation() {
        GameSnapshot legacy = new GameSnapshot(41,
                Map.of("status", "inProgress", "playerTurn", "41", "stateVersion", "0"),
                Set.of("41", "7"), Map.of(41, player(0, 1500, "[]"), 7, player(0, 1500, "[]")), List.of());
        when(store.load(41)).thenReturn(legacy);

        assertThatThrownBy(() -> service.throwDice(41, 41, metadata(0)))
                .isInstanceOf(com.example.Sindopoly_Java.exception.GameStateConflictException.class)
                .hasMessageContaining("TURN_ORDER_UNAVAILABLE");
        verify(dice, never()).roll();
        verify(store, never()).commit(anyInt(), any(), anyString(), any(), any(JsonNode.class));
    }

    @Test
    void totalEightHasNoDoublesSpecificFlowAndRotatesNormally() {
        when(store.load(41)).thenReturn(snapshot(0, player(0, 1500, "[8]"), player(0, 1500, "[]"), List.of()));
        when(dice.roll()).thenReturn(8);
        stubSquare(8, Square.SquareType.CYAN, 100, 6);

        service.throwDice(41, 41, metadata(0));

        assertThat(committedPlan().gamePuts()).containsEntry("playerTurn", "7").doesNotContainKey("optionalAction");
    }

    private void assertMoveMoney(int from, int roll, int destination, int expectedMoney, boolean passedStart) {
        String properties = destination == 0 ? "[]" : "[" + destination + "]";
        when(store.load(41)).thenReturn(snapshot(0, player(from, 1500, properties), player(0, 1500, "[]"), List.of()));
        when(dice.roll()).thenReturn(roll);
        Square.SquareType type = destination == 0 ? Square.SquareType.START : Square.SquareType.BLUE;
        stubSquare(destination, type, 400, 50);

        ThrowResultDto result = service.throwDice(41, 41, metadata(0));

        assertThat(result.newPosition()).isEqualTo(destination);
        assertThat(result.passedGo()).isEqualTo(passedStart);
        assertThat(committedPlan().playerPuts().get(41).get("money")).isEqualTo(String.valueOf(expectedMoney));
    }

    private GameTransitionPlan committedPlan() {
        ArgumentCaptor<GameTransitionPlan> captor = ArgumentCaptor.forClass(GameTransitionPlan.class);
        verify(store).commit(anyInt(), any(), anyString(), captor.capture(), any(JsonNode.class));
        return captor.getValue();
    }

    private GameSnapshot snapshot(long version, Map<String, String> actor, Map<String, String> other, List<String> deck) {
        return snapshot(version, Map.of(), actor, other, deck);
    }

    private GameSnapshot snapshot(long version, Map<String, String> extraGame,
                                  Map<String, String> actor, Map<String, String> other, List<String> deck) {
        Map<String, String> game = new java.util.LinkedHashMap<>(Map.of(
                "status", "inProgress", "playerTurn", "41", "stateVersion", String.valueOf(version),
                "turnOrder", "[41,7]"));
        game.putAll(extraGame);
        return new GameSnapshot(41, Map.copyOf(game), Set.of("41", "7"),
                Map.of(41, actor, 7, other), deck);
    }

    private Map<String, String> player(int position, int money, String properties) {
        return player(position, money, properties, false, 0);
    }

    private Map<String, String> player(int position, int money, String properties, boolean jail, int jailTime) {
        return Map.of("position", String.valueOf(position), "money", String.valueOf(money),
                "jail", String.valueOf(jail), "jailTime", String.valueOf(jailTime),
                "bankrupt", "false", "properties", properties, "afk", "false");
    }

    private Square square(int id, Square.SquareType type, Integer price, Integer rent) {
        Square square = mock(Square.class);
        when(square.getId()).thenReturn(id);
        when(square.getType()).thenReturn(type);
        when(square.getPrice()).thenReturn(price);
        when(square.getRent()).thenReturn(rent);
        return square;
    }

    private void stubSquare(int id, Square.SquareType type, Integer price, Integer rent) {
        Square value = square(id, type, price, rent);
        when(squares.findById(id)).thenReturn(Optional.of(value));
    }

    private Card card(int id, Card.CardType type, float amount) {
        Card card = mock(Card.class);
        when(card.getId()).thenReturn(id);
        when(card.getType()).thenReturn(type);
        when(card.getAmount()).thenReturn(amount);
        if (type == Card.CardType.money) {
            when(card.getTitle()).thenReturn("Community Chest");
            when(card.getDescription()).thenReturn("Έληξε η κάρτα του ΟΑΣΘ. Πλήρωσε €50.");
        } else {
            when(card.getTitle()).thenReturn("Chance");
            when(card.getDescription()).thenReturn("Πήγαινε στο ΚΙΟΣΚΙ Σ.Ε.Υ.Π.");
        }
        return card;
    }

    private CommandMetadata metadata(long version) {
        return new CommandMetadata("00000000-0000-0000-0000-00000000000" + (version + 1), version);
    }
}
