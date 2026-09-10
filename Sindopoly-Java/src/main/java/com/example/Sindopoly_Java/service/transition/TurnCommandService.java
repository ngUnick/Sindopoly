package com.example.Sindopoly_Java.service.transition;

import com.example.Sindopoly_Java.exception.GameNotFoundException;
import com.example.Sindopoly_Java.exception.GameStateConflictException;
import com.example.Sindopoly_Java.model.Card;
import com.example.Sindopoly_Java.model.Square;
import com.example.Sindopoly_Java.model.dto.ActionResultDto;
import com.example.Sindopoly_Java.model.dto.CardDrawDto;
import com.example.Sindopoly_Java.model.dto.ThrowResultDto;
import com.example.Sindopoly_Java.repository.CardRepository;
import com.example.Sindopoly_Java.repository.SquareRepository;
import com.example.Sindopoly_Java.service.core.DiceService;
import com.example.Sindopoly_Java.service.core.MovementService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.example.Sindopoly_Java.realtime.GameEventPublisher;
import com.example.Sindopoly_Java.realtime.GameEventDetail;
import com.example.Sindopoly_Java.realtime.GameEventPayload;
import com.example.Sindopoly_Java.realtime.GameEventReason;
import com.example.Sindopoly_Java.realtime.GameEventType;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/** Authoritative calculation and atomic commit path for player turn commands. */
@Service
public class TurnCommandService {

    private static final int START_REWARD = 200;
    private static final int JAIL_EXIT_COST = 50;
    private static final int JAIL_TURNS = 3;

    private final RedisGameTransitionStore store;
    private final DiceService dice;
    private final MovementService movement = new MovementService();
    private final SquareRepository squares;
    private final CardRepository cards;
    private final ObjectMapper mapper;
    private final GameEventPublisher events;
    private final GameTimingService timing;
    private final SecureRandom shuffle = new SecureRandom();

    @Autowired
    public TurnCommandService(RedisGameTransitionStore store, DiceService dice, SquareRepository squares,
                              CardRepository cards, ObjectMapper mapper, GameEventPublisher events,
                              GameTimingService timing) {
        this.store = store;
        this.dice = dice;
        this.squares = squares;
        this.cards = cards;
        this.mapper = mapper;
        this.events = events;
        this.timing = timing;
    }

    public ThrowResultDto throwDice(int gameId, int actorId, CommandMetadata metadata) {
        metadata.requireExistingGame();
        String fingerprint = CommandFingerprint.create(gameId, String.valueOf(actorId), "ROLL", metadata, "");
        GameSnapshot snapshot = requireCurrentMember(gameId, actorId);
        Optional<TransitionExecution> replay = store.replayIfPresent(gameId, metadata, fingerprint);
        if (replay.isPresent()) return throwResult(replay.get(), true);

        requireActive(snapshot, actorId, false);
        List<Integer> order = TurnOrder.parseRequired(mapper, snapshot);
        Map<String, String> actor = player(snapshot, actorId);
        actor.put("afk", "false");

        if (Boolean.parseBoolean(actor.getOrDefault("jail", "false"))) {
            return offerJailExit(gameId, actorId, metadata, fingerprint, snapshot, actor);
        }

        int rolled = dice.roll();
        int oldPosition = integer(actor, "position");
        MovementService.MovementResult movementResult = movement.move(oldPosition, rolled);
        int money = integer(actor, "money") + (movementResult.passedGo() ? START_REWARD : 0);
        actor.put("position", String.valueOf(movementResult.newPosition()));
        actor.put("money", String.valueOf(money));

        GameTransitionPlan plan = GameTransitionPlan.transition().putGame("lastDice", String.valueOf(rolled));
        RollResolution resolution = resolveSquare(snapshot, actorId, actor, movementResult.newPosition(), rolled, plan);
        boolean passedStart = movementResult.passedGo() || resolution.additionalStartPass();
        int nextPlayerId = actorId;
        if (resolution.optionalAction() == null) {
            nextPlayerId = completeTurn(snapshot, plan, order, actorId, actor);
        } else {
            plan.putGame("optionalAction", json(resolution.optionalAction()))
                    .putGame("turnDeadlineEpochMs", String.valueOf(timing.newTurnDeadlineEpochMs()));
        }
        if (resolution.deck() != null) plan.replaceDeck(resolution.deck());
        plan.putPlayer(actorId, actor);

        ThrowResultDto result = new ThrowResultDto(rolled, integer(actor, "position"), passedStart,
                resolution.squareType(), resolution.data(), snapshot.stateVersion() + 1, false, resolution.card());
        GameEventPayload event = rollEvent(actorId, oldPosition, movementResult.newPosition(), result,
                resolution, nextPlayerId, movementResult.passedGo());
        return commitThrow(gameId, metadata, fingerprint, plan, result, event);
    }

