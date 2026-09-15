import test from "node:test";
import assert from "node:assert/strict";
import {
  ACCESSIBILITY_CONTENT,
  CONNECTION_CONTENT,
  ERROR_CONTENT,
  GAME_EVENT_FACT_TYPES,
  GAMEPLAY_CONTENT,
  contentForTransportError,
  formatCurrentTurn,
  formatDiceResult,
  formatGameEventFact,
  formatMoney,
  formatPlayingNow,
  formatSignedMoney,
  formatTurnHandoff,
  formatWaitingForPlayer,
} from "../features/game/content/el.js";
import { TRANSPORT_ERROR_CODES } from "./transportError.js";

const expectedErrorMessages = new Map([
  [TRANSPORT_ERROR_CODES.UNAUTHENTICATED, "Η συνεδρία σου έχει λήξει. Συνδέσου ξανά."],
  [TRANSPORT_ERROR_CODES.FORBIDDEN, "Δεν έχεις δικαίωμα να κάνεις αυτή την ενέργεια."],
  [TRANSPORT_ERROR_CODES.NOT_FOUND, "Το παιχνίδι που ζήτησες δεν είναι διαθέσιμο."],
  [TRANSPORT_ERROR_CODES.VALIDATION, "Έλεγξε τα στοιχεία και προσπάθησε ξανά."],
  [TRANSPORT_ERROR_CODES.STALE_STATE, "Το παιχνίδι έχει ήδη αλλάξει. Ενημερώνουμε την κατάσταση…"],
  [TRANSPORT_ERROR_CODES.CONFLICT, "Η ενέργεια δεν ολοκληρώθηκε, επειδή το παιχνίδι άλλαξε."],
  [TRANSPORT_ERROR_CODES.NETWORK, "Δεν υπάρχει σύνδεση με τον διακομιστή."],
  [TRANSPORT_ERROR_CODES.SERVER, "Παρουσιάστηκε πρόβλημα στον διακομιστή."],
  [TRANSPORT_ERROR_CODES.INVALID_PAYLOAD, "Λάβαμε μη έγκυρα δεδομένα. Γίνεται επαναφόρτωση της κατάστασης."],
  [TRANSPORT_ERROR_CODES.UNKNOWN, "Κάτι πήγε στραβά. Προσπάθησε ξανά."],
]);

for (const [code, expectedMessage] of expectedErrorMessages) {
  test(`${code} maps to safe Greek content`, () => {
    const rawText = "Redis password and stack trace from the backend";
    const content = contentForTransportError({ code, message: rawText });
    assert.equal(content.message, expectedMessage);
    assert.equal(content.message.includes(rawText), false);
    assert.equal(typeof content.severity, "string");
    assert.equal(typeof content.action, "string");
  });
}

test("an unrecognized error code uses the UNKNOWN fallback", () => {
  assert.equal(
    contentForTransportError({ code: "NEW_SERVER_REASON", message: "raw backend text" }),
    ERROR_CONTENT[TRANSPORT_ERROR_CODES.UNKNOWN],
  );
});

test("formats zero euros", () => assert.equal(formatMoney(0), "0€"));
test("formats fifty euros", () => assert.equal(formatMoney(50), "50€"));
test("formats one hundred and twenty euros", () => assert.equal(formatMoney(120), "120€"));
test("groups thousands using the Greek convention", () => assert.equal(formatMoney(1380), "1.380€"));
test("formats a negative amount", () => assert.equal(formatMoney(-50), "-50€"));
test("formats an explicitly signed positive amount", () => assert.equal(formatSignedMoney(50), "+50€"));
test("invalid money facts fail safely", () => assert.equal(formatMoney(Number.NaN), "—"));

test("provides the own-turn label", () => assert.equal(formatCurrentTurn(), "Η σειρά σου"));
test("formats another player's turn without gender inference", () => {
  assert.equal(formatPlayingNow("Μαρία"), "Παίζει τώρα: Μαρία");
});
test("formats a waiting state without declining the name", () => {
  assert.equal(formatWaitingForPlayer("Νίκος"), "Αναμονή για Νίκος");
});
test("formats the viewer's dice result", () => assert.equal(formatDiceResult(8), "Έφερες 8."));
test("formats another player's dice result neutrally", () => {
  assert.equal(formatDiceResult(8, "Νίκος"), "Νίκος: έφερε 8.");
});
test("formats a turn handoff", () => assert.equal(formatTurnHandoff(), "Η σειρά σου ολοκληρώθηκε"));

