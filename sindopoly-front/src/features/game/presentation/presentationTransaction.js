import {
  buildForwardRoute,
  isBoardPosition,
  isPawnSlot,
} from "../board/boardCalibration.js";

export const PRESENTATION_PHASES = Object.freeze({
  IDLE: "IDLE",
  PRESENTING_DICE: "PRESENTING_DICE",
  PRESENTING_MOVEMENT: "PRESENTING_MOVEMENT",
  PRESENTING_OUTCOME: "PRESENTING_OUTCOME",
  RECOVERING: "RECOVERING",
});

export const MOVEMENT_MODES = Object.freeze({
  FORWARD: "FORWARD",
  DIRECT: "DIRECT",
  SNAP: "SNAP",
});

const OUTCOME_EMPHASIS = new Set(["neutral", "positive", "negative", "warning", "highlight"]);
const MOVEMENT_MODE_VALUES = new Set(Object.values(MOVEMENT_MODES));

/** Copies already-confirmed visual facts into an immutable presentation transaction. */
export function buildPresentationTransaction(value) {
  if (!isRecord(value)
      || !hasBoundedText(value.presentationId, 256)
      || !isNonNegativeInteger(value.stateVersion)
      || value.actorPlayerId != null && !isPositiveInteger(value.actorPlayerId)) {
    return null;
  }

  const dice = normalizeDice(value.dice);
  const movement = normalizeMovement(value.movement);
  const outcome = normalizeOutcome(value.outcome);
  if (value.dice != null && dice == null
      || value.movement != null && movement == null
      || value.outcome != null && outcome == null
      || dice == null && movement == null && outcome == null) {
    return null;
  }

  return Object.freeze({
    presentationId: value.presentationId,
    stateVersion: value.stateVersion,
    actorPlayerId: value.actorPlayerId ?? null,
    dice,
    movement,
    outcome,
  });
}

/** Plans only caller-authorized visual modes; it never derives a destination. */
export function buildPresentationPlan(value) {
  const transaction = buildPresentationTransaction(value);
  if (transaction == null) return null;

  const stages = [];
  if (transaction.dice) {
    stages.push(Object.freeze({
      phase: PRESENTATION_PHASES.PRESENTING_DICE,
      kind: "DICE",
      dice: transaction.dice,
    }));
  }
  if (transaction.movement) {
    const movement = planMovement(transaction.movement);
    if (movement == null) return null;
    const sameSquare = movement.mode !== MOVEMENT_MODES.SNAP
      && movement.from === movement.to;
    if (!sameSquare) {
      stages.push(Object.freeze({
        phase: PRESENTATION_PHASES.PRESENTING_MOVEMENT,
        kind: "MOVEMENT",
        movement,
      }));
    }
  }
  if (transaction.outcome) {
    stages.push(Object.freeze({
      phase: PRESENTATION_PHASES.PRESENTING_OUTCOME,
      kind: "OUTCOME",
      outcome: transaction.outcome,
    }));
  }
  return Object.freeze({ transaction, stages: Object.freeze(stages) });
}

/** Recovery accepts final positions only; no route or historical effect is reconstructed. */
export function buildRecoverySnaps(values) {
  if (!Array.isArray(values) || values.length > 4) return null;
  const playerIds = new Set();
  const snaps = [];
  for (const value of values) {
    if (!isRecord(value)
        || !isPositiveInteger(value.playerId)
        || !isBoardPosition(value.position)
        || value.slot != null && !isPawnSlot(value.slot)
        || playerIds.has(value.playerId)) {
      return null;
    }
    playerIds.add(value.playerId);
    snaps.push(Object.freeze({
      playerId: value.playerId,
      position: value.position,
      slot: value.slot ?? null,
    }));
  }
  return Object.freeze(snaps);
}

/** Copies an accepted recovery version and its explicit final pawn positions. */
export function buildPresentationRecovery(value) {
  if (!isRecord(value) || !isNonNegativeInteger(value.stateVersion)) return null;
  const snaps = buildRecoverySnaps(value.snaps);
  if (snaps == null) return null;
  return Object.freeze({ stateVersion: value.stateVersion, snaps });
}

function normalizeDice(value) {
  if (value == null) return null;
  if (!isRecord(value)
      || !isDie(value.die1)
      || !isDie(value.die2)
      || !Number.isSafeInteger(value.total)
      || value.total !== value.die1 + value.die2) {
    return null;
  }
  return Object.freeze({ die1: value.die1, die2: value.die2, total: value.total });
}

function normalizeMovement(value) {
  if (value == null) return null;
  if (!isRecord(value)
      || !MOVEMENT_MODE_VALUES.has(value.mode)
      || !isPositiveInteger(value.playerId)
      || !isBoardPosition(value.to)
      || value.slot != null && !isPawnSlot(value.slot)) {
    return null;
  }
  if (value.mode !== MOVEMENT_MODES.SNAP && !isBoardPosition(value.from)) return null;
  if (value.mode === MOVEMENT_MODES.SNAP && value.from != null) return null;
  return Object.freeze({
    mode: value.mode,
    playerId: value.playerId,
    from: value.from ?? null,
    to: value.to,
    slot: value.slot ?? null,
  });
}

function normalizeOutcome(value) {
  if (value == null) return null;
  if (!isRecord(value)
      || !hasBoundedText(value.kind, 128)
      || !hasBoundedText(value.text, 2_000)
      || !OUTCOME_EMPHASIS.has(value.emphasis)
      || typeof value.dismissible !== "boolean") {
    return null;
  }
  return Object.freeze({
    kind: value.kind,
    text: value.text,
    emphasis: value.emphasis,
    dismissible: value.dismissible,
  });
}

function planMovement(movement) {
  if (movement.mode !== MOVEMENT_MODES.FORWARD) {
    return Object.freeze({ ...movement, route: null });
  }
  const route = buildForwardRoute(movement.from, movement.to);
  return route == null ? null : Object.freeze({ ...movement, route });
}

function isRecord(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function hasBoundedText(value, maximum) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
}

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isDie(value) {
  return Number.isSafeInteger(value) && value >= 1 && value <= 6;
}