    public ActionResultDto action(int gameId, int actorId, boolean yes, CommandMetadata metadata) {
        metadata.requireExistingGame();
        String fingerprint = CommandFingerprint.create(gameId, String.valueOf(actorId), "ACTION", metadata,
                Boolean.toString(yes));
        GameSnapshot snapshot = requireCurrentMember(gameId, actorId);
        Optional<TransitionExecution> replay = store.replayIfPresent(gameId, metadata, fingerprint);
        if (replay.isPresent()) return actionResult(replay.get(), true);
        requireActive(snapshot, actorId, true);
        List<Integer> order = TurnOrder.parseRequired(mapper, snapshot);
        PendingOptionalAction pending = readPending(snapshot, actorId);
        if (!yes) return resolvePass(gameId, actorId, metadata, fingerprint, snapshot, order, pending);

        Map<String, String> actor = player(snapshot, actorId);
        GameTransitionPlan plan = GameTransitionPlan.transition().deleteGameField("optionalDeadline");
        List<Integer> acquired = new ArrayList<>();
        List<GameEventDetail> details = new ArrayList<>();
        int next;
        switch (pending.type()) {
            case PURCHASE_PROPERTY -> {
                int squareId = requireSquareId(pending);
                Square square = squares.findById(squareId)
                        .orElseThrow(() -> new GameStateConflictException("Purchase square no longer exists"));
                int price = positiveCost(square.getPrice(), "Property price");
                if (price != pending.cost()) {
                    throw new GameStateConflictException("Purchase offer no longer matches board metadata");
                }
                if (owner(snapshot, squareId) != null) {
                    throw new GameStateConflictException("Property is no longer unowned");
                }
                if (integer(actor, "money") < price) throw new GameStateConflictException("Insufficient funds");
                actor.put("money", String.valueOf(integer(actor, "money") - price));
                List<Integer> properties = properties(actor);
                properties.add(squareId);
                actor.put("properties", json(properties));
                acquired.add(squareId);
                details.add(GameEventDetail.propertyPurchased(squareId, price));
                next = completeTurn(snapshot, plan, order, actorId, actor);
                details.add(GameEventDetail.turnChanged(next));
            }
            case PAY_JAIL_EXIT -> {
                if (!Boolean.parseBoolean(actor.getOrDefault("jail", "false"))
                        || pending.cost() != JAIL_EXIT_COST) {
                    throw new GameStateConflictException("Jail payment is no longer valid");
                }
                if (integer(actor, "money") < JAIL_EXIT_COST) {
                    throw new GameStateConflictException("Insufficient funds");
                }
                actor.put("money", String.valueOf(integer(actor, "money") - JAIL_EXIT_COST));
                actor.put("jail", "false");
                actor.put("jailTime", "0");
                details.add(GameEventDetail.playerReleased(JAIL_EXIT_COST));
                // Paying exits before rolling, so the same player remains active.
                next = actorId;
                plan.putGame("playerTurn", String.valueOf(actorId))
                        .putGame("turnDeadlineEpochMs", String.valueOf(timing.newTurnDeadlineEpochMs()))
                        .deleteGameField("optionalAction");
            }
            default -> throw new GameStateConflictException("Unsupported optional action");
        }
        plan.putPlayer(actorId, actor);
        ActionResultDto result = new ActionResultDto(integer(actor, "money"), acquired, next,
                snapshot.stateVersion() + 1, false);
        return commitAction(gameId, metadata, fingerprint, plan, result,
                new GameEventPayload(GameEventReason.ACTION_RESOLVED, actorId, details));
    }

