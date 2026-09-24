import {
  GAMEPLAY_CONTENT,
  GAME_EVENT_FACT_TYPES,
  CONNECTION_CONTENT,
  contentForTransportError,
  formatCurrentTurn,
  formatGameEventFact,
  formatJailPaymentAction,
  formatMoney,
  formatRank,
  formatPlayingNow,
  formatPurchaseAction,
  formatWaitingForPlayer,
} from "../content/el.js";
import {
  deriveOwnershipProjection,
  propertyIdsForPlayer,
} from "../../../apis/ownershipProjection.js";
import { buildConnectionViewModel } from "./connectionViewModel.js";
import { getSquareMetadata } from "../board/boardMetadata.js";

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
  boardMetadata = null,
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
    boardMetadata,
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
      boardMetadata,
    }),
    completion: buildCompletionViewModel(snapshot),
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
  boardMetadata = null,
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
      // Square metadata is already loaded for the board; reuse it as display context only.
      const propertyName = getSquareMetadata(boardMetadata, optionalAction.squareId)?.name ?? null;
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
        propertyName,
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
  boardMetadata = null,
} = {}) {
  if (!Array.isArray(squareIds)) return Object.freeze([]);
  const uniqueIds = [...new Set(squareIds.filter(isSquareId))];
  return Object.freeze(uniqueIds.map(squareId => {
    const owner = ownership?.ownerBySquareId?.[squareId] ?? null;
    const metadata = getSquareMetadata(boardMetadata, squareId);
    return Object.freeze({
      squareId,
      name: hasText(metadata?.name) ? metadata.name : null,
      type: metadata?.type ?? null,
      purchasePrice: metadata?.property?.purchasePrice ?? null,
      baseRent: metadata?.property?.baseRent ?? null,
      group: metadata?.property?.group ?? null,
      isOwned: owner != null,
      ownerPlayerId: owner?.playerId ?? null,
      ownerName: owner?.nickname ?? null,
      isOwnedByViewer: owner?.playerId === viewerPlayerId,
      isOwnedByActivePlayer: owner?.playerId === activePlayerId,
    });
  }));
}

export function buildCompletionViewModel(snapshot) {
  if (snapshot.status !== "ended") {
    return Object.freeze({
      completed: false,
      available: false,
      winnerPlayerId: null,
      winnerName: null,
      statusText: null,
      standings: Object.freeze([]),
    });
  }
  const result = snapshot.finalResult;
  if (!result || result.winnerPlayerId !== snapshot.winner || !Array.isArray(result.standings)) {
    return Object.freeze({
      completed: true,
      available: false,
      winnerPlayerId: snapshot.winner,
      winnerName: null,
      statusText: GAMEPLAY_CONTENT.gameCompleted,
      standings: Object.freeze([]),
    });
  }
  const standings = Object.freeze(result.standings.map(standing => Object.freeze({
    playerId: standing.playerId,
    nickname: standing.nickname,
    cash: standing.cash,
    cashText: formatMoney(standing.cash),
    propertyValue: standing.propertyValue,
    propertyValueText: formatMoney(standing.propertyValue),
    totalValue: standing.totalValue,
    totalValueText: formatMoney(standing.totalValue),
    rank: standing.rank,
    rankText: formatRank(standing.rank),
    winner: standing.winner,
  })));
  const winnerName = standings.find(standing => standing.winner)?.nickname ?? null;
  return Object.freeze({
    completed: true,
    available: true,
    winnerPlayerId: result.winnerPlayerId,
    winnerName,
    statusText: formatGameEventFact({
      type: GAME_EVENT_FACT_TYPES.COMPLETION,
      winnerName,
    }),
    standings,
  });
}

/** Defensively copies the already formatted route state; it never reconstructs result values. */
export function readCompletionNavigationState(state) {
  const completion = state?.completion;
  if (!completion?.completed || !completion.available || !Array.isArray(completion.standings)
      || !Number.isSafeInteger(completion.winnerPlayerId)) return null;
  const standings = completion.standings.map(standing => {
    if (!Number.isSafeInteger(standing?.playerId) || typeof standing.nickname !== "string"
        || !Number.isSafeInteger(standing.cash) || typeof standing.cashText !== "string"
        || !Number.isSafeInteger(standing.propertyValue) || typeof standing.propertyValueText !== "string"
        || !Number.isSafeInteger(standing.totalValue) || typeof standing.totalValueText !== "string"
        || !Number.isSafeInteger(standing.rank) || typeof standing.rankText !== "string"
        || typeof standing.winner !== "boolean") return null;
    return Object.freeze({ ...standing });
  });
  if (standings.some(standing => standing == null)
      || standings.filter(standing => standing.winner).length !== 1
      || !standings.some(standing => standing.winner
        && standing.playerId === completion.winnerPlayerId)) return null;
  return Object.freeze({ ...completion, standings: Object.freeze(standings) });
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
