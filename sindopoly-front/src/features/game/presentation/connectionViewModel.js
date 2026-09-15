import { CONNECTION_CONTENT } from "../content/el.js";

export const CONNECTION_STATES = Object.freeze({
  CONNECTED: "CONNECTED",
  DEGRADED: "DEGRADED",
  RECONNECTING: "RECONNECTING",
  OFFLINE: "OFFLINE",
  RECOVERED: "RECOVERED",
});

const PRESENTATION = Object.freeze({
  [CONNECTION_STATES.CONNECTED]: Object.freeze({
    semanticStatus: "ready",
    text: CONNECTION_CONTENT.connected,
    canSubmitCommands: true,
  }),
  [CONNECTION_STATES.DEGRADED]: Object.freeze({
    semanticStatus: "warning",
    text: CONNECTION_CONTENT.degraded,
    canSubmitCommands: false,
  }),
  [CONNECTION_STATES.RECONNECTING]: Object.freeze({
    semanticStatus: "progress",
    text: CONNECTION_CONTENT.reconnecting,
    canSubmitCommands: false,
  }),
  [CONNECTION_STATES.OFFLINE]: Object.freeze({
    semanticStatus: "error",
    text: CONNECTION_CONTENT.lost,
    canSubmitCommands: false,
  }),
  [CONNECTION_STATES.RECOVERED]: Object.freeze({
    semanticStatus: "ready",
    text: CONNECTION_CONTENT.recovered,
    canSubmitCommands: true,
  }),
});

/** Describes caller-supplied connection state; it never estimates health from game data. */
export function buildConnectionViewModel(connectionState) {
  const presentation = PRESENTATION[connectionState];
  return presentation ? Object.freeze({ state: connectionState, ...presentation }) : null;
}
