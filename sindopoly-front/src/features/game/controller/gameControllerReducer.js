export const GAME_CONTROLLER_ACTIONS = Object.freeze({
  SNAPSHOT_ACCEPTED: "SNAPSHOT_ACCEPTED",
  COMMAND_STARTED: "COMMAND_STARTED",
  COMMAND_SUCCEEDED: "COMMAND_SUCCEEDED",
  COMMAND_FAILED: "COMMAND_FAILED",
  CONNECTION_CHANGED: "CONNECTION_CHANGED",
  REALTIME_EVENT_RECEIVED: "REALTIME_EVENT_RECEIVED",
  RECOVERY_STARTED: "RECOVERY_STARTED",
  RESET: "RESET",
});

export const GAME_COMMAND_STATUS = Object.freeze({
  IDLE: "IDLE",
  PENDING: "PENDING",
  AWAITING_SNAPSHOT: "AWAITING_SNAPSHOT",
  FAILED: "FAILED",
  STALE: "STALE",
  BLOCKED: "BLOCKED",
});

export const GAME_CONNECTION_STATUS = Object.freeze({
  CONNECTED: "CONNECTED",
  DEGRADED: "DEGRADED",
  RECONNECTING: "RECONNECTING",
  OFFLINE: "OFFLINE",
  RECOVERED: "RECOVERED",
});

export const GAME_RECOVERY_REASON = Object.freeze({
  STALE_STATE: "STALE_STATE",
  COMMAND_OUTCOME_UNKNOWN: "COMMAND_OUTCOME_UNKNOWN",
  CONNECTION_RECOVERY: "CONNECTION_RECOVERY",
  EVENT_GAP: "EVENT_GAP",
  EXPLICIT: "EXPLICIT",
});

const SNAPSHOT_STATUSES = new Set(["lobby", "inProgress", "ended"]);
const ERROR_CODES = new Set([
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION",
  "STALE_STATE",
  "CONFLICT",
  "NETWORK",
  "SERVER",
  "INVALID_PAYLOAD",
  "UNKNOWN",
]);
const BLOCKING_FAILURE_CODES = new Set(["UNAUTHENTICATED", "FORBIDDEN", "NOT_FOUND"]);
const AMBIGUOUS_FAILURE_CODES = new Set([
  "NETWORK",
  "SERVER",
  "INVALID_PAYLOAD",
  "UNKNOWN",
]);
const COMMAND_READY_STATUSES = new Set([
  GAME_COMMAND_STATUS.IDLE,
  GAME_COMMAND_STATUS.FAILED,
]);
const CONNECTED_STATUSES = new Set([
  GAME_CONNECTION_STATUS.CONNECTED,
  GAME_CONNECTION_STATUS.RECOVERED,
]);
const RECOVERY_CONNECTION_STATUSES = new Set([
  GAME_CONNECTION_STATUS.DEGRADED,
  GAME_CONNECTION_STATUS.RECONNECTING,
  GAME_CONNECTION_STATUS.OFFLINE,
]);

/** Creates lifecycle state for exactly one game; identity changes require RESET. */
export function createGameControllerState(gameId) {
  if (!isGameId(gameId)) throw new TypeError("gameId must be a positive safe integer");
  return freezeState({
    gameId,
    snapshot: null,
    acceptedVersion: null,
    connection: { status: GAME_CONNECTION_STATUS.OFFLINE },
    command: idleCommand(),
    recovery: emptyRecovery(),
    snapshotRefreshRequired: false,
    latestObservedEventVersion: null,
  });
}

/**
 * Advances controller lifecycle facts only. Game truth always comes from an
 * already validated authoritative snapshot supplied by the orchestration layer.
 */
export function gameControllerReducer(state, action) {
  if (!isControllerState(state) || !isRecord(action)) return state;

  switch (action.type) {
    case GAME_CONTROLLER_ACTIONS.SNAPSHOT_ACCEPTED:
      return acceptSnapshot(state, action.snapshot);
    case GAME_CONTROLLER_ACTIONS.COMMAND_STARTED:
      return startCommand(state, action);
    case GAME_CONTROLLER_ACTIONS.COMMAND_SUCCEEDED:
      return succeedCommand(state, action);
    case GAME_CONTROLLER_ACTIONS.COMMAND_FAILED:
      return failCommand(state, action);
    case GAME_CONTROLLER_ACTIONS.CONNECTION_CHANGED:
      return changeConnection(state, action.status);
    case GAME_CONTROLLER_ACTIONS.REALTIME_EVENT_RECEIVED:
      return observeRealtimeEvent(state, action.event);
    case GAME_CONTROLLER_ACTIONS.RECOVERY_STARTED:
      return startRecovery(state, action.reason);
    case GAME_CONTROLLER_ACTIONS.RESET:
      return isGameId(action.gameId) ? createGameControllerState(action.gameId) : state;
    default:
      return state;
  }
}

export function getAcceptedSnapshot(state) {
  return isControllerState(state) ? state.snapshot : null;
}