test("formats a roll event", () => {
  assert.equal(formatGameEventFact({ type: GAME_EVENT_FACT_TYPES.ROLL, playerName: "Νίκος", total: 8 }), "Νίκος: έφερε 8.");
});
test("formats a movement/landing event", () => {
  assert.equal(formatGameEventFact({ type: GAME_EVENT_FACT_TYPES.LANDING, playerName: "Νίκος", squareName: "ΒΙΒΛΙΟΘΗΚΗ" }), "Νίκος → ΒΙΒΛΙΟΘΗΚΗ.");
});
test("formats a purchase event", () => {
  assert.equal(formatGameEventFact({ type: GAME_EVENT_FACT_TYPES.PURCHASE, playerName: "Νίκος", squareName: "ΒΙΒΛΙΟΘΗΚΗ", amount: 120 }), "Νίκος αγόρασε: ΒΙΒΛΙΟΘΗΚΗ, 120€.");
});
test("formats a purchase-decline event", () => {
  assert.equal(formatGameEventFact({ type: GAME_EVENT_FACT_TYPES.PURCHASE_DECLINED, playerName: "Νίκος", squareName: "ΒΙΒΛΙΟΘΗΚΗ" }), "Νίκος: δεν έγινε αγορά για ΒΙΒΛΙΟΘΗΚΗ.");
});
test("formats a rent event", () => {
  assert.equal(formatGameEventFact({ type: GAME_EVENT_FACT_TYPES.RENT, playerName: "Νίκος", amount: 120, counterpartyName: "Μαρία" }), "Νίκος: πλήρωσε 120€ για ενοίκιο σε Μαρία.");
});
test("formats a tax/expense event", () => {
  assert.equal(formatGameEventFact({ type: GAME_EVENT_FACT_TYPES.TAX, playerName: "Νίκος", amount: 50 }), "Νίκος: πλήρωσε φόρο 50€.");
});
test("formats a money event", () => {
  assert.equal(formatGameEventFact({ type: GAME_EVENT_FACT_TYPES.MONEY, playerName: "Νίκος", amount: 50 }), "Νίκος: μεταβολή μετρητών +50€.");
});
test("formats a Start reward event", () => {
  assert.equal(formatGameEventFact({ type: GAME_EVENT_FACT_TYPES.START_REWARD, playerName: "Νίκος", amount: 200 }), "Νίκος: πέρασε από την ΑΦΕΤΗΡΙΑ και έλαβε 200€.");
});
test("formats a card event and its mechanical result", () => {
  assert.equal(formatGameEventFact({ type: GAME_EVENT_FACT_TYPES.CARD, playerName: "Νίκος", category: "Chance", cardText: "Κέρδισες έναν διαγωνισμό.", amount: 50 }), "Νίκος: ΚΑΡΤΑ ΕΝΤΟΛΗΣ — Κέρδισες έναν διαγωνισμό. (+50€)");
});
test("formats a jail event", () => {
  assert.equal(formatGameEventFact({ type: GAME_EVENT_FACT_TYPES.JAIL, playerName: "Νίκος" }), "Νίκος: στη ΦΥΛΑΚΗ.");
});
test("formats a turn-change event", () => {
  assert.equal(formatGameEventFact({ type: GAME_EVENT_FACT_TYPES.TURN_CHANGE, playerName: "Μαρία" }), "Παίζει τώρα: Μαρία");
});
test("formats a timeout event", () => {
  assert.equal(formatGameEventFact({ type: GAME_EVENT_FACT_TYPES.TIMEOUT, playerName: "Νίκος" }), "Νίκος: ο χρόνος έληξε.");
});
test("formats game completion", () => {
  assert.equal(formatGameEventFact({ type: GAME_EVENT_FACT_TYPES.COMPLETION, winnerName: "Μαρία" }), "Το παιχνίδι ολοκληρώθηκε. Κέρδισε: Μαρία");
});
test("unknown or insufficient event facts fail safely", () => {
  assert.equal(formatGameEventFact({ type: "UNKNOWN", playerName: "Νίκος" }), null);
  assert.equal(formatGameEventFact({ type: GAME_EVENT_FACT_TYPES.RENT, playerName: "Νίκος" }), null);
});

test("server thematic card text is preserved verbatim", () => {
  const thematicText = "Βρήκες ένα τάλιρο στο πάτωμα. Πάρε $5.";
  const result = formatGameEventFact({
    type: GAME_EVENT_FACT_TYPES.CARD,
    playerName: "Άννα",
    category: "Community Chest",
    cardText: thematicText,
    amount: 5,
  });
  assert.equal(result.includes(thematicText), true);
});

test("a Unicode Greek nickname passes through unchanged", () => {
  assert.equal(formatPlayingNow("Αΐντα_Ω"), "Παίζει τώρα: Αΐντα_Ω");
});
test("player names are neither gender-inferred nor declined", () => {
  const result = formatDiceResult(6, "Σάσα");
  assert.equal(result, "Σάσα: έφερε 6.");
  assert.doesNotMatch(result, /\bΟ\b|\bΗ\b|Νικητής|Νικήτρια/u);
});

test("connection and recovery copy hides implementation terminology", () => {
  const values = Object.values(CONNECTION_CONTENT);
  assert.equal(values.includes("Γίνεται επανασύνδεση…"), true);
  assert.equal(values.includes("Η σύνδεση αποκαταστάθηκε"), true);
  assert.doesNotMatch(values.join(" "), /STOMP|Redis|HTTP|409/u);
});
test("canonical gameplay and accessibility labels are available", () => {
  assert.equal(GAMEPLAY_CONTENT.roll, "Ρίξε τα ζάρια");
  assert.equal(GAMEPLAY_CONTENT.properties, "Ιδιοκτησίες");
  assert.equal(ACCESSIBILITY_CONTENT.muteMusic, "Σίγαση μουσικής");
  assert.equal(ACCESSIBILITY_CONTENT.showProperties, "Προβολή ιδιοκτησιών");
});
