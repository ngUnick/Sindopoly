import React from "react";
import PropTypes from "prop-types";
import { HUD_CONTENT } from "../content/el.js";
import ConnectionStatus from "./ConnectionStatus.js";

/** Presents accepted turn and connection facts without owning timers or subscriptions. */
export default function MatchStatusHeader({ turn, connection }) {
  if (!turn && !connection) return null;
  const secondaryText = turn?.waitingText && turn.waitingText !== turn.statusText
    ? turn.waitingText
    : null;

  return React.createElement(
    "div",
    {
      className: "match-status-header",
      "aria-label": HUD_CONTENT.matchStatus,
    },
    turn && React.createElement(
      "div",
      { className: "match-status-header__turn", "data-turn-state": turn.state },
      turn.statusText && React.createElement("p", { className: "match-status-header__primary" }, turn.statusText),
      secondaryText && React.createElement("p", { className: "match-status-header__secondary" }, secondaryText),
    ),
    React.createElement(ConnectionStatus, { connection }),
  );
}

MatchStatusHeader.propTypes = {
  turn: PropTypes.shape({
    state: PropTypes.string.isRequired,
    activePlayerId: PropTypes.number,
    activePlayerName: PropTypes.string,
    statusText: PropTypes.string,
    waitingText: PropTypes.string,
    canShowActions: PropTypes.bool.isRequired,
  }),
  connection: ConnectionStatus.propTypes.connection,
};