export function getAcceptedVersion(state) {
  return isControllerState(state) ? state.acceptedVersion : null;
}

/** The expected command version never advances ahead of accepted game truth. */
export function getExpectedCommandVersion(state) {
  return getAcceptedVersion(state);
}

export function getCommandLifecycle(state) {
  return isControllerState(state) ? state.command : null;
}

export function getConnectionState(state) {
  return isControllerState(state) ? state.connection : null;
}

export function isRecoveryRequired(state) {
  return isControllerState(state) && state.recovery.required;
}

export function isSnapshotRefreshRequired(state) {
  return isControllerState(state) && state.snapshotRefreshRequired;
}

export function getEventGap(state) {
  return isControllerState(state) ? state.recovery.eventGap : null;
}

/**
 * Reports transport/controller safety only; backend snapshots and presentation
 * models remain responsible for whether a particular gameplay action is legal.
 */
export function canSubmitGameCommand(state) {
  return isControllerState(state)
    && state.snapshot != null
    && state.snapshot.status !== "ended"
    && CONNECTED_STATUSES.has(state.connection.status)
    && COMMAND_READY_STATUSES.has(state.command.status)
    && !state.recovery.required
    && !state.snapshotRefreshRequired;
}

function acceptSnapshot(state, snapshot) {
  if (!isSnapshot(snapshot) || snapshot.gameId !== state.gameId) return state;
  const version = snapshot.stateVersion;
  if (state.acceptedVersion != null && version < state.acceptedVersion) return state;

  const equalVersion = version === state.acceptedVersion;
  const eventCaughtUp = state.latestObservedEventVersion == null
    || version >= state.latestObservedEventVersion;
  const command = reconcileCommand(state.command, version, state.recovery.required);
  const commandCaughtUp = command.status !== GAME_COMMAND_STATUS.AWAITING_SNAPSHOT;
  const eventGap = eventCaughtUp ? null : state.recovery.eventGap;
  const recoveryRequired = eventGap != null;
  const snapshotRefreshRequired = !eventCaughtUp || !commandCaughtUp;
  const recovery = recoveryRequired
    ? { required: true, reason: GAME_RECOVERY_REASON.EVENT_GAP, eventGap }
    : emptyRecovery();

  if (equalVersion
      && command === state.command
      && recovery.required === state.recovery.required
      && recovery.eventGap === state.recovery.eventGap
      && snapshotRefreshRequired === state.snapshotRefreshRequired) {
    return state;
  }

  return freezeState({
    ...state,
    // Equal versions confirm freshness but cannot replace already accepted truth.
    snapshot: equalVersion ? state.snapshot : snapshot,
    acceptedVersion: version,
    command,
    recovery,
    snapshotRefreshRequired,
  });
}

function startCommand(state, action) {
  if (!canSubmitGameCommand(state)
      || !hasText(action.commandId)
      || action.expectedVersion !== state.acceptedVersion) {
    return state;
  }

  return freezeState({
    ...state,
    command: {
      status: GAME_COMMAND_STATUS.PENDING,
      commandId: action.commandId,
      expectedVersion: action.expectedVersion,
      resultVersion: null,
      error: null,
    },
  });
}

function succeedCommand(state, action) {
  const command = state.command;
  if (!matchesActiveCommand(command, action.commandId)
      || !isVersion(action.stateVersion)
      || action.stateVersion < command.expectedVersion) {
    return state;
  }

  if (action.stateVersion <= state.acceptedVersion) {
    return freezeState({ ...state, command: idleCommand() });
  }
  if (command.status === GAME_COMMAND_STATUS.AWAITING_SNAPSHOT
      && action.stateVersion <= command.resultVersion) {
    return state;
  }

  // A response version is only a reconciliation target; it is never game truth.
  return freezeState({
    ...state,
    command: {
      ...command,
      status: GAME_COMMAND_STATUS.AWAITING_SNAPSHOT,
      resultVersion: action.stateVersion,
      error: null,
    },
    snapshotRefreshRequired: true,
  });
}

function failCommand(state, action) {
  const command = state.command;
  if (!matchesActiveCommand(command, action.commandId)) return state;
  const error = safeError(action.error);

  if (error.code === "STALE_STATE") {
    // A stale intent is never retried blindly with the server-reported version.
    return freezeState({
      ...state,
      command: { ...command, status: GAME_COMMAND_STATUS.STALE, error },
      recovery: {
        required: true,
        reason: GAME_RECOVERY_REASON.STALE_STATE,
        eventGap: state.recovery.eventGap,
      },
      snapshotRefreshRequired: true,
    });
  }

  if (BLOCKING_FAILURE_CODES.has(error.code)) {
    return freezeState({
      ...state,
      command: { ...command, status: GAME_COMMAND_STATUS.BLOCKED, error },
    });
  }

  if (AMBIGUOUS_FAILURE_CODES.has(error.code)) {
    return freezeState({
      ...state,
      command: { ...command, status: GAME_COMMAND_STATUS.FAILED, error },
      recovery: {
        required: true,
        reason: GAME_RECOVERY_REASON.COMMAND_OUTCOME_UNKNOWN,
        eventGap: state.recovery.eventGap,
      },
      snapshotRefreshRequired: true,
    });
  }

  return freezeState({
    ...state,
    command: { ...command, status: GAME_COMMAND_STATUS.FAILED, error },
  });
}

