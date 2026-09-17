import test from "node:test";
import assert from "node:assert/strict";
import {
  ACTION_KINDS,
  TURN_STATES,
  buildActionViewModel,
  buildGameViewModel,
  buildPropertyViewModels,
} from "../features/game/presentation/gameViewModel.js";
import {
  CONNECTION_STATES,
  buildConnectionViewModel,
} from "../features/game/presentation/connectionViewModel.js";
import { buildEventViewModel } from "../features/game/presentation/eventViewModel.js";
import { buildDicePresentationModel } from "../features/game/presentation/dicePresentationModel.js";
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
  turnTimeoutEvent,
  turnUpdatedEvent,
} from "../test-fixtures/gameRealtimeFixtures.js";

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
  const property = buildPropertyViewModels({
    squareIds: [1],
    ownership: deriveOwnershipProjection(snapshot),
    namesBySquareId: { 1: "ΓΥΜΝΑΣΤΗΡΙΟ" },
  })[0];
  assert.equal(property.name, "ΓΥΜΝΑΣΤΗΡΙΟ");
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

test("completion exposes only the authoritative winner", () => {
  const completion = gameModel(endedGameSnapshot).completion;
  assert.deepEqual(completion, {
    completed: true,
    winnerPlayerId: 101,
    winnerName: "BaselineHost",
    statusText: "Το παιχνίδι ολοκληρώθηκε. Κέρδισε: BaselineHost",
  });
});

test("completion model has no client capital or ranking projection", () => {
  const completion = gameModel(endedGameSnapshot).completion;
  assert.equal("capital" in completion, false);
  assert.equal("ranking" in completion, false);
  assert.equal("propertyValue" in completion, false);
});

test("completion does not invent a fallback winner", () => {
  const fixture = structuredClone(endedGameSnapshot);
  fixture.winner = 999;
  const completion = gameModel(fixture).completion;
  assert.equal(completion.winnerPlayerId, 999);
  assert.equal(completion.winnerName, null);
  assert.equal(completion.statusText, "Το παιχνίδι ολοκληρώθηκε");
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
});

test("event model preserves server card content", () => {
  const model = eventModel(cardEvent, 102);
  assert.match(model.text, /Έληξε η κάρτα του ΟΑΣΘ\. Πλήρωσε €50\./);
  assert.equal(model.emphasis, "highlight");
});

test("event model presents timeout facts", () => {
  const model = eventModel(turnTimeoutEvent, 102);
  assert.equal(model.text, "BaselineHost: ο χρόνος έληξε.");
  assert.equal(model.emphasis, "warning");
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
