import {
  GAMEPLAY_FEEDBACK_CONTENT,
  formatCardCategory,
  formatSignedMoney,
} from "../content/el.js";
import {
  GAMEPLAY_FEEDBACK_SURFACES,
  buildGameplayFeedback,
} from "./gameplayFeedbackModel.js";

const CARD_TYPES = Object.freeze({
  Chance: Object.freeze({ accent: "chance", effect: "transport" }),
  "Community Chest": Object.freeze({ accent: "community", effect: "money" }),
});

/** Projects known decoded card facts into one presentational, non-authoritative card surface. */
export function buildCardRevealFeedback({
  card, destinationName = null, supplementalEffect = null,
} = {}) {
  if (!isCard(card)) return null;
  const type = CARD_TYPES[card.title];
  if (!type || type.effect !== card.effect) return null;

  const primaryEffect = card.effect === "money"
    ? `${GAMEPLAY_FEEDBACK_CONTENT.cardCash}: ${formatSignedMoney(card.amount)}`
    : hasText(destinationName)
      ? `${GAMEPLAY_FEEDBACK_CONTENT.cardMovement}: ${destinationName}`
      : null;
  const effectSummary = [primaryEffect, hasText(supplementalEffect) ? supplementalEffect : null]
    .filter(Boolean)
    .join(" · ") || null;

  return buildGameplayFeedback({
    kind: "CARD",
    title: formatCardCategory(card.title),
    body: card.text,
    tone: "highlight",
    surface: GAMEPLAY_FEEDBACK_SURFACES.CARD,
    card: {
      accent: type.accent,
      category: GAMEPLAY_FEEDBACK_CONTENT.cardReveal,
      title: formatCardCategory(card.title),
      body: card.text,
      effectSummary,
    },
  });
}

function isCard(card) {
  return card != null
    && typeof card === "object"
    && Number.isSafeInteger(card.cardId)
    && card.cardId > 0
    && hasText(card.title)
    && hasText(card.text)
    && hasText(card.effect)
    && Number.isSafeInteger(card.amount);
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}
