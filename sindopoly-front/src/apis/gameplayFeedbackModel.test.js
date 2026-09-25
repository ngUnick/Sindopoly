import assert from "node:assert/strict";
import test from "node:test";
import {
  GAMEPLAY_FEEDBACK_SURFACES,
  buildCardRevealModel,
  buildGameplayFeedback,
} from "../features/game/presentation/gameplayFeedbackModel.js";
import { buildPresentationTransaction } from "../features/game/presentation/presentationTransaction.js";

test("feedback model copies one bounded immutable semantic presentation", () => {
  const model = buildGameplayFeedback({
    kind: "RENT",
    title: "Πληρωμή ενοικίου",
    body: "Η Άννα πλήρωσε 40€ στον Νίκο.",
    tone: "negative",
    surface: GAMEPLAY_FEEDBACK_SURFACES.CONTEXTUAL,
  });

  assert.deepEqual(model, {
    kind: "RENT",
    title: "Πληρωμή ενοικίου",
    body: "Η Άννα πλήρωσε 40€ στον Νίκο.",
    tone: "negative",
    surface: "contextual",
  });
  assert.equal(Object.isFrozen(model), true);
});

test("card feedback accepts only a bounded, semantic card model", () => {
  const card = buildCardRevealModel({
    accent: "chance",
    category: "Κάρτα γεγονότος",
    title: "ΚΑΡΤΑ ΕΝΤΟΛΗΣ",
    body: "Πήγαινε στη ΣΤΑΣΗ ΔΙΠΑΕ.",
    effectSummary: "Μετακίνηση: ΣΤΑΣΗ ΔΙΠΑΕ",
  });
  const feedback = buildGameplayFeedback({
    kind: "CARD", title: card.title, body: card.body, tone: "highlight",
    surface: GAMEPLAY_FEEDBACK_SURFACES.CARD, card,
  });

  assert.equal(Object.isFrozen(card), true);
  assert.equal(Object.isFrozen(feedback.card), true);
  assert.equal(feedback.surface, "card");
  assert.equal(buildGameplayFeedback({
    kind: "CARD", body: "x", surface: GAMEPLAY_FEEDBACK_SURFACES.CARD,
  }), null);
  assert.equal(buildCardRevealModel({ accent: "future", category: "x", title: "x", body: "x" }), null);
});

test("feedback model rejects malformed or unbounded presentation data", () => {
  assert.equal(buildGameplayFeedback(), null);
  assert.equal(buildGameplayFeedback({ kind: "RENT", body: "x", tone: "fatal" }), null);
  assert.equal(buildGameplayFeedback({ kind: "RENT", body: "x", surface: "modal" }), null);
  assert.equal(buildGameplayFeedback({ kind: "x".repeat(129), body: "x" }), null);
});

test("presentation normalization preserves optional feedback inside the existing transaction", () => {
  const transaction = buildPresentationTransaction({
    presentationId: "event:12",
    stateVersion: 12,
    actorPlayerId: 7,
    outcome: {
      kind: "TURN_TIMED_OUT",
      text: "Ο χρόνος έληξε.",
      emphasis: "warning",
      dismissible: true,
      feedback: {
        kind: "TURN_TIMEOUT",
        title: "Λήξη χρόνου",
        body: "Ο χρόνος έληξε.",
        tone: "warning",
        surface: "contextual",
      },
    },
  });

  assert.equal(transaction.outcome.feedback.kind, "TURN_TIMEOUT");
  assert.equal(Object.isFrozen(transaction.outcome.feedback), true);
  assert.equal(buildPresentationTransaction({
    presentationId: "event:13",
    stateVersion: 13,
    outcome: {
      kind: "FUTURE",
      text: "Confirmed.",
      emphasis: "neutral",
      dismissible: true,
      feedback: { kind: "FUTURE", body: "Confirmed.", surface: "modal" },
    },
  }), null);
});
