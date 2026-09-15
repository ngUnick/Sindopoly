import React from "react";
import PropTypes from "prop-types";
import {
  ACCESSIBILITY_CONTENT,
  GAMEPLAY_CONTENT,
  formatJailExitOffer,
  formatMoney,
  formatPurchaseOffer,
  formatRentOutcome,
  formatTaxOutcome,
  formatTurnDestination,
  formatTurnMoney,
} from "../features/game/content/el.js";

/** Observer feedback is informational and must not disappear before it is readable. */
export const OBSERVER_NOTIFICATION_DURATION_MS = 12_000;

export function isOptionalTurnChoice(turnResult) {
  return turnResult?.squareType === 5 || turnResult?.squareType === 10;
}

/** Formats the active player's authoritative REST result for the gameplay modal. */
export function formatTurnResultMessage(turnResult, gamePositions) {
  if (!turnResult) return "";
  const { squareType, data, newPosition } = turnResult;
  const square = gamePositions.find(item => item.position === newPosition) ?? {};
  const squareName = square.name || `#${newPosition}`;
  const owner = square.player || null;

  switch (squareType) {
    case 1:
      if (turnResult.card?.text) {
        const destination = gamePositions.find(item => item.position === data)?.name ?? `#${data}`;
        return formatTurnDestination(turnResult.card.text, destination);
      }
      return formatTurnDestination(null, squareName);
    case 2:
      return formatTurnMoney(turnResult.card?.text, data);
    case 3:
      return formatRentOutcome(squareName, owner, data) ?? `${GAMEPLAY_CONTENT.rent}: ${formatMoney(data)}.`;
    case 4:
      return `Πέρασες από την ${GAMEPLAY_CONTENT.start}. Έλαβες ${formatMoney(200)}!`;
    case 5:
      return formatPurchaseOffer(squareName, data);
    case 6:
      return formatTaxOutcome(squareName, data);
    case 7:
      return `Μετακίνηση στη ${GAMEPLAY_CONTENT.jail}!`;
    case 8:
      return `Επίσκεψη στη ${GAMEPLAY_CONTENT.jail}.`;
    case 9:
      return `${GAMEPLAY_CONTENT.freeParking}: χαλάρωσε μέχρι την επόμενη σειρά σου.`;
    case 10:
      return formatJailExitOffer(data);
    default:
      return GAMEPLAY_CONTENT.acknowledge;
  }
}

/** Non-blocking observer feedback; the only control dismisses the notification. */
export function ObserverNotificationToast({ notification, onDismiss = () => {} }) {
  if (!notification) return null;
  return React.createElement(
    "div",
    {
      className: "absolute top-24 right-6 z-40 max-w-sm rounded-md border border-white/60 bg-[rgba(255,236,195,0.95)] p-4 text-black shadow-lg",
      role: "status",
      "data-game-feedback": "observer",
    },
    React.createElement("p", { className: "pr-6 text-sm font-medium" }, notification.message),
    React.createElement(
      "button",
      {
        type: "button",
        "aria-label": ACCESSIBILITY_CONTENT.closeNotification,
        className: "absolute right-2 top-1 text-xl leading-none",
        onClick: onDismiss,
      },
      "×",
    ),
  );
}

ObserverNotificationToast.propTypes = {
  notification: PropTypes.shape({ message: PropTypes.string.isRequired }),
  onDismiss: PropTypes.func,
};

/** Blocking active-player result dialog; action controls exist only for server-created choices. */
export function TurnResultModal({ visible, turnResult, gamePositions, onChoice = () => {} }) {
  if (!visible || !turnResult) return null;
  const optionalChoice = isOptionalTurnChoice(turnResult);
  return React.createElement(
    "div",
    { className: "absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 max-w-25" },
    React.createElement(
      "div",
      {
        className: "bg-[rgba(255,236,195,0.8)] backdrop-blur-sm border border-white/60 rounded-md p-6 shadow-lg",
        role: "dialog",
        "aria-modal": "true",
        "aria-label": ACCESSIBILITY_CONTENT.turnResultDialog,
        "data-game-feedback": "active-player",
      },
      React.createElement(
        "h2",
        { className: "text-xl font-semibold mb-4" },
        formatTurnResultMessage(turnResult, gamePositions),
      ),
      optionalChoice
        ? React.createElement(
            "div",
            { className: "flex space-x-4" },
            React.createElement(
              "button",
              {
                className: "px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700",
                onClick: () => onChoice(true),
              },
              GAMEPLAY_CONTENT.confirm,
            ),
            React.createElement(
              "button",
              {
                className: "px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700",
                onClick: () => onChoice(false),
              },
              GAMEPLAY_CONTENT.decline,
            ),
          )
        : React.createElement(
            "button",
            {
              className: "px-5 py-2 bg-blue-600 text-white rounded hover:bg-blue-700",
              onClick: () => onChoice(true),
            },
            GAMEPLAY_CONTENT.acknowledge,
          ),
    ),
  );
}

TurnResultModal.propTypes = {
  visible: PropTypes.bool.isRequired,
  turnResult: PropTypes.shape({
    squareType: PropTypes.number.isRequired,
    data: PropTypes.number,
    newPosition: PropTypes.number,
    card: PropTypes.shape({ text: PropTypes.string }),
  }),
  gamePositions: PropTypes.arrayOf(PropTypes.shape({
    position: PropTypes.number.isRequired,
    name: PropTypes.string,
    player: PropTypes.string,
  })).isRequired,
  onChoice: PropTypes.func,
};
