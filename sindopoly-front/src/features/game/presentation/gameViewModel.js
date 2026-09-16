import {
  GAMEPLAY_CONTENT,
  GAME_EVENT_FACT_TYPES,
  CONNECTION_CONTENT,
  contentForTransportError,
  formatCurrentTurn,
  formatGameEventFact,
  formatJailPaymentAction,
  formatMoney,
  formatPlayingNow,
  formatPurchaseAction,
  formatWaitingForPlayer,
} from "../content/el.js";
import {
  deriveOwnershipProjection,
  propertyIdsForPlayer,
} from "../../../apis/ownershipProjection.js";
import { buildConnectionViewModel } from "./connectionViewModel.js";

const SNAPSHOT_STATUSES = new Set(["lobby", "inProgress", "ended"]);

export const TURN_STATES = Object.freeze({
  OWN_TURN: "OWN_TURN",
  OTHER_PLAYER_TURN: "OTHER_PLAYER_TURN",
  NO_ACTIVE_PLAYER: "NO_ACTIVE_PLAYER",
  GAME_COMPLETE: "GAME_COMPLETE",
});

export const ACTION_KINDS = Object.freeze({
  ROLL: "ROLL",
  PURCHASE_PROPERTY: "PURCHASE_PROPERTY",
  PAY_JAIL_EXIT: "PAY_JAIL_EXIT",
  WAITING: "WAITING",
  NONE: "NONE",
});

/** Builds immutable UI facts from one already accepted snapshot. */
export function buildGameViewModel({
  snapshot,
  viewerPlayerId,
  ownership = null,
  commandState = null,
  connectionState = null,
} = {}) {
  if (!isSnapshotShape(snapshot)) return null;

  const safeViewerId = isPlayerId(viewerPlayerId) ? viewerPlayerId : null;
  const resolvedOwnership = ownership ?? deriveOwnershipProjection(snapshot);
  const players = buildPlayerViewModels({
    snapshot,
    viewerPlayerId: safeViewerId,
    ownership: resolvedOwnership,
  });
  const playersById = new Map(players.map(player => [player.playerId, player]));
  const viewerPlayer = playersById.get(safeViewerId) ?? null;
  const activePlayer = playersById.get(snapshot.playerTurn) ?? null;
  const connection = buildConnectionViewModel(connectionState);
  const turn = buildTurnViewModel({
    snapshot,
    viewerPlayerId: safeViewerId,
    viewerPresent: viewerPlayer != null,
    activePlayer,
  });
  const action = buildActionViewModel({
    snapshot,
    viewerPlayerId: safeViewerId,
    viewerPresent: viewerPlayer != null,
    activePlayerName: activePlayer?.nickname ?? null,
    commandState,
    connection,
  });
  const squareIds = Object.keys(resolvedOwnership?.ownerBySquareId ?? {})
    .map(Number)
    .filter(isSquareId)
    .sort((left, right) => left - right);

  return Object.freeze({
    gameId: snapshot.gameId,
    stateVersion: snapshot.stateVersion,
    status: snapshot.status,
    viewer: Object.freeze({
      playerId: safeViewerId,
      present: viewerPlayer != null,
      readOnly: viewerPlayer == null,
      player: viewerPlayer,
    }),
    activePlayer,
    isViewerTurn: turn.state === TURN_STATES.OWN_TURN,
    players,
    turn,
    action,
    properties: buildPropertyViewModels({
      squareIds,
      ownership: resolvedOwnership,
      viewerPlayerId: safeViewerId,
      activePlayerId: activePlayer?.playerId ?? null,
    }),
    completion: buildCompletionViewModel(snapshot, playersById),
    connection,
  });
}

