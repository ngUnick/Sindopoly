package com.example.Sindopoly_Java.service.transition;

import com.example.Sindopoly_Java.exception.GameNotFoundException;
import com.example.Sindopoly_Java.exception.GameStateConflictException;
import com.example.Sindopoly_Java.model.Card;
import com.example.Sindopoly_Java.model.Square;
import com.example.Sindopoly_Java.model.dto.ActionResultDto;
import com.example.Sindopoly_Java.model.dto.SquareEventDto;
import com.example.Sindopoly_Java.model.dto.ThrowResultDto;
import com.example.Sindopoly_Java.repository.CardRepository;
import com.example.Sindopoly_Java.repository.SquareRepository;
import com.example.Sindopoly_Java.service.core.DiceService;
import com.example.Sindopoly_Java.service.core.MovementService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Authoritative calculation and atomic commit path for player turn commands. */
@Service
public class TurnCommandService {

    private final RedisGameTransitionStore store;
    private final DiceService dice;
    private final MovementService movement = new MovementService();
    private final SquareRepository squares;
    private final CardRepository cards;
    private final ObjectMapper mapper;
    private final SimpMessagingTemplate broker;
    private final SecureRandom shuffle = new SecureRandom();

    public TurnCommandService(RedisGameTransitionStore store, DiceService dice, SquareRepository squares,
                              CardRepository cards, ObjectMapper mapper, SimpMessagingTemplate broker) {
        this.store = store;
        this.dice = dice;
        this.squares = squares;
        this.cards = cards;
        this.mapper = mapper;
        this.broker = broker;
    }

    public ThrowResultDto throwDice(int gameId, int actorId, CommandMetadata metadata) {
        metadata.requireExistingGame();
        String fingerprint = CommandFingerprint.create(gameId, String.valueOf(actorId), "ROLL", metadata, "");
        GameSnapshot snapshot = requireCurrentMember(gameId, actorId);
        var replay = store.replayIfPresent(gameId, metadata, fingerprint);
        if (replay.isPresent()) return throwResult(replay.get(), true);

        requireActive(snapshot, actorId, false);
        Map<String, String> player = player(snapshot, actorId);
        GameTransitionPlan plan = GameTransitionPlan.transition();
        player.put("afk", "false");

        int money = integer(player, "money");
        int position = integer(player, "position");
        if (money < 0) {
            player.put("bankrupt", "true");
            plan.putPlayer(actorId, player).removeMember(actorId);
            int next = nextPlayer(snapshot, actorId, actorId);
            if (next >= 0) plan.putGame("playerTurn", String.valueOf(next));
            ThrowResultDto result = new ThrowResultDto(0, -1, false, -2, -1, snapshot.stateVersion() + 1, false);
            return commitThrow(gameId, actorId, metadata, fingerprint, plan, result);
        }

        if (Boolean.parseBoolean(player.getOrDefault("jail", "false"))) {
            int remaining = integer(player, "jailTime");
            if (remaining > 1) {
                remaining--;
                player.put("jailTime", String.valueOf(remaining));
                plan.putPlayer(actorId, player).putGame("playerTurn", String.valueOf(nextPlayer(snapshot, actorId, -1)));
                ThrowResultDto result = new ThrowResultDto(0, -1, false, -1, remaining,
                        snapshot.stateVersion() + 1, false);
                return commitThrow(gameId, actorId, metadata, fingerprint, plan, result);
            }
            player.put("jail", "false");
            player.put("jailTime", "0");
        }

        int rolled = dice.roll();
        MovementService.MovementResult moved = movement.move(position, rolled);
        position = moved.newPosition();
        if (moved.passedGo()) money += 200;
        PreparedEvent prepared = prepareEvent(snapshot, actorId, position, rolled);
        player.put("position", String.valueOf(position));
        player.put("money", String.valueOf(money));
        plan.putPlayer(actorId, player)
                .putGame("lastDice", String.valueOf(rolled))
                .putGame("optionalAction", json(prepared.event()));
        if (prepared.deck() != null) plan.replaceDeck(prepared.deck());

        int[] mapped = mapEvent(prepared.event());
        ThrowResultDto result = new ThrowResultDto(rolled, position, moved.passedGo(), mapped[0], mapped[1],
                snapshot.stateVersion() + 1, false);
        return commitThrow(gameId, actorId, metadata, fingerprint, plan, result);
    }

