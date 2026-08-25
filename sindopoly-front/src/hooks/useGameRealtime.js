import { useEffect, useRef } from "react";
import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import API_BASE_URL from "../apis/apiConfig";
import { GameAPI } from "../apis/GameAPI";
import { acceptGameSnapshot, currentGameVersion } from "../apis/gameCommandState";
import { createSnapshotSynchronizer } from "../apis/realtimeSync";

/** One authenticated subscription per mounted game; HTTP snapshots remain authoritative. */
export function useGameRealtime(gameId, onSnapshot) {
  const callback = useRef(onSnapshot);
  callback.current = onSnapshot;

  useEffect(() => {
    if (gameId == null) return undefined;
    const sync = createSnapshotSynchronizer({
      gameId,
      currentVersion: currentGameVersion,
      fetchSnapshot: GameAPI.getRealtimeSnapshot,
      applySnapshot: (id, snapshot) => {
        if (!acceptGameSnapshot(id, snapshot)) return false;
        callback.current?.(snapshot);
        return true;
      },
    });
    let subscription;
    const client = new Client({
      webSocketFactory: () => new SockJS(`${API_BASE_URL}/ws`),
      reconnectDelay: 2000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      onConnect: () => {
        subscription?.unsubscribe();
        subscription = client.subscribe(`/topic/game/${gameId}`, message => {
          sync.onEvent(message.body).catch(error => console.error("Game snapshot recovery failed", error));
        });
        // Subscribe before reading to close the connect/snapshot race.
        sync.onConnect().catch(error => console.error("Game snapshot recovery failed", error));
      },
      onStompError: frame => console.error("Game WebSocket rejected", frame.headers.message),
    });
    client.activate();
    return () => {
      subscription?.unsubscribe();
      void client.deactivate();
    };
  }, [gameId]);
}
