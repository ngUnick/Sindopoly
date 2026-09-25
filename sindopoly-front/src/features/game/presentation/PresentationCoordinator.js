import {
  MOVEMENT_MODES,
  PRESENTATION_PHASES,
  buildPresentationPlan,
  buildPresentationRecovery,
} from "./presentationTransaction.js";

const DEFAULT_DEDUP_LIMIT = 64;

export const PRESENTATION_RESULTS = Object.freeze({
  COMPLETED: "COMPLETED",
  DUPLICATE: "DUPLICATE",
  STALE: "STALE",
  INVALID: "INVALID",
  COALESCED: "COALESCED",
  SUPERSEDED: "SUPERSEDED",
  RECOVERY_CANCELED: "RECOVERY_CANCELED",
  RECOVERED: "RECOVERED",
  CANCELED: "CANCELED",
  FAILED: "FAILED",
  DISPOSED: "DISPOSED",
});

/**
 * Orders transient effects for already-confirmed facts. It owns no snapshot,
 * command, gameplay rule, transport, or durable history state.
 */
export class PresentationCoordinator {
  constructor({
    scene = {},
    presentOutcome = () => true,
    cancelOutcome = () => {},
    onPhaseChanged = () => {},
    onFailure = () => {},
    reducedMotion = false,
    dedupLimit = DEFAULT_DEDUP_LIMIT,
  } = {}) {
    this.scene = scene;
    this.presentOutcome = presentOutcome;
    this.cancelOutcome = cancelOutcome;
    this.onPhaseChanged = onPhaseChanged;
    this.onFailure = onFailure;
    this.reducedMotion = reducedMotion === true;
    this.dedupLimit = Number.isSafeInteger(dedupLimit) && dedupLimit > 0
      ? Math.min(dedupLimit, 256) : DEFAULT_DEDUP_LIMIT;

    this.phase = PRESENTATION_PHASES.IDLE;
    this.active = null;
    this.queued = null;
    this.seenIds = new Set();
    this.seenOrder = [];
    this.highestAcceptedVersion = -1;
    this.generation = 0;
    this.disposed = false;
  }

  get activePresentationId() {
    return this.active?.plan.transaction.presentationId ?? null;
  }

  get queuedPresentationId() {
    return this.queued?.plan.transaction.presentationId ?? null;
  }

  /** Accepts one normalized transaction and never rejects into its caller. */
  present(value) {
    if (this.disposed) return Promise.resolve(PRESENTATION_RESULTS.DISPOSED);
    const plan = buildPresentationPlan(value);
    if (plan == null) return Promise.resolve(PRESENTATION_RESULTS.INVALID);
    const { presentationId, stateVersion } = plan.transaction;
    if (this.seenIds.has(presentationId)) {
      return Promise.resolve(PRESENTATION_RESULTS.DUPLICATE);
    }
    if (stateVersion < this.highestAcceptedVersion) {
      return Promise.resolve(PRESENTATION_RESULTS.STALE);
    }

    this.remember(presentationId);
    this.highestAcceptedVersion = Math.max(this.highestAcceptedVersion, stateVersion);
    const entry = createEntry(plan);
    if (this.active == null) {
      this.start(entry);
      return entry.promise;
    }
    if (stateVersion > this.active.plan.transaction.stateVersion) {
      this.cancelQueued(PRESENTATION_RESULTS.SUPERSEDED);
      this.cancelActive(PRESENTATION_RESULTS.SUPERSEDED);
      this.start(entry);
      return entry.promise;
    }

    this.cancelQueued(PRESENTATION_RESULTS.COALESCED);
    this.queued = entry;
    return entry.promise;
  }

  /** Cancels transient work and snaps only to caller-supplied authoritative positions. */
  async recover(value) {
    if (this.disposed) return PRESENTATION_RESULTS.DISPOSED;
    const recovery = buildPresentationRecovery(value);
    if (recovery == null) return PRESENTATION_RESULTS.INVALID;
    if (recovery.stateVersion < this.highestAcceptedVersion) {
      return PRESENTATION_RESULTS.STALE;
    }
    this.highestAcceptedVersion = recovery.stateVersion;
    this.cancelQueued(PRESENTATION_RESULTS.RECOVERY_CANCELED);
    this.cancelActive(PRESENTATION_RESULTS.RECOVERY_CANCELED);
    const generation = ++this.generation;
    this.setPhase(PRESENTATION_PHASES.RECOVERING);
    try {
      for (const snap of recovery.snaps) {
        if (!this.isGenerationCurrent(generation)) return PRESENTATION_RESULTS.CANCELED;
        const accepted = await this.invokeScene("snapPawnPosition", snap);
        if (!this.isGenerationCurrent(generation)) return PRESENTATION_RESULTS.CANCELED;
        if (accepted !== true) throw new Error("Scene rejected authoritative recovery snap");
      }
      if (this.isGenerationCurrent(generation)) this.setPhase(PRESENTATION_PHASES.IDLE);
      return PRESENTATION_RESULTS.RECOVERED;
    } catch (error) {
      if (!this.isGenerationCurrent(generation)) return PRESENTATION_RESULTS.CANCELED;
      this.reportFailure(error, null, PRESENTATION_PHASES.RECOVERING);
      this.setPhase(PRESENTATION_PHASES.IDLE);
      return PRESENTATION_RESULTS.FAILED;
    }
  }

