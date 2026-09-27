import React, { useEffect } from "react";
import PropTypes from "prop-types";
import { ACCESSIBILITY_CONTENT } from "../features/game/content/el.js";
import {
  GAMEPLAY_FEEDBACK_SURFACES,
  buildGameplayFeedback,
} from "../features/game/presentation/gameplayFeedbackModel.js";
import CardReveal from "./CardReveal.js";

/** Quiet feedback remains readable before its local, presentation-only dismissal. */
export const OBSERVER_NOTIFICATION_DURATION_MS = 12_000;

/** Renders one coordinator-owned gameplay outcome without creating another queue or action path. */
export function GameplayFeedback({ outcome, onDismiss = () => {} }) {
  const feedback = outcome?.feedback ?? (outcome ? buildGameplayFeedback({
    kind: outcome.kind,
    body: outcome.text,
    tone: outcome.emphasis,
  }) : null);
  const autoDismiss = feedback?.surface === GAMEPLAY_FEEDBACK_SURFACES.TOAST
    && outcome?.dismissible === true;
  useEffect(() => {
    if (!autoDismiss) return undefined;
    const handle = globalThis.setTimeout(onDismiss, OBSERVER_NOTIFICATION_DURATION_MS);
    return () => globalThis.clearTimeout(handle);
  }, [autoDismiss, onDismiss, outcome?.presentationId]);

  if (!feedback) return null;
  if (feedback.surface === GAMEPLAY_FEEDBACK_SURFACES.CARD) {
    return React.createElement(CardReveal, {
      card: feedback.card,
      dismissible: outcome.dismissible,
      onDismiss,
      presentationId: outcome.presentationId,
    });
  }
  const contextual = feedback.surface === GAMEPLAY_FEEDBACK_SURFACES.CONTEXTUAL;

  return React.createElement(
    "aside",
    {
      className: `gameplay-feedback gameplay-feedback--${feedback.surface}`,
      role: "status",
      "aria-live": "polite",
      "aria-atomic": "true",
      "data-game-feedback": feedback.surface,
      "data-feedback-kind": feedback.kind,
      "data-feedback-tone": feedback.tone,
    },
    React.createElement(
      "div",
      { className: "gameplay-feedback__content" },
      contextual && feedback.title
        ? React.createElement("h2", { className: "gameplay-feedback__title" }, feedback.title)
        : null,
      React.createElement("p", { className: "gameplay-feedback__body" }, feedback.body),
    ),
    outcome.dismissible
      ? React.createElement(
          "button",
          {
            type: "button",
            "aria-label": ACCESSIBILITY_CONTENT.closeNotification,
            className: "gameplay-feedback__dismiss",
            onClick: onDismiss,
          },
          "×",
        )
      : null,
  );
}

GameplayFeedback.propTypes = {
  outcome: PropTypes.shape({
    kind: PropTypes.string.isRequired,
    text: PropTypes.string.isRequired,
    emphasis: PropTypes.string.isRequired,
    dismissible: PropTypes.bool.isRequired,
    presentationId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    feedback: PropTypes.shape({
      kind: PropTypes.string.isRequired,
      title: PropTypes.string,
      body: PropTypes.string.isRequired,
      tone: PropTypes.string.isRequired,
      surface: PropTypes.string.isRequired,
      card: PropTypes.shape({
        accent: PropTypes.oneOf(["chance", "community"]).isRequired,
        category: PropTypes.string.isRequired,
        title: PropTypes.string.isRequired,
        body: PropTypes.string.isRequired,
        effectSummary: PropTypes.string,
      }),
    }),
  }),
  onDismiss: PropTypes.func,
};
