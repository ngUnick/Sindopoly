import { deriveOwnershipProjection } from "../../../apis/ownershipProjection.js";
import { createSnapshotSynchronizer } from "../../../apis/realtimeSync.js";
import { buildBoardMetadataIndex, getSquareMetadata } from "../board/boardMetadata.js";
import {
  GAME_CONTROLLER_ACTIONS,
  GAME_COMMAND_STATUS,
  GAME_CONNECTION_STATUS,
  canSubmitGameCommand,
  createGameControllerState,
  gameControllerReducer,
} from "./gameControllerReducer.js";
import {
  applyEventToHistory,
  createEventHistoryState,
  markEventHistoryGap,
} from "../presentation/eventHistory.js";
import { buildEventViewModel } from "../presentation/eventViewModel.js";
import { ACTION_KINDS, buildGameViewModel } from "../presentation/gameViewModel.js";
import {
  PRESENTATION_RESULTS,
  PresentationCoordinator,
} from "../presentation/PresentationCoordinator.js";
import {
  MOVEMENT_MODES,
  PRESENTATION_PHASES,
} from "../presentation/presentationTransaction.js";
import {
  GAMEPLAY_CONTENT,
  formatJailExitOffer,
  formatLandingOutcome,
  formatMoney,
  formatPurchaseOffer,
  formatRentOutcome,
  formatStartPassOutcome,
  formatTaxOutcome,
  formatTurnDestination,
  formatTurnMoney,
} from "../content/el.js";

const POLL_INTERVAL_MS = 15_000;
const BUSY_COMMAND_STATUSES = new Set([
  GAME_COMMAND_STATUS.PENDING,
  GAME_COMMAND_STATUS.AWAITING_SNAPSHOT,
  GAME_COMMAND_STATUS.STALE,
  GAME_COMMAND_STATUS.BLOCKED,
]);
const UNSAFE_CONNECTION_STATUSES = new Set([
  GAME_CONNECTION_STATUS.DEGRADED,
  GAME_CONNECTION_STATUS.RECONNECTING,
  GAME_CONNECTION_STATUS.OFFLINE,
]);

/**
 * Owns one mounted game's accepted-state, command, recovery and presentation
 * lifecycles. All gameplay truth still arrives through decoded server facts.
 */
export class AuthoritativeGameRuntime {
  constructor({
    gameId,
    viewerPlayerId,
    scene,
    fetchSnapshot,
    fetchBoardMetadata,
    createRealtime,
    commands,
    createCommandId = () => globalThis.crypto.randomUUID(),
    setPollInterval = (callback, milliseconds) => globalThis.setInterval(callback, milliseconds),
    clearPollInterval = handle => globalThis.clearInterval(handle),
    reducedMotion = false,
    onDiagnostic = () => {},
  } = {}) {
    if (!isPositiveInteger(gameId) || !isPositiveInteger(viewerPlayerId)) {
      throw new TypeError("gameId and viewerPlayerId must be positive safe integers");
    }
    if (typeof fetchSnapshot !== "function"
        || typeof fetchBoardMetadata !== "function"
        || typeof createRealtime !== "function") {
      throw new TypeError("authoritative game gateways are required");
    }

    this.gameId = gameId;
    this.viewerPlayerId = viewerPlayerId;
    this.scene = scene ?? {};
    this.fetchSnapshot = fetchSnapshot;
    this.fetchBoardMetadata = fetchBoardMetadata;
    this.createRealtime = createRealtime;
    this.commands = commands ?? {};
    this.createCommandId = createCommandId;
    this.setPollInterval = setPollInterval;
    this.clearPollInterval = clearPollInterval;
    this.onDiagnostic = onDiagnostic;

    this.controller = createGameControllerState(gameId);
    this.metadataIndex = null;
    this.metadataStatus = "LOADING";
    this.metadataError = null;
    this.history = createEventHistoryState(gameId);
    this.outcome = null;
    this.presentationPhase = PRESENTATION_PHASES.IDLE;
    this.lastPresentationVersion = -1;
    this.started = false;
    this.disposed = false;
    this.hasConnected = false;
    this.listeners = new Set();
    this.realtime = null;
    this.pollHandle = null;

    this.presentation = new PresentationCoordinator({
      scene: this.scene,
      reducedMotion,
      presentOutcome: (outcome, identity) => {
        if (this.disposed) return false;
        this.outcome = Object.freeze({ ...outcome, presentationId: identity.presentationId });
        this.publish();
        return true;
      },
      cancelOutcome: presentationId => {
        if (this.outcome?.presentationId === presentationId) {
          this.outcome = null;
          this.publish();
        }
      },
      onPhaseChanged: phase => {
        if (this.disposed) return;
        this.presentationPhase = phase;
        this.publish();
      },
      onFailure: failure => this.report(failure),
    });

    this.synchronizer = createSnapshotSynchronizer({
      gameId,
      currentVersion: () => this.controller.acceptedVersion,
      fetchSnapshot: () => this.fetchSnapshot(this.gameId),
      applySnapshot: (_id, snapshot) => this.acceptSnapshot(snapshot),
    });
    this.publicState = this.buildPublicState();
  }

