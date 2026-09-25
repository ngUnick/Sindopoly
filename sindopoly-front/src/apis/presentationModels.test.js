import test from "node:test";
import assert from "node:assert/strict";
import {
  ACTION_KINDS,
  TURN_STATES,
  buildActionViewModel,
  buildGameViewModel,
  buildPropertyViewModels,
  readCompletionNavigationState,
} from "../features/game/presentation/gameViewModel.js";
import {
  CONNECTION_STATES,
  buildConnectionViewModel,
} from "../features/game/presentation/connectionViewModel.js";
import { buildEventViewModel } from "../features/game/presentation/eventViewModel.js";
import { buildDicePresentationModel } from "../features/game/presentation/dicePresentationModel.js";
import { buildBoardMetadataIndex } from "../features/game/board/boardMetadata.js";
import { deriveOwnershipProjection } from "./ownershipProjection.js";
import { decodeGameSnapshot } from "./transportDecoders.js";
import { decodeGameEvent as decodeEvent } from "./gameEventDecoder.js";
import {
  cardEvent,
  endedGameSnapshot,
  inProgressSnapshot,
  jailedPlayerSnapshot,
  lobbySnapshot,
  purchaseOptionalActionSnapshot,
  rentEvent,
  taxEvent,
  turnTimeoutEvent,
  turnUpdatedEvent,
} from "../test-fixtures/gameRealtimeFixtures.js";
import { createBoardMetadataPayload } from "../test-fixtures/boardMetadataFixtures.js";
import { decodeBoardMetadata } from "./transportDecoders.js";

const decodedSnapshot = fixture => decodeGameSnapshot(structuredClone(fixture));
const decodedEvent = fixture => decodeEvent(structuredClone(fixture), fixture.gameId);

function gameModel(fixture, viewerPlayerId = 101, extra = {}) {
  const snapshot = decodedSnapshot(fixture);
  return buildGameViewModel({
    snapshot,
    viewerPlayerId,
    ownership: deriveOwnershipProjection(snapshot),
    ...extra,
  });
}

test("valid in-progress snapshot builds a game model", () => {
  const model = gameModel(inProgressSnapshot);
  assert.equal(model.gameId, 101);
  assert.equal(model.stateVersion, 2);
  assert.equal(model.status, "inProgress");
});

test("valid lobby snapshot builds a read-only game model", () => {
  const model = gameModel(lobbySnapshot);
  assert.equal(model.status, "lobby");
  assert.equal(model.action.kind, ACTION_KINDS.NONE);
});

test("completed snapshot builds completion presentation", () => {
  assert.equal(gameModel(endedGameSnapshot).completion.completed, true);
});

test("viewer present in the snapshot is identified", () => {
  const viewer = gameModel(inProgressSnapshot).viewer;
  assert.equal(viewer.present, true);
  assert.equal(viewer.player.playerId, 101);
});

test("viewer absent from the snapshot gets no action", () => {
  const model = gameModel(inProgressSnapshot, 999);
  assert.equal(model.viewer.present, false);
  assert.equal(model.viewer.player, null);
  assert.equal(model.action.kind, ACTION_KINDS.NONE);
  assert.equal(model.action.enabled, false);
});

test("active player is resolved strictly by ID", () => {
  const model = gameModel(inProgressSnapshot, 102);
  assert.equal(model.activePlayer.playerId, 101);
  assert.equal(model.activePlayer.nickname, "BaselineHost");
});

test("snapshot player order is preserved", () => {
  assert.deepEqual(gameModel(inProgressSnapshot).players.map(player => player.playerId), [101, 102]);
});

test("player model marks the authenticated self", () => {
  const model = gameModel(inProgressSnapshot, 102);
  assert.equal(model.players[1].isSelf, true);
  assert.equal(model.players[0].isSelf, false);
});

test("player model marks the active player", () => {
  const model = gameModel(inProgressSnapshot, 102);
  assert.equal(model.players[0].isActive, true);
  assert.equal(model.players[1].isActive, false);
});

test("one player can be both self and active", () => {
  const player = gameModel(inProgressSnapshot, 101).players[0];
  assert.equal(player.isSelf, true);
  assert.equal(player.isActive, true);
});

test("jailed player facts pass through", () => {
  const player = gameModel(jailedPlayerSnapshot).players[0];
  assert.equal(player.jailed, true);
  assert.equal(player.jailTurnsRemaining, 3);
});