    public ActionResultDto pass(int gameId, int actorId, CommandMetadata metadata) {
        metadata.requireExistingGame();
        String fingerprint = CommandFingerprint.create(gameId, String.valueOf(actorId), "PASS", metadata, "");
        GameSnapshot snapshot = requireCurrentMember(gameId, actorId);
        Optional<TransitionExecution> replay = store.replayIfPresent(gameId, metadata, fingerprint);
        if (replay.isPresent()) return actionResult(replay.get(), true);
        requireActive(snapshot, actorId, true);
        List<Integer> order = TurnOrder.parseRequired(mapper, snapshot);
        return resolvePass(gameId, actorId, metadata, fingerprint, snapshot, order, readPending(snapshot, actorId));
    }

    private ThrowResultDto offerJailExit(int gameId, int actorId, CommandMetadata metadata, String fingerprint,
                                         GameSnapshot snapshot, Map<String, String> actor) {
        int remaining = integer(actor, "jailTime");
        if (remaining <= 0 || remaining > JAIL_TURNS) {
            throw new GameStateConflictException("Invalid jailed-turn state");
        }
        PendingOptionalAction option = PendingOptionalAction.jailPayment(
                gameId, actorId, snapshot.stateVersion() + 1);
        GameTransitionPlan plan = GameTransitionPlan.transition()
                .putGame("optionalAction", json(option))
                .putGame("turnDeadlineEpochMs", String.valueOf(timing.newTurnDeadlineEpochMs()))
                .putPlayer(actorId, actor);
        ThrowResultDto result = new ThrowResultDto(0, integer(actor, "position"), false, 10,
                JAIL_EXIT_COST, snapshot.stateVersion() + 1, false);
        GameEventPayload event = new GameEventPayload(GameEventReason.ROLL_COMPLETED, actorId,
                List.of(GameEventDetail.jailExitAvailable(JAIL_EXIT_COST)));
        return commitThrow(gameId, metadata, fingerprint, plan, result, event);
    }

    private ActionResultDto resolvePass(int gameId, int actorId, CommandMetadata metadata, String fingerprint,
                                        GameSnapshot snapshot, List<Integer> order, PendingOptionalAction pending) {
        return resolvePass(gameId, actorId, metadata, fingerprint, snapshot, order, pending, "turnFinished");
    }

    private ActionResultDto resolvePass(int gameId, int actorId, CommandMetadata metadata, String fingerprint,
                                        GameSnapshot snapshot, List<Integer> order, PendingOptionalAction pending,
                                        String event) {
        if (!pending.declinable()) throw new GameStateConflictException("Optional action cannot be declined");
        Map<String, String> actor = player(snapshot, actorId);
        GameTransitionPlan plan = GameTransitionPlan.transition().deleteGameField("optionalDeadline");
        if (pending.type() == PendingOptionalAction.Type.PAY_JAIL_EXIT) {
            int remaining = integer(actor, "jailTime");
            if (!Boolean.parseBoolean(actor.getOrDefault("jail", "false")) || remaining <= 0) {
                throw new GameStateConflictException("Jail pass is no longer valid");
            }
            remaining--;
            actor.put("jailTime", String.valueOf(remaining));
            if (remaining == 0) actor.put("jail", "false");
            plan.putPlayer(actorId, actor);
        }
        int next = completeTurn(snapshot, plan, order, actorId, actor);
        ActionResultDto result = new ActionResultDto(integer(actor, "money"), List.of(), next,
                snapshot.stateVersion() + 1, false);
        List<GameEventDetail> details = new ArrayList<>();
        if (pending.type() == PendingOptionalAction.Type.PURCHASE_PROPERTY && pending.squareId() != null) {
            details.add(GameEventDetail.propertyDeclined(pending.squareId()));
        }
        details.add(GameEventDetail.turnChanged(next));
        GameEventReason reason = "turnTimedOut".equals(event)
                ? GameEventReason.TURN_TIMED_OUT : GameEventReason.ACTION_RESOLVED;
        return commitAction(gameId, metadata, fingerprint, plan, result,
                new GameEventPayload(reason, actorId, details));
    }