    public ActionResultDto action(int gameId, int actorId, boolean yes, CommandMetadata metadata) {
        metadata.requireExistingGame();
        String payload = Boolean.toString(yes);
        String fingerprint = CommandFingerprint.create(gameId, String.valueOf(actorId), "ACTION", metadata, payload);
        GameSnapshot snapshot = requireCurrentMember(gameId, actorId);
        var replay = store.replayIfPresent(gameId, metadata, fingerprint);
        if (replay.isPresent()) return actionResult(replay.get(), true);
        requireActive(snapshot, actorId, true);
        SquareEventDto event = readEvent(snapshot);
        Map<String, String> actor = player(snapshot, actorId);
        List<Integer> acquired = new ArrayList<>();
        GameTransitionPlan plan = GameTransitionPlan.transition().deleteGameField("optionalAction");

        if (yes) applyEvent(snapshot, actorId, actor, event, acquired, plan);
        plan.putPlayer(actorId, actor);
        int next = nextPlayer(snapshot, actorId, -1);
        plan.putGame("playerTurn", String.valueOf(next));
        ActionResultDto result = new ActionResultDto(integer(actor, "money"), acquired, next,
                snapshot.stateVersion() + 1, false);
        return commitAction(gameId, actorId, metadata, fingerprint, plan, result, "actionCompleted");
    }

    public ActionResultDto pass(int gameId, int actorId, CommandMetadata metadata) {
        metadata.requireExistingGame();
        String fingerprint = CommandFingerprint.create(gameId, String.valueOf(actorId), "PASS", metadata, "");
        GameSnapshot snapshot = requireCurrentMember(gameId, actorId);
        var replay = store.replayIfPresent(gameId, metadata, fingerprint);
        if (replay.isPresent()) return actionResult(replay.get(), true);
        requireActive(snapshot, actorId, true);
        int next = nextPlayer(snapshot, actorId, -1);
        GameTransitionPlan plan = GameTransitionPlan.transition().deleteGameField("optionalAction")
                .deleteGameField("optionalDeadline").putGame("playerTurn", String.valueOf(next));
        ActionResultDto result = new ActionResultDto(integer(player(snapshot, actorId), "money"), List.of(), next,
                snapshot.stateVersion() + 1, false);
        return commitAction(gameId, actorId, metadata, fingerprint, plan, result, "turnFinished");
    }

    private void applyEvent(GameSnapshot snapshot, int actorId, Map<String, String> actor, SquareEventDto event,
                            List<Integer> acquired, GameTransitionPlan plan) {
        switch (event.getType()) {
            case "buyOffer" -> {
                int price = event.getPrice();
                if (integer(actor, "money") < price) throw new GameStateConflictException("Insufficient funds");
                actor.put("money", String.valueOf(integer(actor, "money") - price));
                List<Integer> properties = properties(actor);
                if (!properties.contains(event.getSquareId())) properties.add(event.getSquareId());
                actor.put("properties", json(properties));
                acquired.add(event.getSquareId());
            }
            case "jailOffer" -> {
                int fee = event.getFee();
                if (integer(actor, "money") < fee) throw new GameStateConflictException("Insufficient funds");
                actor.put("money", String.valueOf(integer(actor, "money") - fee));
                actor.put("position", "10");
                actor.put("jail", "true");
                actor.put("jailTime", "3");
            }
            case "rentDue" -> {
                // Preserve the characterized defect until the canonical rule-fix item.
                int amount = event.getAmount();
                actor.put("money", String.valueOf(integer(actor, "money") + amount));
                int ownerId = Integer.parseInt(event.getOwnerId());
                Map<String, String> owner = player(snapshot, ownerId);
                owner.put("money", String.valueOf(integer(owner, "money") + amount));
                plan.putPlayer(ownerId, owner);
            }
            case "money" -> actor.put("money", String.valueOf(integer(actor, "money") + event.getAmount()));
            case "transport" -> actor.put("position", String.valueOf(event.getAmount()));
            case "tax" -> actor.put("money", String.valueOf(integer(actor, "money") - event.getAmount()));
            case "goToJail" -> {
                actor.put("position", "10"); actor.put("jail", "true"); actor.put("jailTime", "3");
            }
            default -> { }
        }
    }