test("property count comes from resolved ownership", () => {
  const player = gameModel(inProgressSnapshot).players[0];
  assert.deepEqual(player.propertyIds, [1]);
  assert.equal(player.propertyCount, 1);
});

test("player money has raw and Greek-formatted forms", () => {
  const player = gameModel(inProgressSnapshot).players[0];
  assert.equal(player.money, 1440);
  assert.equal(player.moneyText, "1.440€");
});

test("Greek Unicode nickname is preserved", () => {
  const fixture = structuredClone(inProgressSnapshot);
  fixture.players[0].nickname = "Αΐντα_Ω";
  assert.equal(gameModel(fixture).players[0].nickname, "Αΐντα_Ω");
});

test("turn model describes the viewer's own turn", () => {
  const turn = gameModel(inProgressSnapshot, 101).turn;
  assert.equal(turn.state, TURN_STATES.OWN_TURN);
  assert.equal(turn.statusText, "Η σειρά σου");
  assert.equal(turn.turnDeadlineEpochMs, 1789661234567);
});

test("turn model describes another player's turn", () => {
  const turn = gameModel(inProgressSnapshot, 102).turn;
  assert.equal(turn.state, TURN_STATES.OTHER_PLAYER_TURN);
  assert.equal(turn.statusText, "Παίζει τώρα: BaselineHost");
});

test("turn model handles no active player", () => {
  const turn = gameModel(lobbySnapshot).turn;
  assert.equal(turn.state, TURN_STATES.NO_ACTIVE_PLAYER);
  assert.equal(turn.activePlayerId, null);
  assert.equal(turn.turnDeadlineEpochMs, null);
});

test("turn model describes a completed game", () => {
  const turn = gameModel(endedGameSnapshot).turn;
  assert.equal(turn.state, TURN_STATES.GAME_COMPLETE);
  assert.equal(turn.canShowActions, false);
  assert.equal(turn.turnDeadlineEpochMs, null);
});

test("optional-action turn models preserve the raw authoritative deadline", () => {
  assert.equal(gameModel(purchaseOptionalActionSnapshot).turn.turnDeadlineEpochMs, 1789661294567);
  assert.equal(gameModel(jailedPlayerSnapshot).turn.turnDeadlineEpochMs, 1789661594567);
});

test("purchase action is exposed to its exact viewer", () => {
  const action = gameModel(purchaseOptionalActionSnapshot, 101).action;
  assert.equal(action.kind, ACTION_KINDS.PURCHASE_PROPERTY);
  assert.equal(action.propertyId, 6);
  assert.equal(action.cost, 100);
  assert.equal(action.primaryLabel, "Αγορά για 100€");
  assert.equal(action.secondaryLabel, "Δεν αγοράζω");
  assert.equal(action.enabled, true);
});

test("purchase action reuses already loaded board metadata as display context", () => {
  const boardMetadata = buildBoardMetadataIndex(
    decodeBoardMetadata(createBoardMetadataPayload()),
  );
  const action = gameModel(purchaseOptionalActionSnapshot, 101, { boardMetadata }).action;
  assert.equal(action.propertyName, boardMetadata.byPosition[6].name);
  assert.equal(action.costText, "100€");
});

test("purchase action is not exposed to another viewer", () => {
  const action = gameModel(purchaseOptionalActionSnapshot, 102).action;
  assert.equal(action.kind, ACTION_KINDS.WAITING);
  assert.equal(action.enabled, false);
});

test("jail payment action uses the authoritative option cost", () => {
  const action = gameModel(jailedPlayerSnapshot, 101).action;
  assert.equal(action.kind, ACTION_KINDS.PAY_JAIL_EXIT);
  assert.equal(action.cost, 50);
  assert.equal(action.primaryLabel, "Πληρωμή 50€ και ρίψη");
  assert.equal(action.secondaryLabel, "Παράλειψη σειράς");
});

test("unknown optional action exposes no unsafe action", () => {
  const snapshot = { ...decodedSnapshot(inProgressSnapshot), optionalAction: {
    type: "FUTURE_ACTION", gameId: 101, playerId: 101, stateVersion: 2,
  } };
  const action = buildActionViewModel({ snapshot, viewerPlayerId: 101, viewerPresent: true });
  assert.equal(action.kind, ACTION_KINDS.NONE);
  assert.equal(action.enabled, false);
});