    /** Rotates once and materializes a jailed next player's choice in the same commit. */
    private int completeTurn(GameSnapshot snapshot, GameTransitionPlan plan, List<Integer> order,
                             int currentActor, Map<String, String> effectiveCurrentState) {
        int next = TurnOrder.next(order, currentActor);
        plan.putGame("playerTurn", String.valueOf(next))
                .putGame("turnDeadlineEpochMs", String.valueOf(timing.newTurnDeadlineEpochMs()));
        Map<String, String> nextState = next == currentActor
                ? effectiveCurrentState : snapshot.players().get(next);
        if (nextState == null) throw new GameStateConflictException("Next player state is missing");
        if (Boolean.parseBoolean(nextState.getOrDefault("jail", "false"))) {
            if (integer(nextState, "jailTime") <= 0) {
                throw new GameStateConflictException("Next player has invalid jailed-turn state");
            }
            plan.putGame("optionalAction", json(PendingOptionalAction.jailPayment(
                    snapshot.gameId(), next, snapshot.stateVersion() + 1)));
        } else {
            plan.deleteGameField("optionalAction");
        }
        plan.deleteGameField("optionalDeadline");
        return next;
    }

    /** Captures all authoritative timeout identity fields before a CAS attempt. */
    public Optional<TurnTimeoutCandidate> dueTimeout(int gameId) {
        GameSnapshot snapshot = store.load(gameId);
        if (!"inProgress".equalsIgnoreCase(snapshot.game().get("status"))) return Optional.empty();
        String rawDeadline = snapshot.game().get("turnDeadlineEpochMs");
        String rawPlayer = snapshot.game().get("playerTurn");
        if (rawDeadline == null || rawPlayer == null) return Optional.empty();
        try {
            long deadline = Long.parseLong(rawDeadline);
            if (timing.nowEpochMs() < deadline) return Optional.empty();
            int playerId = Integer.parseInt(rawPlayer);
            String phase = snapshot.game().containsKey("optionalAction")
                    ? "AWAITING_OPTIONAL_ACTION" : "AWAITING_ROLL";
            String identity = "TURN_TIMEOUT|" + gameId + "|" + snapshot.stateVersion() + "|"
                    + playerId + "|" + phase + "|" + deadline;
            String commandId = UUID.nameUUIDFromBytes(identity.getBytes(StandardCharsets.UTF_8)).toString();
            return Optional.of(new TurnTimeoutCandidate(gameId, snapshot.stateVersion(), playerId,
                    phase, deadline, commandId));
        } catch (NumberFormatException exception) {
            throw new GameStateConflictException("Turn deadline state is malformed");
        }
    }

    public boolean timeoutIfDue(int gameId) {
        return dueTimeout(gameId).map(this::executeTimeout).orElse(false);
    }

    /** Executes the frozen timeout intent; Redis version CAS arbitrates timer/player races. */
    public boolean executeTimeout(TurnTimeoutCandidate candidate) {
        CommandMetadata metadata = new CommandMetadata(candidate.commandId(), candidate.expectedVersion());
        String parameters = candidate.playerId() + "|" + candidate.phase() + "|" + candidate.deadlineEpochMs();
        String fingerprint = CommandFingerprint.create(candidate.gameId(), "SYSTEM", "TURN_TIMEOUT", metadata, parameters);
        Optional<TransitionExecution> replay = store.replayIfPresent(candidate.gameId(), metadata, fingerprint);
        if (replay.isPresent()) return false;
        GameSnapshot snapshot = store.load(candidate.gameId());
        if (!matches(candidate, snapshot) || timing.nowEpochMs() < candidate.deadlineEpochMs()) return false;
        List<Integer> order = TurnOrder.parseRequired(mapper, snapshot);
        if ("AWAITING_OPTIONAL_ACTION".equals(candidate.phase())) {
            PendingOptionalAction pending = readPending(snapshot, candidate.playerId());
            resolvePass(candidate.gameId(), candidate.playerId(), metadata, fingerprint, snapshot, order, pending,
                    "turnTimedOut");
            return true;
        }
        Map<String, String> actor = player(snapshot, candidate.playerId());
        GameTransitionPlan plan = GameTransitionPlan.transition();
        int next = completeTurn(snapshot, plan, order, candidate.playerId(), actor);
        ActionResultDto result = new ActionResultDto(integer(actor, "money"), List.of(), next,
                snapshot.stateVersion() + 1, false);
        commitAction(candidate.gameId(), metadata, fingerprint, plan, result,
                new GameEventPayload(GameEventReason.TURN_TIMED_OUT, candidate.playerId(),
                        List.of(GameEventDetail.turnChanged(next))));
        return true;
    }