export function buildPlayerViewModels({ snapshot, viewerPlayerId, ownership } = {}) {
  if (!Array.isArray(snapshot?.players)) return Object.freeze([]);
  return Object.freeze(snapshot.players.map(player => {
    const propertyIds = propertyIdsForPlayer(ownership, player.playerId);
    return Object.freeze({
      playerId: player.playerId,
      nickname: player.nickname,
      isSelf: player.playerId === viewerPlayerId,
      isActive: player.playerId === snapshot.playerTurn,
      position: player.position,
      money: player.money,
      moneyText: formatMoney(player.money),
      propertyIds,
      propertyCount: propertyIds.length,
      jailed: player.jailed,
      jailTurnsRemaining: player.jailTurnsRemaining,
      bankrupt: player.bankrupt,
      afk: player.afk,
    });
  }));
}

export function buildTurnViewModel({
  snapshot,
  viewerPlayerId,
  viewerPresent,
  activePlayer,
} = {}) {
  if (snapshot?.status === "ended") {
    return turnModel(TURN_STATES.GAME_COMPLETE, snapshot.playerTurn, activePlayer, false,
      GAMEPLAY_CONTENT.gameCompleted, null, snapshot.turnDeadlineEpochMs);
  }
  if (snapshot?.status !== "inProgress" || !activePlayer) {
    return turnModel(TURN_STATES.NO_ACTIVE_PLAYER, null, null, false,
      formatWaitingForPlayer(), formatWaitingForPlayer(), snapshot?.turnDeadlineEpochMs ?? null);
  }
  if (viewerPresent && viewerPlayerId === activePlayer.playerId) {
    return turnModel(TURN_STATES.OWN_TURN, activePlayer.playerId, activePlayer, true,
      formatCurrentTurn(), null, snapshot.turnDeadlineEpochMs);
  }
  return turnModel(TURN_STATES.OTHER_PLAYER_TURN, activePlayer.playerId, activePlayer, false,
    formatPlayingNow(activePlayer.nickname), formatWaitingForPlayer(activePlayer.nickname),
    snapshot.turnDeadlineEpochMs);
}

export function buildActionViewModel({
  snapshot,
  viewerPlayerId,
  viewerPresent,
  activePlayerName = null,
  commandState = null,
  connection = null,
} = {}) {
  const pending = Boolean(commandState?.pending);
  const error = commandState?.errorCode
    ? contentForTransportError(commandState.errorCode) : null;
  const available = !pending && (connection?.canSubmitCommands ?? true);

  if (snapshot?.status !== "inProgress" || !viewerPresent || !isPlayerId(viewerPlayerId)) {
    return actionModel(ACTION_KINDS.NONE, false, false, pending, null, null, error);
  }
  if (snapshot.playerTurn !== viewerPlayerId) {
    return actionModel(
      ACTION_KINDS.WAITING,
      false,
      false,
      pending,
      null,
      hasText(activePlayerName) ? formatWaitingForPlayer(activePlayerName) : null,
      error,
    );
  }

  const optionalAction = snapshot.optionalAction;
  if (optionalAction != null) {
    // Active-turn coincidence is insufficient; the server option must identify this exact state and viewer.
    const exactOwner = optionalAction.gameId === snapshot.gameId
      && optionalAction.stateVersion === snapshot.stateVersion
      && optionalAction.playerId === viewerPlayerId;
    if (!exactOwner) {
      return actionModel(ACTION_KINDS.NONE, false, false, pending, null, null, error);
    }
    if (optionalAction.type === ACTION_KINDS.PURCHASE_PROPERTY) {
      const canDecline = optionalAction.declinable === true;
      return Object.freeze({
        ...actionModel(
          ACTION_KINDS.PURCHASE_PROPERTY,
          true,
          available,
          pending,
          formatPurchaseAction(optionalAction.cost),
          pending ? CONNECTION_CONTENT.commandPending : null,
          error,
        ),
        propertyId: optionalAction.squareId,
        cost: optionalAction.cost,
        costText: formatMoney(optionalAction.cost),
        canDecline,
        secondaryLabel: canDecline ? GAMEPLAY_CONTENT.declinePurchase : null,
      });
    }
    if (optionalAction.type === ACTION_KINDS.PAY_JAIL_EXIT) {
      const canDecline = optionalAction.declinable === true;
      return Object.freeze({
        ...actionModel(
          ACTION_KINDS.PAY_JAIL_EXIT,
          true,
          available,
          pending,
          formatJailPaymentAction(optionalAction.cost),
          pending ? CONNECTION_CONTENT.commandPending : null,
          error,
        ),
        propertyId: null,
        cost: optionalAction.cost,
        costText: formatMoney(optionalAction.cost),
        canDecline,
        secondaryLabel: canDecline ? GAMEPLAY_CONTENT.skipTurn : null,
      });
    }
    return actionModel(ACTION_KINDS.NONE, false, false, pending, null, null, error);
  }

  // The current server roll command requires an active in-progress turn with no pending option.
  return Object.freeze({
    ...actionModel(
      ACTION_KINDS.ROLL,
      true,
      available,
      pending,
      pending ? GAMEPLAY_CONTENT.rolling : GAMEPLAY_CONTENT.roll,
      pending ? CONNECTION_CONTENT.commandPending : null,
      error,
    ),
    propertyId: null,
    cost: null,
    costText: null,
    canDecline: false,
    secondaryLabel: null,
  });
}

