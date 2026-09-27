import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  GameplayFeedback,
  OBSERVER_NOTIFICATION_DURATION_MS,
} from "../components/GameFeedback.js";

test("observer notification duration leaves twelve seconds for contextual feedback", () => {
  assert.equal(OBSERVER_NOTIFICATION_DURATION_MS, 12_000);
});

test("contextual gameplay feedback exposes one polite non-modal live region", () => {
  const html = renderToStaticMarkup(React.createElement(GameplayFeedback, {
    outcome: {
      kind: "ROLL_COMPLETED",
      text: "BaselineHost: πλήρωσε φόρο 200€.",
      emphasis: "negative",
      dismissible: true,
      feedback: {
        kind: "TAX",
        title: "Πληρωμή φόρου",
        body: "BaselineHost: πλήρωσε φόρο 200€.",
        tone: "negative",
        surface: "contextual",
      },
    },
  }));

  assert.match(html, /role="status"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /aria-atomic="true"/);
  assert.match(html, /data-game-feedback="contextual"/);
  assert.match(html, /data-feedback-kind="TAX"/);
  assert.match(html, /Πληρωμή φόρου/);
  assert.match(html, /BaselineHost: πλήρωσε φόρο 200€/);
  assert.match(html, /aria-label="Κλείσιμο ειδοποίησης"/);
  assert.doesNotMatch(html, /role="dialog"|aria-modal/);
});

test("card gameplay feedback renders one polite non-modal reveal with a local close control", () => {
  const html = renderToStaticMarkup(React.createElement(GameplayFeedback, {
    outcome: {
      kind: "ROLL_RESULT",
      text: "Έληξε η κάρτα του ΟΑΣΘ.",
      emphasis: "highlight",
      presentationId: 10,
      dismissible: true,
      feedback: {
        kind: "CARD", title: "ΚΑΡΤΑ ΑΠΟΦΑΣΗΣ", body: "Έληξε η κάρτα του ΟΑΣΘ.",
        tone: "highlight", surface: "card",
        card: {
          accent: "community", category: "Κάρτα γεγονότος", title: "ΚΑΡΤΑ ΑΠΟΦΑΣΗΣ",
          body: "Έληξε η κάρτα του ΟΑΣΘ.", effectSummary: "Μετρητά: -50€",
        },
      },
    },
  }));

  assert.match(html, /data-game-feedback="card"/);
  assert.match(html, /data-card-accent="community"/);
  assert.match(html, /data-card-state="revealed"/);
  assert.match(html, /role="status"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /Κάρτα γεγονότος/);
  assert.match(html, /Μετρητά: -50€/);
  assert.match(html, /aria-label="Κλείσιμο κάρτας"/);
  assert.doesNotMatch(html, /role="dialog"|aria-modal/);
});

test("legacy outcome uses the quiet safe fallback without inventing controls", () => {
  const html = renderToStaticMarkup(React.createElement(GameplayFeedback, {
    outcome: {
      kind: "FUTURE_CONFIRMED_EVENT",
      text: "Το παιχνίδι ενημερώθηκε.",
      emphasis: "neutral",
      dismissible: false,
    },
  }));

  assert.match(html, /data-game-feedback="toast"/);
  assert.match(html, /data-feedback-kind="FUTURE_CONFIRMED_EVENT"/);
  assert.match(html, /Το παιχνίδι ενημερώθηκε/);
  assert.doesNotMatch(html, /<button/);
});