for (const [field, value] of [["gameId", 999], ["stateVersion", 999], ["playerId", 102]]) {
  test(`optional action with mismatched ${field} exposes no unsafe action`, () => {
    const snapshot = decodedSnapshot(purchaseOptionalActionSnapshot);
    const optionalAction = { ...snapshot.optionalAction, [field]: value };
    const action = buildActionViewModel({
      snapshot: { ...snapshot, optionalAction },
      viewerPlayerId: 101,
      viewerPresent: true,
    });
    assert.equal(action.kind, ACTION_KINDS.NONE);
    assert.equal(action.enabled, false);
  });
}

test("pending command disables but does not erase action authority", () => {
  const action = gameModel(purchaseOptionalActionSnapshot, 101, {
    commandState: { pending: true },
  }).action;
  assert.equal(action.kind, ACTION_KINDS.PURCHASE_PROPERTY);
  assert.equal(action.authorized, true);
  assert.equal(action.pending, true);
  assert.equal(action.enabled, false);
});

test("missing viewer identity exposes no gameplay action", () => {
  const action = gameModel(inProgressSnapshot, null).action;
  assert.equal(action.kind, ACTION_KINDS.NONE);
  assert.equal(action.enabled, false);
});

test("string viewer identity is not coerced into membership", () => {
  const action = gameModel(inProgressSnapshot, "101").action;
  assert.equal(action.kind, ACTION_KINDS.NONE);
  assert.equal(action.enabled, false);
});

test("ordinary active turn presents the roll command", () => {
  const action = gameModel(inProgressSnapshot, 101).action;
  assert.equal(action.kind, ACTION_KINDS.ROLL);
  assert.equal(action.authorized, true);
  assert.equal(action.enabled, true);
});

test("jailed active player without an option may invoke roll to materialize the server choice", () => {
  const fixture = structuredClone(jailedPlayerSnapshot);
  fixture.optionalAction = null;
  const action = gameModel(fixture, 101).action;
  assert.equal(action.kind, ACTION_KINDS.ROLL);
  assert.equal(action.enabled, true);
});

test("non-declinable server option has no secondary action", () => {
  const fixture = structuredClone(purchaseOptionalActionSnapshot);
  fixture.optionalAction.declinable = false;
  const action = gameModel(fixture, 101).action;
  assert.equal(action.canDecline, false);
  assert.equal(action.secondaryLabel, null);
});

function propertyModels(snapshot, squareIds) {
  const ownership = deriveOwnershipProjection(snapshot);
  return buildPropertyViewModels({
    squareIds,
    ownership,
    viewerPlayerId: 101,
    activePlayerId: snapshot.playerTurn,
  });
}

test("property model identifies viewer ownership", () => {
  const property = propertyModels(decodedSnapshot(inProgressSnapshot), [1])[0];
  assert.equal(property.ownerPlayerId, 101);
  assert.equal(property.isOwnedByViewer, true);
});

test("property model identifies opponent ownership", () => {
  const property = propertyModels(decodedSnapshot(inProgressSnapshot), [3])[0];
  assert.equal(property.ownerPlayerId, 102);
  assert.equal(property.isOwnedByViewer, false);
});

test("property model represents an unowned supplied square", () => {
  const property = propertyModels(decodedSnapshot(inProgressSnapshot), [6])[0];
  assert.equal(property.isOwned, false);
  assert.equal(property.ownerPlayerId, null);
});

test("property model accepts only caller-supplied display metadata", () => {
  const snapshot = decodedSnapshot(inProgressSnapshot);
  const boardMetadata = buildBoardMetadataIndex(
    decodeBoardMetadata(createBoardMetadataPayload()),
  );
  const property = buildPropertyViewModels({
    squareIds: [1],
    ownership: deriveOwnershipProjection(snapshot),
    boardMetadata,
  })[0];
  assert.equal(property.name, "ΓΥΜΝΑΣΤΗΡΙΟ");
  assert.equal(property.type, "BROWN");
  assert.equal(property.purchasePrice, 101);
  assert.equal(property.baseRent, 2);
  assert.equal(property.group, "BROWN");
});