export function buildPropertyViewModels({
  squareIds = [],
  ownership,
  viewerPlayerId = null,
  activePlayerId = null,
  namesBySquareId = null,
} = {}) {
  if (!Array.isArray(squareIds)) return Object.freeze([]);
  const uniqueIds = [...new Set(squareIds.filter(isSquareId))];
  return Object.freeze(uniqueIds.map(squareId => {
    const owner = ownership?.ownerBySquareId?.[squareId] ?? null;
    return Object.freeze({
      squareId,
      name: hasText(namesBySquareId?.[squareId]) ? namesBySquareId[squareId] : null,
      isOwned: owner != null,
      ownerPlayerId: owner?.playerId ?? null,
      ownerName: owner?.nickname ?? null,
      isOwnedByViewer: owner?.playerId === viewerPlayerId,
      isOwnedByActivePlayer: owner?.playerId === activePlayerId,
    });
  }));
}

function buildCompletionViewModel(snapshot, playersById) {
  if (snapshot.status !== "ended") {
    return Object.freeze({
      completed: false,
      winnerPlayerId: null,
      winnerName: null,
      statusText: null,
    });
  }
  const winnerName = playersById.get(snapshot.winner)?.nickname ?? null;
  return Object.freeze({
    completed: true,
    winnerPlayerId: snapshot.winner,
    winnerName,
    statusText: formatGameEventFact({
      type: GAME_EVENT_FACT_TYPES.COMPLETION,
      winnerName,
    }),
  });
}

function turnModel(
  state,
  activePlayerId,
  activePlayer,
  canShowActions,
  statusText,
  waitingText,
  turnDeadlineEpochMs,
) {
  return Object.freeze({
    state,
    activePlayerId,
    activePlayerName: activePlayer?.nickname ?? null,
    statusText,
    waitingText,
    canShowActions,
    turnDeadlineEpochMs,
  });
}

function actionModel(kind, authorized, enabled, pending, primaryLabel, statusText, error) {
  return Object.freeze({
    kind,
    authorized,
    enabled,
    pending,
    primaryLabel,
    statusText,
    error,
  });
}

function isSnapshotShape(snapshot) {
  return snapshot != null
    && typeof snapshot === "object"
    && isPlayerId(snapshot.gameId)
    && Number.isSafeInteger(snapshot.stateVersion)
    && snapshot.stateVersion >= 0
    && SNAPSHOT_STATUSES.has(snapshot.status)
    && Array.isArray(snapshot.players);
}

function isPlayerId(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function isSquareId(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}
