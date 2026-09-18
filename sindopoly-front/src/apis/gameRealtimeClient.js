import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import API_BASE_URL from "./apiConfig.jsx";
import { parseGameEvent } from "./realtimeSync.js";
import { GAME_CONNECTION_STATUS } from "../features/game/controller/gameControllerReducer.js";

/** Creates one authenticated STOMP subscription; events remain snapshot wake-up signals. */
export function createGameRealtimeClient({
  gameId,
  onSubscribed = () => {},
  onEvent = () => {},
  onConnectionChanged = () => {},
  onDiagnostic = () => {},
} = {}) {
  let subscription = null;
  let disposed = false;
  const client = new Client({
    webSocketFactory: () => new SockJS(`${API_BASE_URL}/ws`),
    reconnectDelay: 2_000,
    heartbeatIncoming: 10_000,
    heartbeatOutgoing: 10_000,
    beforeConnect: () => {
      if (!disposed) onConnectionChanged(GAME_CONNECTION_STATUS.RECONNECTING);
    },
    onConnect: () => {
      if (disposed) return;
      subscription?.unsubscribe();
      subscription = client.subscribe(`/topic/game/${gameId}`, message => {
        const event = parseGameEvent(message.body, gameId);
        if (event) onEvent(event);
      });
      // Subscription is live before the authoritative read begins.
      void Promise.resolve(onSubscribed()).catch(onDiagnostic);
    },
    onStompError: frame => {
      if (disposed) return;
      onConnectionChanged(GAME_CONNECTION_STATUS.DEGRADED);
      onDiagnostic(new Error(frame.headers?.message ?? "Game WebSocket rejected"));
    },
    onWebSocketError: error => {
      if (disposed) return;
      onConnectionChanged(GAME_CONNECTION_STATUS.DEGRADED);
      onDiagnostic(error);
    },
    onWebSocketClose: () => {
      if (!disposed) onConnectionChanged(GAME_CONNECTION_STATUS.OFFLINE);
    },
  });

  return {
    start() {
      if (disposed || client.active) return false;
      client.activate();
      return true;
    },
    dispose() {
      if (disposed) return false;
      disposed = true;
      subscription?.unsubscribe();
      subscription = null;
      void client.deactivate();
      return true;
    },
  };
}
