import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  OBSERVER_NOTIFICATION_DURATION_MS, ObserverNotificationToast, TurnResultModal,
} from "../components/GameFeedback.js";
import { enqueueNotification, observerNotification } from "./gameEvents.js";
import { parseGameEvent } from "./realtimeSync.js";

const positions = [
  { position: 1, name: "ΓΥΜΝΑΣΤΗΡΙΟ", player: null },
  { position: 2, name: "ΚΑΡΤΑ ΑΠΟΦΑΣΗΣ", player: null },
  { position: 6, name: "ΣΤΑΣΗ ΔΙΠΑΕ", player: null },
  { position: 7, name: "ΚΑΡΤΑ ΕΝΤΟΛΗΣ", player: null },
];
const playerName = id => ({ 1: "Άννα", 2: "Νίκος" }[id] ?? `Παίκτης ${id}`);
const squareName = id => positions.find(position => position.position === id)?.name ?? `#${id}`;

function envelope(details, eventId = "00000000-0000-0000-0000-000000000001") {
  return {
    eventId,
    eventType: "TURN_UPDATED",
    gameId: 41,
    stateVersion: 8,
    occurredAt: "2026-09-10T12:00:00Z",
    payload: { reason: "ROLL_COMPLETED", actorPlayerId: 1, details },
  };
}

function renderObserver(rawEvent) {
  const parsed = parseGameEvent(JSON.stringify(rawEvent), 41);
  const projected = observerNotification(parsed, 2, playerName, squareName);
  const queue = enqueueNotification([], projected);
  return renderToStaticMarkup(React.createElement(ObserverNotificationToast, {
    notification: queue[0],
  }));
}

test("observer notification duration leaves twelve seconds for contextual feedback", () => {
  assert.equal(OBSERVER_NOTIFICATION_DURATION_MS, 12_000);
});

test("rendered P2 observer notification shows a P1 property landing", () => {
  const html = renderObserver(envelope([
    { type: "DICE_ROLLED", dice: 6 },
    { type: "PLAYER_MOVED", fromPosition: 35, toPosition: 1 },
    { type: "LANDED_ON_TILE", squareId: 1 },
    { type: "PROPERTY_AVAILABLE", squareId: 1, amount: 60 },
  ]));

  assert.match(html, /Άννα έριξε 6 και βρέθηκε στο ΓΥΜΝΑΣΤΗΡΙΟ/);
  assert.match(html, /Μπορεί να αγοράσει το ΓΥΜΝΑΣΤΗΡΙΟ για €60/);
  assert.match(html, /data-game-feedback="observer"/);
});

test("rendered observer property notification has no gameplay action controls", () => {
  const html = renderObserver(envelope([
    { type: "DICE_ROLLED", dice: 1 },
    { type: "LANDED_ON_TILE", squareId: 1 },
    { type: "PROPERTY_AVAILABLE", squareId: 1, amount: 60 },
  ]));

  assert.doesNotMatch(html, />Ναι</);
  assert.doesNotMatch(html, />Όχι</);
  assert.doesNotMatch(html, /Αγορά|Άρνηση/);
  assert.match(html, /aria-label="Κλείσιμο ειδοποίησης"/);
});

test("rendered active-player Chance modal keeps thematic REST card text primary", () => {
  const thematicText = "Ο φίλος σου που έχει αμάξι έφυγε πιο νωρίς σήμερα. Πήγαινε στη ΣΤΑΣΗ ΔΙΠΑΕ.";
  const turnResult = {
    dice: 7,
    newPosition: 6,
    passedGo: true,
    squareType: 1,
    data: 6,
    card: { cardId: 1, title: "Chance", text: thematicText, effect: "transport", amount: 6 },
  };
  const html = renderToStaticMarkup(React.createElement(TurnResultModal, {
    visible: true,
    turnResult,
    gamePositions: positions,
  }));

  assert.match(html, new RegExp(thematicText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(html, /Μετακίνηση στο ΣΤΑΣΗ ΔΙΠΑΕ/);
  const visibleText = html.replace(/<[^>]+>/g, "").trim();
  assert.notEqual(visibleText, "Πάρε 200€");
});

test("rendered P2 Chance notification contains the thematic STOMP card text", () => {
  const thematicText = "Ο φίλος σου που έχει αμάξι έφυγε πιο νωρίς σήμερα. Πήγαινε στη ΣΤΑΣΗ ΔΙΠΑΕ.";
  const html = renderObserver(envelope([
    { type: "DICE_ROLLED", dice: 7 },
    { type: "PLAYER_MOVED", fromPosition: 0, toPosition: 6 },
    { type: "LANDED_ON_TILE", squareId: 7 },
    {
      type: "CARD_DRAWN",
      squareId: 7,
      amount: 6,
      card: { cardId: 1, title: "Chance", text: thematicText, effect: "transport", amount: 6 },
    },
    { type: "MONEY_RECEIVED", amount: 200 },
  ], "00000000-0000-0000-0000-000000000002"));

  assert.match(html, /Ο φίλος σου που έχει αμάξι έφυγε πιο νωρίς σήμερα/);
  assert.match(html, /Μετακινήθηκε στο ΣΤΑΣΗ ΔΙΠΑΕ/);
  assert.match(html, /Πέρασε από την ΑΦΕΤΗΡΙΑ και πήρε €200/);
});

test("rendered active and observer Community Chest feedback keeps thematic text", () => {
  const thematicText = "Βρήκες ένα τάλιρο στο πάτωμα. Πάρε $5.";
  const card = { cardId: 23, title: "Community Chest", text: thematicText, effect: "money", amount: 5 };
  const activeHtml = renderToStaticMarkup(React.createElement(TurnResultModal, {
    visible: true,
    turnResult: { dice: 2, newPosition: 2, passedGo: false, squareType: 2, data: 5, card },
    gamePositions: positions,
  }));
  const observerHtml = renderObserver(envelope([
    { type: "DICE_ROLLED", dice: 2 },
    { type: "LANDED_ON_TILE", squareId: 2 },
    { type: "CARD_DRAWN", squareId: 2, amount: 5, card },
  ], "00000000-0000-0000-0000-000000000003"));

  assert.match(activeHtml, /Βρήκες ένα τάλιρο στο πάτωμα/);
  assert.match(activeHtml, /\+€5/);
  assert.match(observerHtml, /Βρήκες ένα τάλιρο στο πάτωμα/);
  assert.match(observerHtml, /\+€5/);
});