    private boolean matches(TurnTimeoutCandidate candidate, GameSnapshot snapshot) {
        String phase = snapshot.game().containsKey("optionalAction")
                ? "AWAITING_OPTIONAL_ACTION" : "AWAITING_ROLL";
        return "inProgress".equalsIgnoreCase(snapshot.game().get("status"))
                && snapshot.stateVersion() == candidate.expectedVersion()
                && String.valueOf(candidate.playerId()).equals(snapshot.game().get("playerTurn"))
                && candidate.phase().equals(phase)
                && String.valueOf(candidate.deadlineEpochMs()).equals(snapshot.game().get("turnDeadlineEpochMs"));
    }

    public record TurnTimeoutCandidate(int gameId, long expectedVersion, int playerId, String phase,
                                       long deadlineEpochMs, String commandId) { }

    private RollResolution resolveSquare(GameSnapshot snapshot, int actorId, Map<String, String> actor,
                                         int position, int rolled, GameTransitionPlan plan) {
        Square square = squares.findById(position).orElseThrow(() -> new IllegalArgumentException("Bad square id"));
        return switch (square.getType()) {
            case START -> RollResolution.automatic(4, START_REWARD);
            case PARKING -> RollResolution.automatic(9, -1);
            case TAX -> {
                int tax = positiveCost(square.getPrice(), "Tax");
                actor.put("money", String.valueOf(integer(actor, "money") - tax));
                yield RollResolution.automatic(6, tax);
            }
            case CARD -> applyCard(snapshot, actor, position);
            case JAIL -> RollResolution.automatic(8, -1);
            case GOJAIL -> {
                actor.put("position", "10");
                actor.put("jail", "true");
                actor.put("jailTime", String.valueOf(JAIL_TURNS));
                yield RollResolution.automatic(7, -1);
            }
            default -> resolveProperty(snapshot, actorId, actor, square, rolled, plan);
        };
    }

    private RollResolution applyCard(GameSnapshot snapshot, Map<String, String> actor, int landingPosition) {
        PreparedCard prepared = prepareCard(snapshot);
        Card card = prepared.card();
        int amount = Math.round(card.getAmount());
        CardDrawDto cardDraw = new CardDrawDto(card.getId(), card.getTitle(), card.getDescription(),
                card.getType().name(), amount);
        if (card.getType() == Card.CardType.money) {
            actor.put("money", String.valueOf(integer(actor, "money") + amount));
            return new RollResolution(2, amount, null, prepared.deck(), false, cardDraw, null);
        }
        if (card.getType() == Card.CardType.transport) {
            if (amount < 0 || amount >= MovementService.BOARD_SIZE) {
                throw new GameStateConflictException("Card destination is outside the board");
            }
            boolean crossesStart = amount < landingPosition;
            actor.put("position", String.valueOf(amount));
            if (crossesStart) actor.put("money", String.valueOf(integer(actor, "money") + START_REWARD));
            return new RollResolution(1, amount, null, prepared.deck(), crossesStart, cardDraw, null);
        }
        throw new GameStateConflictException("Unsupported card type");
    }

    private RollResolution resolveProperty(GameSnapshot snapshot, int actorId, Map<String, String> actor,
                                           Square square, int rolled, GameTransitionPlan plan) {
        Integer ownerId = owner(snapshot, square.getId());
        if (ownerId == null) {
            int price = positiveCost(square.getPrice(), "Property price");
            if (integer(actor, "money") < price) return RollResolution.automatic(4, -1);
            PendingOptionalAction option = PendingOptionalAction.purchase(
                    snapshot.gameId(), actorId, snapshot.stateVersion() + 1, square.getId(), price);
            return new RollResolution(5, price, option, null, false, null, null);
        }
        if (ownerId == actorId) return RollResolution.automatic(4, -1);

        int rent = calculateRent(snapshot, ownerId, square, rolled);
        if (rent <= 0) throw new GameStateConflictException("Rent must be a positive amount");
        Map<String, String> owner = player(snapshot, ownerId);
        actor.put("money", String.valueOf(integer(actor, "money") - rent));
        owner.put("money", String.valueOf(integer(owner, "money") + rent));
        plan.putPlayer(ownerId, owner);
        return new RollResolution(3, rent, null, null, false, null, ownerId);
    }

