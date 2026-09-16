import React from "react";
import PropTypes from "prop-types";
import {
  GAMEPLAY_CONTENT,
  HUD_CONTENT,
  formatPlayerIdentity,
  formatPropertyCount,
} from "../content/el.js";

/** Displays immutable player presentation facts; identity uses a neutral stable ID marker. */
export default function PlayerCard({ player }) {
  const className = [
    "player-card",
    player.isSelf && "player-card--self",
    player.isActive && "player-card--active",
  ].filter(Boolean).join(" ");

  return React.createElement(
    "li",
    {
      className,
      "aria-current": player.isActive ? "true" : undefined,
      "data-player-id": player.playerId,
      "data-player-self": player.isSelf ? "true" : "false",
    },
    React.createElement(
      "div",
      { className: "player-card__identity-row" },
      React.createElement("span", { className: "player-card__marker", "aria-hidden": "true" }, formatPlayerIdentity(player.playerId)),
      React.createElement("span", { className: "player-card__name" }, player.nickname),
    ),
    React.createElement(
      "div",
      { className: "player-card__badges" },
      player.isSelf && badge(HUD_CONTENT.you, "self"),
      player.isActive && badge(HUD_CONTENT.activePlayer, "active"),
      player.jailed && badge(GAMEPLAY_CONTENT.inJail, "warning"),
      player.bankrupt && badge(HUD_CONTENT.bankrupt, "error"),
      player.afk && badge(HUD_CONTENT.away, "warning"),
    ),
    React.createElement(
      "dl",
      { className: "player-card__facts" },
      React.createElement("div", null,
        React.createElement("dt", null, GAMEPLAY_CONTENT.balance),
        React.createElement("dd", { className: "u-tabular-numbers" }, player.moneyText),
      ),
      React.createElement("div", null,
        React.createElement("dt", null, GAMEPLAY_CONTENT.properties),
        React.createElement("dd", { className: "u-tabular-numbers" }, formatPropertyCount(player.propertyCount)),
      ),
    ),
  );
}

function badge(text, kind) {
  return React.createElement("span", { className: "player-card__badge", "data-badge-kind": kind }, text);
}

PlayerCard.propTypes = {
  player: PropTypes.shape({
    playerId: PropTypes.number.isRequired,
    nickname: PropTypes.string.isRequired,
    isSelf: PropTypes.bool.isRequired,
    isActive: PropTypes.bool.isRequired,
    moneyText: PropTypes.string.isRequired,
    propertyCount: PropTypes.number.isRequired,
    jailed: PropTypes.bool.isRequired,
    bankrupt: PropTypes.bool.isRequired,
    afk: PropTypes.bool.isRequired,
  }).isRequired,
};
