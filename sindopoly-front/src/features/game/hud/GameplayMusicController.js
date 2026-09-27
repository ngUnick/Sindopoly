import { persistMusicEnabled, readMusicEnabled } from "./musicPreference.js";

/**
 * Keeps one ambient track within one gameplay component lifetime. Browser
 * autoplay rejection is deliberately separate from the user's preference.
 */
export class GameplayMusicController {
  constructor({ source, storage, AudioConstructor = globalThis.Audio, documentTarget = globalThis.document }) {
    this.source = source;
    this.storage = storage;
    this.AudioConstructor = AudioConstructor;
    this.documentTarget = documentTarget;
    this.enabled = readMusicEnabled(storage);
    this.audio = null;
    this.retryHandler = null;
    this.retryScheduled = false;
    this.initialized = false;
  }

  getEnabled() {
    return this.enabled;
  }

  start() {
    if (!this.initialized) {
      this.initialized = true;
      // This is the active-game boundary: first entry remembers the default ON.
      persistMusicEnabled(this.enabled, this.storage);
    }
    if (this.enabled) this.attemptPlayback(true);
  }

  toggle() {
    this.enabled = !this.enabled;
    persistMusicEnabled(this.enabled, this.storage);

    if (this.enabled) {
      this.retryScheduled = false;
      this.attemptPlayback(true);
    } else {
      this.clearRetry();
      this.audio?.pause();
    }
    return this.enabled;
  }

  stop() {
    this.clearRetry();
    this.audio?.pause();
  }

  attemptPlayback(allowInteractionRetry) {
    if (!this.enabled || !this.AudioConstructor) return;

    const audio = this.getAudio();
    let playback;
    try {
      playback = audio.play();
    } catch {
      if (allowInteractionRetry) this.scheduleRetry();
      return;
    }

    Promise.resolve(playback)
      .then(() => this.clearRetry())
      .catch(() => {
        if (this.enabled && allowInteractionRetry) this.scheduleRetry();
      });
  }

  getAudio() {
    if (!this.audio) {
      this.audio = new this.AudioConstructor(this.source);
      this.audio.loop = true;
      this.audio.volume = 0.5;
    }
    return this.audio;
  }

  scheduleRetry() {
    if (this.retryHandler || this.retryScheduled || !this.documentTarget?.addEventListener) return;

    this.retryScheduled = true;
    this.retryHandler = () => {
      this.clearRetry();
      if (this.enabled) this.attemptPlayback(false);
    };
    this.documentTarget.addEventListener("pointerdown", this.retryHandler, { once: true });
    this.documentTarget.addEventListener("keydown", this.retryHandler, { once: true });
  }

  clearRetry() {
    if (!this.retryHandler) return;
    this.documentTarget?.removeEventListener?.("pointerdown", this.retryHandler);
    this.documentTarget?.removeEventListener?.("keydown", this.retryHandler);
    this.retryHandler = null;
  }
}