test("game view model accepts metadata without changing ownership authority", () => {
  const boardMetadata = buildBoardMetadataIndex(
    decodeBoardMetadata(createBoardMetadataPayload()),
  );
  const model = gameModel(inProgressSnapshot, 101, { boardMetadata });

  assert.equal(model.properties[0].name, "ΓΥΜΝΑΣΤΗΡΙΟ");
  assert.equal(model.properties[0].ownerPlayerId, 101);
  assert.equal(model.properties[0].purchasePrice, 101);
});

test("conflicting ownership remains unresolved", () => {
  const fixture = structuredClone(inProgressSnapshot);
  fixture.players[1].properties = [1, 3];
  const snapshot = decodedSnapshot(fixture);
  const ownership = deriveOwnershipProjection(snapshot);
  const property = buildPropertyViewModels({ squareIds: [1], ownership, viewerPlayerId: 101 })[0];
  assert.equal(ownership.isValid, false);
  assert.equal(property.ownerPlayerId, null);
  assert.equal(property.isOwned, false);
});

test("completion formats the supplied authoritative result without recalculating it", () => {
  const completion = gameModel(endedGameSnapshot).completion;
  assert.deepEqual(completion, {
    completed: true,
    available: true,
    winnerPlayerId: 101,
    winnerName: "BaselineHost",
    statusText: "Το παιχνίδι ολοκληρώθηκε. Κέρδισε: BaselineHost",
    standings: [
      {
        playerId: 101, nickname: "BaselineHost", cash: 5000, cashText: "5.000€",
        propertyValue: 250, propertyValueText: "250€", totalValue: 5250,
        totalValueText: "5.250€", rank: 1, rankText: "1η θέση", winner: true,
      },
      {
        playerId: 102, nickname: "BaselineGuest", cash: 1560, cashText: "1.560€",
        propertyValue: 120, propertyValueText: "120€", totalValue: 1680,
        totalValueText: "1.680€", rank: 2, rankText: "2η θέση", winner: false,
      },
    ],
  });
});

test("completion preserves the backend-supplied order and values", () => {
  const completion = gameModel(endedGameSnapshot).completion;
  assert.deepEqual(completion.standings.map(row => row.playerId), [101, 102]);
  assert.equal(completion.standings[0].totalValue, 5250);
  assert.equal(completion.standings[0].propertyValue, 250);
  assert.equal(Object.isFrozen(completion.standings), true);
  assert.equal(Object.isFrozen(completion.standings[0]), true);
});

test("completion navigation accepts only the supplied immutable presentation model", () => {
  const completion = gameModel(endedGameSnapshot).completion;
  const routed = readCompletionNavigationState({ completion });
  assert.deepEqual(routed, completion);
  assert.notEqual(routed, completion);
  assert.equal(Object.isFrozen(routed.standings), true);
  assert.equal(readCompletionNavigationState(null), null);
  assert.equal(readCompletionNavigationState({ completion: { ...completion, standings: [] } }), null);
});

const playerName = id => ({ 101: "BaselineHost", 102: "BaselineGuest" }[id] ?? null);
const squareName = id => ({ 1: "ΓΥΜΝΑΣΤΗΡΙΟ", 2: "ΚΑΡΤΑ ΑΠΟΦΑΣΗΣ", 6: "ΣΤΑΣΗ ΔΙΠΑΕ" }[id] ?? `#${id}`);
const eventModel = (fixture, viewerPlayerId) => buildEventViewModel({
  event: decodedEvent(fixture), viewerPlayerId, playerName, squareName,
});

test("event model uses viewer-relative roll copy", () => {
  assert.match(eventModel(turnUpdatedEvent, 101).text, /^Έφερες 6\./);
});

test("dice presentation preserves the authoritative pair and transition identity", () => {
  const model = buildDicePresentationModel({
    die1: 2, die2: 4, total: 6, presentationId: 12,
  });
  assert.deepEqual(model, { die1: 2, die2: 4, total: 6, presentationId: 12 });
  assert.equal(Object.isFrozen(model), true);
  assert.equal(buildDicePresentationModel({
    die1: 2, die2: 4, total: 7, presentationId: 12,
  }), null);
});

test("observer event model exposes the same confirmed dice presentation", () => {
  assert.deepEqual(eventModel(turnUpdatedEvent, 102).dice, {
    die1: 2,
    die2: 4,
    total: 6,
    presentationId: turnUpdatedEvent.stateVersion,
  });
});