    private int calculateRent(GameSnapshot snapshot, int ownerId, Square square, int rolled) {
        if (square.getType() == Square.SquareType.UTILITY) {
            return owns(snapshot, ownerId, 12) && owns(snapshot, ownerId, 28) ? rolled * 10 : rolled * 4;
        }
        if (square.getType() == Square.SquareType.TRAIN) {
            long count = List.of(5, 15, 25, 35).stream().filter(id -> owns(snapshot, ownerId, id)).count();
            return switch ((int) count) {
                case 1 -> 25;
                case 2 -> 50;
                case 3 -> 100;
                case 4 -> 200;
                default -> throw new GameStateConflictException("Property owner state is inconsistent");
            };
        }
        List<Integer> color = squares.findIdsByColour(square.getType());
        boolean fullSet = !color.isEmpty() && color.stream().allMatch(id -> owns(snapshot, ownerId, id));
        return positiveCost(square.getRent(), "Rent") * (fullSet ? 2 : 1);
    }

    private PreparedCard prepareCard(GameSnapshot snapshot) {
        List<String> deck = new ArrayList<>(snapshot.deck());
        if (deck.isEmpty()) {
            deck.addAll(cards.findAll().stream().map(card -> String.valueOf(card.getId())).toList());
            Collections.shuffle(deck, shuffle);
        }
        if (deck.isEmpty()) throw new GameStateConflictException("No cards are configured");
        String selected = deck.remove(0);
        Card card;
        try {
            card = cards.findById(Integer.parseInt(selected))
                    .orElseThrow(() -> new GameStateConflictException("Card is missing from static metadata"));
        } catch (NumberFormatException exception) {
            throw new GameStateConflictException("Deck contains an invalid card ID");
        }
        // Cycling is per game: the committed draw moves exactly one ID to the tail.
        deck.add(selected);
        return new PreparedCard(card, List.copyOf(deck));
    }

    private PendingOptionalAction readPending(GameSnapshot snapshot, int actorId) {
        try {
            PendingOptionalAction pending = mapper.readValue(
                    snapshot.game().get("optionalAction"), PendingOptionalAction.class);
            pending.validate();
            if (pending.gameId() != snapshot.gameId() || pending.playerId() != actorId
                    || pending.stateVersion() != snapshot.stateVersion() || pending.cost() <= 0) {
                throw new GameStateConflictException("Optional action does not match the active turn");
            }
            return pending;
        } catch (JsonProcessingException | NullPointerException | IllegalArgumentException exception) {
            throw new GameStateConflictException("Optional action state is malformed");
        }
    }

    private ThrowResultDto commitThrow(int gameId, CommandMetadata metadata, String fingerprint,
                                       GameTransitionPlan plan, ThrowResultDto result, GameEventPayload event) {
        TransitionExecution execution = store.commit(gameId, metadata, fingerprint, plan, mapper.valueToTree(result));
        if (execution.shouldPublish()) {
            events.publish(gameId, execution.stateVersion(), GameEventType.TURN_UPDATED, event);
        }
        return throwResult(execution, execution.replayed());
    }

    private ActionResultDto commitAction(int gameId, CommandMetadata metadata, String fingerprint,
                                         GameTransitionPlan plan, ActionResultDto result, GameEventPayload payload) {
        TransitionExecution execution = store.commit(gameId, metadata, fingerprint, plan, mapper.valueToTree(result));
        if (execution.shouldPublish()) {
            events.publish(gameId, execution.stateVersion(), GameEventType.TURN_UPDATED, payload);
        }
        return actionResult(execution, execution.replayed());
    }

    private ThrowResultDto throwResult(TransitionExecution execution, boolean replayed) {
        try {
            ThrowResultDto value = mapper.treeToValue(execution.semanticResult(), ThrowResultDto.class);
            return new ThrowResultDto(value.dice(), value.newPosition(), value.passedGo(), value.squareType(), value.data(),
                    execution.stateVersion(), replayed, value.card());
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Invalid roll replay", exception);
        }
    }

    private ActionResultDto actionResult(TransitionExecution execution, boolean replayed) {
        try {
            ActionResultDto value = mapper.treeToValue(execution.semanticResult(), ActionResultDto.class);
            return new ActionResultDto(value.newBalance(), value.acquiredProperties(), value.nextPlayerId(),
                    execution.stateVersion(), replayed);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Invalid action replay", exception);
        }
    }

    private GameSnapshot requireCurrentMember(int gameId, int actorId) {
        GameSnapshot snapshot = store.load(gameId);
        if (snapshot.game().isEmpty()) throw new GameNotFoundException();
        if (!snapshot.members().contains(String.valueOf(actorId))) {
            throw new AccessDeniedException("Game membership required");
        }
        return snapshot;
    }

