import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { ACCESSIBILITY_CONTENT } from "../features/game/content/el.js";

export const CARD_REVEAL_DISMISS_DURATION_MS = 220;

/** A non-blocking, coordinator-owned reveal for one already-confirmed card event. */
export default function CardReveal({
  card,
  dismissible,
  onDismiss = () => {},
  presentationId = null,
}) {
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => setDismissing(false), [presentationId]);
  useEffect(() => {
    if (!dismissing) return undefined;
    const handle = globalThis.setTimeout(onDismiss, CARD_REVEAL_DISMISS_DURATION_MS);
    return () => globalThis.clearTimeout(handle);
  }, [dismissing, onDismiss]);

  return React.createElement(
    "aside",
    {
      className: "card-reveal",
      role: "status",
      "aria-live": "polite",
      "aria-atomic": "true",
      "data-game-feedback": "card",
      "data-card-accent": card.accent,
      "data-card-state": dismissing ? "dismissing" : "revealed",
    },
    React.createElement("p", { className: "card-reveal__category" }, card.category),
    React.createElement("h2", { className: "card-reveal__title" }, card.title),
    React.createElement("p", { className: "card-reveal__body" }, card.body),
    card.effectSummary && React.createElement("p", { className: "card-reveal__effect" }, card.effectSummary),
    dismissible && React.createElement(
      "button",
      {
        type: "button",
        "aria-label": ACCESSIBILITY_CONTENT.closeCard,
        className: "card-reveal__dismiss",
        disabled: dismissing,
        onClick: () => setDismissing(true),
      },
      "×",
    ),
  );
}

CardReveal.propTypes = {
  card: PropTypes.shape({
    accent: PropTypes.oneOf(["chance", "community"]).isRequired,
    category: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    body: PropTypes.string.isRequired,
    effectSummary: PropTypes.string,
  }).isRequired,
  dismissible: PropTypes.bool.isRequired,
  onDismiss: PropTypes.func,
  presentationId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
};