test("event model uses third-person roll copy", () => {
  assert.match(eventModel(turnUpdatedEvent, 102).text, /^BaselineHost: έφερε 6\./);
});

test("event model presents rent facts", () => {
  const model = eventModel(rentEvent, 102);
  assert.match(model.text, /BaselineHost: πλήρωσε 100€ για ενοίκιο σε BaselineGuest/);
  assert.equal(model.emphasis, "negative");
  assert.deepEqual(model.feedback, {
    kind: "RENT",
    title: "Πληρωμή ενοικίου",
    body: "BaselineHost: πλήρωσε 100€ για ενοίκιο σε BaselineGuest.",
    tone: "negative",
    surface: "contextual",
  });
});

test("event model maps tax into contextual payment feedback", () => {
  const model = eventModel(taxEvent, 102);
  assert.equal(model.feedback.kind, "TAX");
  assert.equal(model.feedback.title, "Πληρωμή φόρου");
  assert.match(model.feedback.body, /BaselineHost: πλήρωσε φόρο 200€/);
  assert.equal(model.feedback.surface, "contextual");
});

test("event model presents a confirmed Community Chest card in the card surface", () => {
  const model = eventModel(cardEvent, 102);
  assert.match(model.text, /Έληξε η κάρτα του ΟΑΣΘ\. Πλήρωσε €50\./);
  assert.equal(model.emphasis, "highlight");
  assert.equal(model.feedback.kind, "CARD");
  assert.equal(model.feedback.surface, "card");
  assert.deepEqual(model.feedback.card, {
    accent: "community",
    category: "Κάρτα γεγονότος",
    title: "ΚΑΡΤΑ ΑΠΟΦΑΣΗΣ",
    body: "Έληξε η κάρτα του ΟΑΣΘ. Πλήρωσε €50.",
    effectSummary: "Μετρητά: -50€",
  });
});

test("event model gives a confirmed Chance card its resolved transport destination", () => {
  const fixture = structuredClone(turnUpdatedEvent);
  fixture.payload.details = [
    { type: "PLAYER_MOVED", fromPosition: 7, toPosition: 6 },
    {
      type: "CARD_DRAWN", squareId: 7, amount: 6,
      card: { cardId: 1, title: "Chance", text: "Πήγαινε στη ΣΤΑΣΗ ΔΙΠΑΕ.", effect: "transport", amount: 6 },
    },
  ];
  const model = eventModel(fixture, 101);
  assert.deepEqual(model.feedback.card, {
    accent: "chance",
    category: "Κάρτα γεγονότος",
    title: "ΚΑΡΤΑ ΕΝΤΟΛΗΣ",
    body: "Πήγαινε στη ΣΤΑΣΗ ΔΙΠΑΕ.",
    effectSummary: "Μετακίνηση: ΣΤΑΣΗ ΔΙΠΑΕ",
  });
});

test("event model keeps a confirmed Start passage alongside its card effect", () => {
  const fixture = structuredClone(cardEvent);
  fixture.payload.details.push({ type: "MONEY_RECEIVED", amount: 200 });
  const model = eventModel(fixture, 101);
  assert.match(model.feedback.card.effectSummary, /Μετρητά: -50€/);
  assert.match(model.feedback.card.effectSummary, /Πέρασμα από την ΑΦΕΤΗΡΙΑ/);
});

test("event model keeps unknown decoded cards on the generic safe fallback", () => {
  const fixture = structuredClone(cardEvent);
  fixture.payload.details.find(detail => detail.type === "CARD_DRAWN").card = {
    cardId: 99, title: "Future deck", text: "Μελλοντικό αποτέλεσμα.", effect: "future", amount: 0,
  };
  const model = eventModel(fixture, 101);
  assert.equal(model.feedback.surface, "contextual");
  assert.equal(model.feedback.title, "Εξέλιξη παιχνιδιού");
  assert.equal(model.feedback.card, undefined);
});

test("event model presents timeout facts", () => {
  const model = eventModel(turnTimeoutEvent, 102);
  assert.equal(model.text, "BaselineHost: ο χρόνος έληξε.");
  assert.equal(model.emphasis, "warning");
  assert.deepEqual(model.feedback, {
    kind: "TURN_TIMEOUT",
    title: "Λήξη χρόνου",
    body: "BaselineHost: ο χρόνος έληξε.",
    tone: "warning",
    surface: "contextual",
  });
});

