export const GAMEPLAY_FEEDBACK_SURFACES = Object.freeze({
  CARD: "card",
  CONTEXTUAL: "contextual",
  TOAST: "toast",
});

const SURFACES = new Set(Object.values(GAMEPLAY_FEEDBACK_SURFACES));
const TONES = new Set(["neutral", "positive", "negative", "warning", "highlight"]);

/** Copies already-confirmed display facts into one bounded, non-interactive feedback model. */
export function buildGameplayFeedback({
  kind,
  title = null,
  body,
  tone = "neutral",
  surface = GAMEPLAY_FEEDBACK_SURFACES.TOAST,
  card = null,
} = {}) {
  if (!hasBoundedText(kind, 128)
      || title != null && !hasBoundedText(title, 160)
      || !hasBoundedText(body, 2_000)
      || !TONES.has(tone)
      || !SURFACES.has(surface)) return null;

  const cardModel = card == null ? null : buildCardRevealModel(card);
  if (surface === GAMEPLAY_FEEDBACK_SURFACES.CARD && cardModel == null
      || surface !== GAMEPLAY_FEEDBACK_SURFACES.CARD && card != null) return null;

  return Object.freeze({
    kind,
    title,
    body,
    tone,
    surface,
    ...(cardModel && { card: cardModel }),
  });
}

/** Keeps the card's user-facing copy separate from raw event identifiers and mechanics. */
export function buildCardRevealModel({
  accent,
  category,
  title,
  body,
  effectSummary = null,
} = {}) {
  if (!CARD_ACCENTS.has(accent)
      || !hasBoundedText(category, 120)
      || !hasBoundedText(title, 160)
      || !hasBoundedText(body, 2_000)
      || effectSummary != null && !hasBoundedText(effectSummary, 280)) return null;
  return Object.freeze({ accent, category, title, body, effectSummary });
}

const CARD_ACCENTS = new Set(["chance", "community"]);

function hasBoundedText(value, maximum) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
}