    private void requireActive(GameSnapshot snapshot, int actorId, boolean optionalRequired) {
        if (!"inProgress".equalsIgnoreCase(snapshot.game().get("status"))) {
            throw new GameStateConflictException("Game is not in progress");
        }
        if (!String.valueOf(actorId).equals(snapshot.game().get("playerTurn"))) {
            throw new AccessDeniedException("Only the active player may perform this command");
        }
        boolean pending = snapshot.game().containsKey("optionalAction");
        if (optionalRequired != pending) {
            throw new GameStateConflictException(optionalRequired
                    ? "No optional action is pending" : "A pending optional action must be resolved first");
        }
    }

    private Map<String, String> player(GameSnapshot snapshot, int playerId) {
        Map<String, String> source = snapshot.players().get(playerId);
        if (source == null || source.isEmpty()) throw new IllegalStateException("Player state is missing");
        return new LinkedHashMap<>(source);
    }

    private Integer owner(GameSnapshot snapshot, int squareId) {
        Integer owner = null;
        for (Map.Entry<Integer, Map<String, String>> entry : snapshot.players().entrySet()) {
            if (!properties(entry.getValue()).contains(squareId)) continue;
            if (owner != null) throw new GameStateConflictException("Property has multiple owners");
            owner = entry.getKey();
        }
        return owner;
    }

    private boolean owns(GameSnapshot snapshot, int playerId, int squareId) {
        return properties(snapshot.players().getOrDefault(playerId, Map.of())).contains(squareId);
    }

    private List<Integer> properties(Map<String, String> player) {
        try {
            return new ArrayList<>(mapper.readValue(player.getOrDefault("properties", "[]"), new TypeReference<>() { }));
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Malformed properties JSON", exception);
        }
    }

    private int requireSquareId(PendingOptionalAction pending) {
        if (pending.squareId() == null) throw new GameStateConflictException("Purchase offer has no square");
        return pending.squareId();
    }

    private int positiveCost(Integer raw, String label) {
        if (raw == null || raw == 0 || raw == Integer.MIN_VALUE) {
            throw new GameStateConflictException(label + " must be configured as a positive cost");
        }
        return Math.abs(raw);
    }

    private int integer(Map<String, String> map, String key) {
        return Integer.parseInt(map.getOrDefault(key, "0"));
    }

    private String json(Object value) {
        try {
            return mapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Could not serialize command state", exception);
        }
    }

    private record PreparedCard(Card card, List<String> deck) { }

    private GameEventPayload rollEvent(int actorId, int oldPosition, int landingPosition, ThrowResultDto result,
                                       RollResolution resolution, int nextPlayerId, boolean crossedStartByDice) {
        List<GameEventDetail> details = new ArrayList<>();
        details.add(GameEventDetail.diceRolled(result.dice()));
        details.add(GameEventDetail.playerMoved(oldPosition, result.newPosition()));
        details.add(GameEventDetail.landedOn(landingPosition));
        switch (result.squareType()) {
            case 1, 2 -> details.add(GameEventDetail.cardDrawn(landingPosition, resolution.card()));
            case 3 -> details.add(GameEventDetail.rentPaid(
                    landingPosition, result.data(), resolution.counterpartyPlayerId()));
            case 5 -> details.add(GameEventDetail.propertyAvailable(landingPosition, result.data()));
            case 6 -> details.add(GameEventDetail.taxPaid(landingPosition, result.data()));
            case 7 -> details.add(GameEventDetail.playerJailed(landingPosition));
            default -> { }
        }
        if (crossedStartByDice || resolution.additionalStartPass()) {
            details.add(GameEventDetail.moneyReceived(START_REWARD));
        }
        if (resolution.optionalAction() == null) details.add(GameEventDetail.turnChanged(nextPlayerId));
        return new GameEventPayload(GameEventReason.ROLL_COMPLETED, actorId, details);
    }

    private record RollResolution(int squareType, int data, PendingOptionalAction optionalAction,
                                  List<String> deck, boolean additionalStartPass, CardDrawDto card,
                                  Integer counterpartyPlayerId) {
        static RollResolution automatic(int squareType, int data) {
            return new RollResolution(squareType, data, null, null, false, null, null);
        }
    }
}