    private PreparedEvent prepareEvent(GameSnapshot snapshot, int actorId, int position, int rolled) {
        Square square = squares.findById(position).orElseThrow(() -> new IllegalArgumentException("Bad square id"));
        return switch (square.getType()) {
            case START -> new PreparedEvent(SquareEventDto.justInfo("start", "Visiting Start", 0), null);
            case PARKING -> new PreparedEvent(SquareEventDto.justInfo("parking", "Free Parking", 0), null);
            case TAX -> new PreparedEvent(SquareEventDto.justInfo("tax", "Pay tax: €" + value(square.getPrice()), -value(square.getPrice())), null);
            case CARD -> prepareCard(snapshot);
            case JAIL, GOJAIL -> new PreparedEvent(SquareEventDto.jailOffer(50), null);
            default -> new PreparedEvent(prepareProperty(snapshot, actorId, square, rolled), null);
        };
    }

    private PreparedEvent prepareCard(GameSnapshot snapshot) {
        List<String> deck = new ArrayList<>(snapshot.deck());
        if (deck.isEmpty()) {
            deck.addAll(cards.findAll().stream().map(card -> String.valueOf(card.getId())).toList());
            Collections.shuffle(deck, shuffle);
        }
        if (deck.isEmpty()) throw new IllegalStateException("No cards are configured");
        String selected = deck.remove(0);
        // Preserve the current exhaust-and-reshuffle lifecycle; commit still makes consumption atomic.
        Card card = cards.findById(Integer.parseInt(selected))
                .orElseThrow(() -> new IllegalStateException("Card not found"));
        return new PreparedEvent(SquareEventDto.card(card.getTitle(), card.getType().toString(),
                Math.round(card.getAmount())), deck);
    }

    private SquareEventDto prepareProperty(GameSnapshot snapshot, int actorId, Square square, int rolled) {
        Integer owner = owner(snapshot, square.getId());
        if (owner == null) {
            int price = value(square.getPrice());
            return integer(player(snapshot, actorId), "money") >= price
                    ? SquareEventDto.buyOffer(square.getId(), price)
                    : SquareEventDto.justInfo("no-money", "Cannot afford: €" + price, 0);
        }
        if (owner == actorId) return SquareEventDto.justInfo("own", "Your own property", 0);
        int rent;
        if (square.getType() == Square.SquareType.UTILITY) {
            rent = owns(snapshot, owner, 12) && owns(snapshot, owner, 28) ? rolled * 10 : rolled * 4;
        } else if (square.getType() == Square.SquareType.TRAIN) {
            long count = List.of(5, 15, 25, 35).stream().filter(id -> owns(snapshot, owner, id)).count();
            rent = switch ((int) count) { case 1 -> 25; case 2 -> 50; case 3 -> 100; default -> 200; };
        } else {
            List<Integer> color = squares.findIdsByColour(square.getType());
            boolean full = color.stream().allMatch(id -> owns(snapshot, owner, id));
            rent = value(square.getRent()) * (full ? 2 : 1);
        }
        return SquareEventDto.rentDue(String.valueOf(owner), rent);
    }

    private ThrowResultDto commitThrow(int gameId, int actorId, CommandMetadata metadata, String fingerprint,
                                       GameTransitionPlan plan, ThrowResultDto result) {
        TransitionExecution execution = store.commit(gameId, metadata, fingerprint, plan, mapper.valueToTree(result));
        if (execution.shouldPublish()) publish(gameId, "rollCompleted", execution.stateVersion());
        return throwResult(execution, execution.replayed());
    }

    private ActionResultDto commitAction(int gameId, int actorId, CommandMetadata metadata, String fingerprint,
                                         GameTransitionPlan plan, ActionResultDto result, String event) {
        TransitionExecution execution = store.commit(gameId, metadata, fingerprint, plan, mapper.valueToTree(result));
        if (execution.shouldPublish()) publish(gameId, event, execution.stateVersion());
        return actionResult(execution, execution.replayed());
    }

    private ThrowResultDto throwResult(TransitionExecution execution, boolean replayed) {
        try {
            ThrowResultDto value = mapper.treeToValue(execution.semanticResult(), ThrowResultDto.class);
            return new ThrowResultDto(value.dice(), value.newPosition(), value.passedGo(), value.squareType(), value.data(),
                    execution.stateVersion(), replayed);
        } catch (JsonProcessingException exception) { throw new IllegalStateException("Invalid roll replay", exception); }
    }