  getState() {
    return this.publicState;
  }

  subscribe(listener) {
    if (typeof listener !== "function" || this.disposed) return () => {};
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start() {
    if (this.started || this.disposed) return false;
    this.started = true;
    void this.loadMetadata();
    this.realtime = this.createRealtime({
      gameId: this.gameId,
      onSubscribed: () => this.handleSubscribed(),
      onEvent: event => this.handleRealtimeEvent(event),
      onConnectionChanged: status => this.handleConnectionChanged(status),
      onDiagnostic: diagnostic => this.report(diagnostic),
    });
    this.realtime?.start?.();
    this.pollHandle = this.setPollInterval(
      () => this.pollWhenDisconnected(),
      POLL_INTERVAL_MS,
    );
    return true;
  }

  /** Accepts decoded snapshots exclusively through FE-REVAMP-012 monotonicity. */
  acceptSnapshot(snapshot) {
    if (this.disposed) return false;
    const previous = this.controller;
    const next = gameControllerReducer(previous, {
      type: GAME_CONTROLLER_ACTIONS.SNAPSHOT_ACCEPTED,
      snapshot,
    });
    if (next === previous) return false;

    const previousVersion = previous.acceptedVersion;
    const recovering = previous.recovery.required
      || UNSAFE_CONNECTION_STATUSES.has(previous.connection.status);
    this.controller = next;

    if (previous.snapshot == null) {
      this.scene.setPawnPositions?.(snapshot.players);
      const viewer = snapshot.players.find(player => player.playerId === this.viewerPlayerId);
      if (viewer) this.scene.orientCameraForPosition?.(viewer.position);
    } else if (snapshot.status === "ended") {
      this.presentation.cancel();
    } else if (recovering
        || snapshot.stateVersion > previousVersion
          && snapshot.stateVersion > this.lastPresentationVersion) {
      void this.recoverScene(snapshot);
    }

    this.publish();
    return true;
  }

  async primaryAction() {
    const action = this.publicState.viewModel?.action;
    if (action?.kind === ACTION_KINDS.ROLL) {
      const player = this.controller.snapshot?.players
        .find(candidate => candidate.playerId === this.viewerPlayerId);
      return this.executeCommand(
        command => this.commands.roll?.(this.gameId, this.viewerPlayerId, command),
        result => this.presentRollResult(result, player?.position ?? null),
      );
    }
    if ([ACTION_KINDS.PURCHASE_PROPERTY, ACTION_KINDS.PAY_JAIL_EXIT].includes(action?.kind)) {
      return this.executeCommand(
        command => this.commands.resolve?.(this.gameId, this.viewerPlayerId, true, command),
      );
    }
    return false;
  }

  async secondaryAction() {
    const action = this.publicState.viewModel?.action;
    if (!action?.canDecline) return false;
    return this.executeCommand(
      command => this.commands.pass?.(this.gameId, this.viewerPlayerId, command),
    );
  }

  dismissOutcome() {
    if (this.outcome == null) return false;
    this.outcome = null;
    this.publish();
    return true;
  }

  handleConnectionChanged(status) {
    if (this.disposed || !Object.values(GAME_CONNECTION_STATUS).includes(status)) return false;
    const previous = this.controller;
    this.controller = gameControllerReducer(previous, {
      type: GAME_CONTROLLER_ACTIONS.CONNECTION_CHANGED,
      status,
    });
    if (UNSAFE_CONNECTION_STATUSES.has(status)) this.presentation.cancel();
    if (this.controller !== previous) this.publish();
    return this.controller !== previous;
  }

  async handleSubscribed() {
    if (this.disposed) return false;
    const status = this.hasConnected
      ? GAME_CONNECTION_STATUS.RECOVERED
      : GAME_CONNECTION_STATUS.CONNECTED;
    this.hasConnected = true;
    this.handleConnectionChanged(status);
    try {
      await this.synchronizer.onConnect();
      return true;
    } catch (error) {
      this.handleConnectionChanged(GAME_CONNECTION_STATUS.DEGRADED);
      this.report(error);
      return false;
    }
  }

  handleRealtimeEvent(event) {
    if (this.disposed || !isEventForGame(event, this.gameId)) return Promise.resolve(false);
    const previousController = this.controller;
    const previousGap = previousController.recovery.eventGap;
    this.controller = gameControllerReducer(previousController, {
      type: GAME_CONTROLLER_ACTIONS.REALTIME_EVENT_RECEIVED,
      event,
    });
    if (previousGap == null && this.controller.recovery.eventGap != null) {
      this.history = markEventHistoryGap(this.history, this.controller.recovery.eventGap);
    }

    const eventModel = this.buildEventModel(event);
    const historyBefore = this.history;
    if (eventModel) this.history = applyEventToHistory(this.history, eventModel);
    const newlyObserved = this.history !== historyBefore;
    if (newlyObserved && event.stateVersion >= (previousController.acceptedVersion ?? -1)) {
      const transaction = this.transactionFromEvent(event, eventModel);
      if (transaction) this.presentConfirmed(transaction);
    }
    if (this.controller !== previousController || newlyObserved) this.publish();

    return this.synchronizer.onEvent(event).catch(error => {
      this.handleConnectionChanged(GAME_CONNECTION_STATUS.DEGRADED);
      this.report(error);
      return false;
    });
  }

  async pollWhenDisconnected() {
    if (this.disposed || [
      GAME_CONNECTION_STATUS.CONNECTED,
      GAME_CONNECTION_STATUS.RECOVERED,
    ].includes(this.controller.connection.status)) return false;
    try {
      await this.synchronizer.refresh(this.controller.acceptedVersion ?? -1);
      return true;
    } catch (error) {
      this.report(error);
      return false;
    }
  }

  dispose() {
    if (this.disposed) return false;
    this.disposed = true;
    this.realtime?.dispose?.();
    this.realtime = null;
    if (this.pollHandle != null) this.clearPollInterval(this.pollHandle);
    this.pollHandle = null;
    this.presentation.dispose();
    this.presentationPhase = PRESENTATION_PHASES.IDLE;
    this.outcome = null;
    this.listeners.clear();
    this.publicState = this.buildPublicState();
    return true;
  }

  async loadMetadata() {
    try {
      const payload = await this.fetchBoardMetadata();
      if (this.disposed) return;
      const index = buildBoardMetadataIndex(payload);
      if (index == null) throw new Error("Board metadata did not contain forty ordered squares");
      this.metadataIndex = index;
      this.metadataStatus = "READY";
      this.metadataError = null;
    } catch (error) {
      if (this.disposed) return;
      this.metadataStatus = "FAILED";
      this.metadataError = "UNAVAILABLE";
      this.report(error);
    }
    this.publish();
  }

  async executeCommand(invoke, onSuccess = null) {
    if (this.disposed || typeof invoke !== "function" || !canSubmitGameCommand(this.controller)) {
      return false;
    }
    let commandId;
    try {
      commandId = this.createCommandId();
    } catch (error) {
      this.report(error);
      return false;
    }
    const expectedVersion = this.controller.acceptedVersion;
    const previous = this.controller;
    this.controller = gameControllerReducer(previous, {
      type: GAME_CONTROLLER_ACTIONS.COMMAND_STARTED,
      commandId,
      expectedVersion,
    });
    if (this.controller === previous) return false;
    this.publish();

    try {
      const result = await invoke(Object.freeze({ commandId, expectedVersion }));
      if (this.disposed) return false;
      this.controller = gameControllerReducer(this.controller, {
        type: GAME_CONTROLLER_ACTIONS.COMMAND_SUCCEEDED,
        commandId,
        stateVersion: result.stateVersion,
      });
      onSuccess?.(result);
      this.publish();
      await this.synchronizer.refresh(result.stateVersion);
      return true;
    } catch (error) {
      if (this.disposed) return false;
      this.controller = gameControllerReducer(this.controller, {
        type: GAME_CONTROLLER_ACTIONS.COMMAND_FAILED,
        commandId,
        error,
      });
      this.publish();
      if (this.controller.snapshotRefreshRequired) {
        try {
          await this.synchronizer.refresh(error?.stateVersion ?? -1);
        } catch (refreshError) {
          this.report(refreshError);
        }
      }
      return false;
    }
  }

  presentRollResult(result, fromPosition) {
    if (!hasDicePair(result)) return;
    const movement = Number.isSafeInteger(fromPosition)
      ? {
          mode: MOVEMENT_MODES.DIRECT,
          playerId: this.viewerPlayerId,
          from: fromPosition,
          to: result.newPosition,
          slot: playerSlot(this.controller.snapshot, this.viewerPlayerId),
        }
      : null;
    this.presentConfirmed({
      presentationId: buildRollPresentationIdentity({
        gameId: this.gameId,
        stateVersion: result.stateVersion,
        actorPlayerId: this.viewerPlayerId,
        die1: result.die1,
        die2: result.die2,
      }),
      stateVersion: result.stateVersion,
      actorPlayerId: this.viewerPlayerId,
      dice: { die1: result.die1, die2: result.die2, total: result.total },
      movement,
      outcome: buildThrowOutcome(result, this.metadataIndex, this.controller.snapshot),
    });
  }

  transactionFromEvent(event, eventModel) {
    const details = event.payload?.details ?? [];
    const dice = details.find(detail => detail.type === "DICE_ROLLED") ?? null;
    const movement = details.find(detail => detail.type === "PLAYER_MOVED") ?? null;
    if (!dice && !movement && !eventModel) return null;
    const actorPlayerId = event.payload.actorPlayerId ?? null;
    const presentationId = dice && isPositiveInteger(actorPlayerId)
      ? buildRollPresentationIdentity({
          gameId: event.gameId,
          stateVersion: event.stateVersion,
          actorPlayerId,
          die1: dice.die1,
          die2: dice.die2,
        })
      : event.eventId;
    return {
      presentationId,
      stateVersion: event.stateVersion,
      actorPlayerId,
      dice: dice ? { die1: dice.die1, die2: dice.die2, total: dice.total } : null,
      movement: movement && isPositiveInteger(actorPlayerId) ? {
        mode: MOVEMENT_MODES.DIRECT,
        playerId: actorPlayerId,
        from: movement.fromPosition,
        to: movement.toPosition,
        slot: playerSlot(this.controller.snapshot, actorPlayerId),
      } : null,
      outcome: eventModel ? {
        kind: eventModel.kind,
        text: eventModel.text,
        emphasis: eventModel.emphasis,
        dismissible: true,
      } : null,
    };
  }

  presentConfirmed(transaction) {
    this.lastPresentationVersion = Math.max(
      this.lastPresentationVersion,
      transaction.stateVersion,
    );
    void this.presentation.present(transaction).then(result => {
      if (this.disposed || result !== PRESENTATION_RESULTS.FAILED) return;
      const snapshot = this.controller.snapshot;
      if (snapshot) void this.recoverScene(snapshot);
    });
  }

  async recoverScene(snapshot) {
    const result = await this.presentation.recover({
      stateVersion: snapshot.stateVersion,
      snaps: snapshot.players.map(player => ({
        playerId: player.playerId,
        position: player.position,
        slot: playerSlot(snapshot, player.playerId),
      })),
    });
    if (!this.disposed && result === PRESENTATION_RESULTS.FAILED) {
      this.scene.setPawnPositions?.(snapshot.players);
    }
  }

  buildEventModel(event) {
    const snapshot = this.controller.snapshot;
    const playerName = playerId => snapshot?.players
      .find(player => player.playerId === playerId)?.nickname ?? `Παίκτης ${playerId}`;
    const squareName = position => getSquareMetadata(this.metadataIndex, position)?.name
      ?? `#${position}`;
    return buildEventViewModel({
      event,
      viewerPlayerId: this.viewerPlayerId,
      playerName,
      squareName,
    });
  }

  buildPublicState() {
    const snapshot = this.controller.snapshot;
    const command = this.controller.command;
    const commandState = {
      pending: BUSY_COMMAND_STATUSES.has(command.status)
        || this.controller.recovery.required
        || this.controller.snapshotRefreshRequired,
      errorCode: command.error?.code ?? null,
    };
    const viewModel = snapshot == null ? null : buildGameViewModel({
      snapshot,
      viewerPlayerId: this.viewerPlayerId,
      ownership: deriveOwnershipProjection(snapshot),
      boardMetadata: this.metadataIndex,
      commandState,
      connectionState: this.controller.connection,
    });
    return Object.freeze({
      controller: this.controller,
      viewModel,
      metadata: Object.freeze({
        status: this.metadataStatus,
        index: this.metadataIndex,
        error: this.metadataError,
      }),
      history: this.history,
      outcome: this.outcome,
      presentationPhase: this.presentationPhase,
    });
  }

  publish() {
    if (this.disposed) return;
    this.publicState = this.buildPublicState();
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (error) {
        this.report(error);
      }
    }
  }