  cancel() {
    if (this.disposed) return false;
    const hadWork = this.active != null || this.queued != null || this.phase !== PRESENTATION_PHASES.IDLE;
    this.cancelQueued(PRESENTATION_RESULTS.CANCELED);
    this.cancelActive(PRESENTATION_RESULTS.CANCELED);
    this.generation += 1;
    this.setPhase(PRESENTATION_PHASES.IDLE);
    return hadWork;
  }

  dispose() {
    if (this.disposed) return false;
    this.disposed = true;
    this.generation += 1;
    this.cancelQueued(PRESENTATION_RESULTS.DISPOSED);
    this.cancelActive(PRESENTATION_RESULTS.DISPOSED);
    this.phase = PRESENTATION_PHASES.IDLE;
    this.scene = null;
    this.presentOutcome = null;
    this.cancelOutcome = null;
    this.onPhaseChanged = null;
    this.onFailure = null;
    this.seenIds.clear();
    this.seenOrder = [];
    return true;
  }

  start(entry) {
    const generation = ++this.generation;
    entry.generation = generation;
    this.active = entry;
    void this.run(entry);
  }

  async run(entry) {
    try {
      for (const stage of entry.plan.stages) {
        if (!this.isActive(entry)) return;
        this.setPhase(stage.phase);
        const accepted = await this.runStage(entry, stage);
        if (!this.isActive(entry)) return;
        if (accepted !== true) throw new Error(`Presentation stage ${stage.kind} was rejected`);
      }
      this.finishActive(entry, PRESENTATION_RESULTS.COMPLETED);
    } catch (error) {
      if (!this.isActive(entry)) return;
      this.reportFailure(error, entry.plan.transaction.presentationId, this.phase);
      this.finishActive(entry, PRESENTATION_RESULTS.FAILED);
    }
  }

  runStage(entry, stage) {
    const transaction = entry.plan.transaction;
    if (stage.kind === "DICE") {
      return this.invokeScene("presentDiceRollAndWait", {
        ...stage.dice,
        // The committed transition version remains the scene's monotonic dice identity.
        presentationId: transaction.stateVersion,
        reducedMotion: this.reducedMotion,
      });
    }
    if (stage.kind === "MOVEMENT") {
      if (stage.movement.mode === MOVEMENT_MODES.SNAP) {
        return this.invokeScene("snapPawnPosition", {
          playerId: stage.movement.playerId,
          position: stage.movement.to,
          slot: stage.movement.slot,
        });
      }
      return this.invokeScene("presentPawnMovement", {
        ...stage.movement,
        route: stage.movement.route == null ? null : [...stage.movement.route],
        presentationId: transaction.presentationId,
        reducedMotion: this.reducedMotion,
      });
    }
    return Promise.resolve(this.presentOutcome(stage.outcome, Object.freeze({
      presentationId: transaction.presentationId,
      stateVersion: transaction.stateVersion,
    })));
  }

  invokeScene(method, value) {
    const operation = this.scene?.[method];
    if (typeof operation !== "function") return Promise.resolve(false);
    return Promise.resolve(operation.call(this.scene, value));
  }

  finishActive(entry, result) {
    if (!this.isActive(entry)) return;
    this.active = null;
    entry.resolve(result);
    if (this.disposed) return;
    this.setPhase(PRESENTATION_PHASES.IDLE);
    const queued = this.queued;
    this.queued = null;
    if (queued) this.start(queued);
  }

  cancelActive(result) {
    const entry = this.active;
    if (!entry) return;
    this.active = null;
    this.generation += 1;
    const stateVersion = entry.plan.transaction.stateVersion;
    try {
      this.scene?.cancelDicePresentation?.(stateVersion);
      this.scene?.cancelPawnPresentation?.(entry.plan.transaction.presentationId);
      this.cancelOutcome?.(entry.plan.transaction.presentationId);
    } catch (error) {
      if (!this.disposed) this.reportFailure(error, entry.plan.transaction.presentationId, this.phase);
    }
    entry.resolve(result);
  }

  cancelQueued(result) {
    if (!this.queued) return;
    const queued = this.queued;
    this.queued = null;
    queued.resolve(result);
  }

  isActive(entry) {
    return !this.disposed
      && this.active === entry
      && this.generation === entry.generation;
  }

  isGenerationCurrent(generation) {
    return !this.disposed && this.generation === generation;
  }

  setPhase(phase) {
    this.phase = phase;
    if (this.disposed || typeof this.onPhaseChanged !== "function") return;
    try {
      this.onPhaseChanged(phase);
    } catch (error) {
      this.reportFailure(error, this.activePresentationId, phase);
    }
  }

  reportFailure(error, presentationId, phase) {
    if (this.disposed || typeof this.onFailure !== "function") return;
    try {
      this.onFailure(Object.freeze({ presentationId, phase, error }));
    } catch {
      // Presentation diagnostics must not escape into React or mutate game state.
    }
  }

  remember(presentationId) {
    this.seenIds.add(presentationId);
    this.seenOrder.push(presentationId);
    while (this.seenOrder.length > this.dedupLimit) {
      this.seenIds.delete(this.seenOrder.shift());
    }
  }
}

function createEntry(plan) {
  let resolve;
  const promise = new Promise(settle => { resolve = settle; });
  return { plan, promise, resolve, generation: null };
}