    private ActionResultDto actionResult(TransitionExecution execution, boolean replayed) {
        try {
            ActionResultDto value = mapper.treeToValue(execution.semanticResult(), ActionResultDto.class);
            return new ActionResultDto(value.newBalance(), value.acquiredProperties(), value.nextPlayerId(),
                    execution.stateVersion(), replayed);
        } catch (JsonProcessingException exception) { throw new IllegalStateException("Invalid action replay", exception); }
    }

    private GameSnapshot requireCurrentMember(int gameId, int actorId) {
        GameSnapshot snapshot = store.load(gameId);
        if (snapshot.game().isEmpty()) throw new GameNotFoundException();
        if (!snapshot.members().contains(String.valueOf(actorId))) throw new AccessDeniedException("Game membership required");
        return snapshot;
    }

    private void requireActive(GameSnapshot snapshot, int actorId, boolean optionalRequired) {
        if (!"inProgress".equalsIgnoreCase(snapshot.game().get("status"))) throw new GameStateConflictException("Game is not in progress");
        if (!String.valueOf(actorId).equals(snapshot.game().get("playerTurn"))) throw new AccessDeniedException("Only the active player may perform this command");
        boolean pending = snapshot.game().containsKey("optionalAction");
        if (optionalRequired != pending) throw new GameStateConflictException(optionalRequired
                ? "No optional action is pending" : "A pending optional action must be resolved first");
        if (snapshot.stateVersion() < 0) throw new IllegalStateException("Invalid game version");
    }

    private Map<String, String> player(GameSnapshot snapshot, int playerId) {
        Map<String, String> source = snapshot.players().get(playerId);
        if (source == null || source.isEmpty()) throw new IllegalStateException("Player state is missing");
        return new LinkedHashMap<>(source);
    }

    private int nextPlayer(GameSnapshot snapshot, int current, int excluded) {
        List<Integer> order = snapshot.members().stream().map(Integer::parseInt).sorted()
                .filter(id -> id != excluded).toList();
        if (order.isEmpty()) return -1;
        int index = order.indexOf(current);
        return order.get((index < 0 ? 0 : index + 1) % order.size());
    }

    private Integer owner(GameSnapshot snapshot, int squareId) {
        return snapshot.players().entrySet().stream().filter(entry -> properties(entry.getValue()).contains(squareId))
                .map(Map.Entry::getKey).findFirst().orElse(null);
    }

    private boolean owns(GameSnapshot snapshot, int playerId, int squareId) {
        return properties(snapshot.players().getOrDefault(playerId, Map.of())).contains(squareId);
    }

    private List<Integer> properties(Map<String, String> player) {
        try { return new ArrayList<>(mapper.readValue(player.getOrDefault("properties", "[]"), new TypeReference<>() {})); }
        catch (JsonProcessingException exception) { throw new IllegalStateException("Malformed properties JSON", exception); }
    }

    private SquareEventDto readEvent(GameSnapshot snapshot) {
        try { return mapper.readValue(snapshot.game().get("optionalAction"), SquareEventDto.class); }
        catch (JsonProcessingException exception) { throw new IllegalStateException("Bad pending event", exception); }
    }

    private int[] mapEvent(SquareEventDto event) {
        return switch (event.getType()) {
            case "transport" -> new int[]{1, event.getAmount()}; case "money" -> new int[]{2, event.getAmount()};
            case "rentDue" -> new int[]{3, event.getAmount()}; case "buyOffer" -> new int[]{5, event.getPrice()};
            case "tax" -> new int[]{6, event.getAmount()}; case "goToJail" -> new int[]{7, -1};
            case "jail", "jailOffer" -> new int[]{8, -1}; case "parking" -> new int[]{9, -1};
            default -> new int[]{4, -1};
        };
    }

    private int integer(Map<String, String> map, String key) { return Integer.parseInt(map.getOrDefault(key, "0")); }
    private int value(Integer value) { return value == null ? 0 : value; }
    private String json(Object value) { try { return mapper.writeValueAsString(value); }
        catch (JsonProcessingException exception) { throw new IllegalStateException("Could not serialize command state", exception); } }
    private void publish(int gameId, String event, long version) {
        broker.convertAndSend("/topic/game/" + gameId, Map.of("event", event, "stateVersion", version));
    }
    private record PreparedEvent(SquareEventDto event, List<String> deck) { }
}