  report(error) {
    if (this.disposed) return;
    try {
      this.onDiagnostic(error);
    } catch {
      // Diagnostics are non-authoritative and must never interrupt reconciliation.
    }
  }
}

/** Command responses and STOMP echoes share this identity without arrival-time assumptions. */
export function buildRollPresentationIdentity({
  gameId, stateVersion, actorPlayerId, die1, die2,
} = {}) {
  if (![gameId, actorPlayerId].every(isPositiveInteger)
      || !isVersion(stateVersion)
      || !isDie(die1)
      || !isDie(die2)) return null;
  return `roll:${gameId}:${stateVersion}:${actorPlayerId}:${die1}:${die2}`;
}

function buildThrowOutcome(result, metadata, snapshot) {
  const square = getSquareMetadata(metadata, result.newPosition);
  const squareName = square?.name ?? `#${result.newPosition}`;
  const owner = snapshot?.players.find(player => player.properties.includes(result.newPosition));
  let text = GAMEPLAY_CONTENT.acknowledge;
  let emphasis = "neutral";
  if (result.squareType === 1) {
    const destination = getSquareMetadata(metadata, result.data)?.name ?? `#${result.data}`;
    text = formatTurnDestination(result.card?.text ?? null, destination);
    emphasis = "highlight";
  } else if (result.squareType === 2) {
    text = formatTurnMoney(result.card?.text ?? null, result.data);
    emphasis = result.data < 0 ? "negative" : "positive";
  } else if (result.squareType === 3) {
    text = formatRentOutcome(squareName, owner?.nickname ?? null, result.data)
      ?? `${GAMEPLAY_CONTENT.rent}: ${formatMoney(result.data)}.`;
    emphasis = "negative";
  } else if (result.squareType === 4) {
    // Type four also represents a property landing with no transaction; metadata distinguishes it from Start.
    if (square?.type === "START") {
      text = formatStartPassOutcome(result.data);
      emphasis = "positive";
    } else {
      text = formatLandingOutcome(squareName) ?? GAMEPLAY_CONTENT.acknowledge;
    }
  } else if (result.squareType === 5) {
    text = formatPurchaseOffer(squareName, result.data);
  } else if (result.squareType === 6) {
    text = formatTaxOutcome(squareName, result.data);
    emphasis = "negative";
  } else if (result.squareType === 7) {
    text = `Μετακίνηση στη ${GAMEPLAY_CONTENT.jail}!`;
    emphasis = "warning";
  } else if (result.squareType === 8) {
    text = `Επίσκεψη στη ${GAMEPLAY_CONTENT.jail}.`;
  } else if (result.squareType === 9) {
    text = `${GAMEPLAY_CONTENT.freeParking}: χαλάρωσε μέχρι την επόμενη σειρά σου.`;
  } else if (result.squareType === 10) {
    text = formatJailExitOffer(result.data);
    emphasis = "warning";
  }
  if (result.passedGo === true && square?.type !== "START") {
    // The roll response confirms passage but carries the landing mechanic in data, not the Start amount.
    text = `${formatStartPassOutcome()} ${text}`;
  }
  return { kind: "ROLL_RESULT", text, emphasis, dismissible: true };
}

function playerSlot(snapshot, playerId) {
  if (!Array.isArray(snapshot?.players)) return null;
  const ordered = [...snapshot.players]
    .map(player => player.playerId)
    .filter(isPositiveInteger)
    .sort((left, right) => left - right);
  const index = ordered.indexOf(playerId);
  return index >= 0 && index < 4 ? index : null;
}

function hasDicePair(value) {
  return value != null
    && isDie(value.die1)
    && isDie(value.die2)
    && value.total === value.die1 + value.die2
    && isVersion(value.stateVersion);
}

function isEventForGame(event, gameId) {
  return event != null
    && event.gameId === gameId
    && isVersion(event.stateVersion)
    && typeof event.eventId === "string";
}

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function isVersion(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isDie(value) {
  return Number.isSafeInteger(value) && value >= 1 && value <= 6;
}
