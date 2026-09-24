export const GAMEPLAY_FEEDBACK_SURFACES = Object.freeze({
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
} = {}) {
  if (!hasBoundedText(kind, 128)
      || title != null && !hasBoundedText(title, 160)
      || !hasBoundedText(body, 2_000)
      || !TONES.has(tone)
      || !SURFACES.has(surface)) return null;

  return Object.freeze({ kind, title, body, tone, surface });
}

function hasBoundedText(value, maximum) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
}