test("ordinary landing remains a lightweight toast", () => {
  const model = eventModel(turnUpdatedEvent, 102);
  assert.equal(model.feedback.surface, "toast");
  assert.equal(model.feedback.body, model.text);
});

test("purchase success uses confirmed buyer, square and price", () => {
  const fixture = structuredClone(turnUpdatedEvent);
  fixture.eventId = "00000000-0000-4000-8000-000000000006";
  fixture.stateVersion = 10;
  fixture.payload.details = [
    { type: "PROPERTY_PURCHASED", squareId: 6, amount: 100 },
    { type: "TURN_CHANGED", nextPlayerId: 102 },
  ];
  const model = eventModel(fixture, 102);

  assert.equal(model.feedback.kind, "PURCHASE");
  assert.equal(model.feedback.title, "Νέα ιδιοκτησία");
  assert.equal(model.feedback.body, "BaselineHost αγόρασε: ΣΤΑΣΗ ΔΙΠΑΕ, 100€.");
  assert.equal(model.feedback.tone, "positive");
  assert.equal(model.feedback.surface, "contextual");
});

test("START reward uses the authoritative amount", () => {
  const fixture = structuredClone(turnUpdatedEvent);
  fixture.eventId = "00000000-0000-4000-8000-000000000007";
  fixture.stateVersion = 11;
  fixture.payload.details = [
    { type: "MONEY_RECEIVED", amount: 200 },
    { type: "TURN_CHANGED", nextPlayerId: 102 },
  ];
  const model = eventModel(fixture, 102);

  assert.equal(model.feedback.kind, "START_REWARD");
  assert.equal(model.feedback.title, "Πέρασμα από την ΑΦΕΤΗΡΙΑ");
  assert.match(model.feedback.body, /BaselineHost: πέρασε από την ΑΦΕΤΗΡΙΑ και έλαβε 200€/);
  assert.equal(model.feedback.tone, "positive");
});

test("unsupported event is not presentable", () => {
  const event = { ...decodedEvent(turnUpdatedEvent), unsupported: {
    eventType: "FUTURE", reason: null, detailTypes: [],
  } };
  assert.equal(buildEventViewModel({ event, viewerPlayerId: 101, playerName, squareName }), null);
});

test("connected connection model is command-capable", () => {
  const model = buildConnectionViewModel(CONNECTION_STATES.CONNECTED);
  assert.equal(model.semanticStatus, "ready");
  assert.equal(model.canSubmitCommands, true);
});

test("reconnecting connection model is safely disabled", () => {
  const model = buildConnectionViewModel(CONNECTION_STATES.RECONNECTING);
  assert.equal(model.text, "Γίνεται επανασύνδεση…");
  assert.equal(model.canSubmitCommands, false);
});

test("offline connection model is safely disabled", () => {
  const model = buildConnectionViewModel(CONNECTION_STATES.OFFLINE);
  assert.equal(model.text, "Η σύνδεση χάθηκε.");
  assert.equal(model.canSubmitCommands, false);
});

test("offline explicit input disables an otherwise authorized action", () => {
  const model = gameModel(inProgressSnapshot, 101, { connectionState: CONNECTION_STATES.OFFLINE });
  assert.equal(model.action.kind, ACTION_KINDS.ROLL);
  assert.equal(model.action.authorized, true);
  assert.equal(model.action.enabled, false);
});

test("game presentation does not mutate the snapshot", () => {
  const snapshot = decodedSnapshot(inProgressSnapshot);
  const before = structuredClone(snapshot);
  buildGameViewModel({ snapshot, viewerPlayerId: 101, ownership: deriveOwnershipProjection(snapshot) });
  assert.deepEqual(snapshot, before);
});

test("property presentation does not mutate the ownership projection", () => {
  const snapshot = decodedSnapshot(inProgressSnapshot);
  const ownership = deriveOwnershipProjection(snapshot);
  const before = structuredClone(ownership);
  buildPropertyViewModels({ squareIds: [1, 3, 6], ownership, viewerPlayerId: 101 });
  assert.deepEqual(ownership, before);
});

test("event presentation does not mutate the decoded event", () => {
  const event = decodedEvent(cardEvent);
  const before = structuredClone(event);
  buildEventViewModel({ event, viewerPlayerId: 101, playerName, squareName });
  assert.deepEqual(event, before);
});