function changeConnection(state, status) {
  if (!Object.values(GAME_CONNECTION_STATUS).includes(status)
      || status === state.connection.status) {
    return state;
  }

  const needsRecovery = state.snapshot != null && RECOVERY_CONNECTION_STATUSES.has(status);
  const recovery = needsRecovery && !state.recovery.required
    ? {
        required: true,
        reason: GAME_RECOVERY_REASON.CONNECTION_RECOVERY,
        eventGap: state.recovery.eventGap,
      }
    : state.recovery;

  return freezeState({
    ...state,
    connection: { status },
    recovery,
    snapshotRefreshRequired: state.snapshotRefreshRequired || needsRecovery,
  });
}

function observeRealtimeEvent(state, event) {
  if (!isRealtimeEvent(event) || event.gameId !== state.gameId) return state;
  const baseline = Math.max(
    state.acceptedVersion ?? -1,
    state.latestObservedEventVersion ?? -1,
  );
  if (event.stateVersion <= baseline) return state;

  // Event payloads are notifications only; retain bounded ordering metadata.
  const gapDetected = state.acceptedVersion != null && event.stateVersion > baseline + 1;
  const eventGap = gapDetected && state.recovery.eventGap == null
    ? Object.freeze({
        stateVersion: event.stateVersion,
        occurredAt: event.occurredAt,
      })
    : state.recovery.eventGap;
  const recovery = eventGap == null
    ? state.recovery
    : {
        required: true,
        reason: GAME_RECOVERY_REASON.EVENT_GAP,
        eventGap,
      };

  return freezeState({
    ...state,
    latestObservedEventVersion: event.stateVersion,
    recovery,
    snapshotRefreshRequired: true,
  });
}

function startRecovery(state, reason) {
  const safeReason = Object.values(GAME_RECOVERY_REASON).includes(reason)
    ? reason
    : GAME_RECOVERY_REASON.EXPLICIT;
  if (state.recovery.required && state.snapshotRefreshRequired) return state;
  return freezeState({
    ...state,
    recovery: {
      required: true,
      reason: safeReason,
      eventGap: state.recovery.eventGap,
    },
    snapshotRefreshRequired: true,
  });
}

function reconcileCommand(command, snapshotVersion, recoveryWasRequired) {
  if (command.status === GAME_COMMAND_STATUS.AWAITING_SNAPSHOT) {
    return snapshotVersion >= command.resultVersion ? idleCommand() : command;
  }
  if (recoveryWasRequired && [
    GAME_COMMAND_STATUS.PENDING,
    GAME_COMMAND_STATUS.FAILED,
    GAME_COMMAND_STATUS.STALE,
  ].includes(command.status)) {
    return idleCommand();
  }
  return command;
}

function matchesActiveCommand(command, commandId) {
  return hasText(commandId)
    && command.commandId === commandId
    && [GAME_COMMAND_STATUS.PENDING, GAME_COMMAND_STATUS.AWAITING_SNAPSHOT]
      .includes(command.status);
}

function safeError(error) {
  const source = isRecord(error) ? error : {};
  const code = ERROR_CODES.has(source.code) ? source.code : "UNKNOWN";
  return Object.freeze({
    code,
    httpStatus: Number.isInteger(source.httpStatus) ? source.httpStatus : null,
    reason: hasText(source.reason) ? source.reason : null,
    stateVersion: isVersion(source.stateVersion) ? source.stateVersion : null,
    retriable: source.retriable === true,
  });
}

function idleCommand() {
  return {
    status: GAME_COMMAND_STATUS.IDLE,
    commandId: null,
    expectedVersion: null,
    resultVersion: null,
    error: null,
  };
}

function emptyRecovery() {
  return { required: false, reason: null, eventGap: null };
}

function freezeState(state) {
  return Object.freeze({
    ...state,
    connection: Object.freeze({ ...state.connection }),
    command: Object.freeze({ ...state.command }),
    recovery: Object.freeze({ ...state.recovery }),
  });
}

function isControllerState(value) {
  return isRecord(value)
    && isGameId(value.gameId)
    && isRecord(value.connection)
    && isRecord(value.command)
    && isRecord(value.recovery);
}

function isSnapshot(value) {
  return isRecord(value)
    && isGameId(value.gameId)
    && isVersion(value.stateVersion)
    && SNAPSHOT_STATUSES.has(value.status);
}

function isRealtimeEvent(value) {
  return isRecord(value)
    && isGameId(value.gameId)
    && isVersion(value.stateVersion)
    && hasText(value.eventId)
    && hasText(value.eventType)
    && hasText(value.occurredAt)
    && Number.isFinite(Date.parse(value.occurredAt));
}

function isGameId(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function isVersion(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isRecord(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}
