import React from "react";
import PropTypes from "prop-types";
import { HUD_CONTENT } from "../content/el.js";
import PlayerCard from "./PlayerCard.js";

/** Preserves authoritative snapshot order and adds no client-side ranking or color mapping. */
export default function PlayerRail({ players }) {
  if (!players.length) return null;

  return React.createElement(
    "section",
    { className: "player-rail", "aria-label": HUD_CONTENT.players },
    React.createElement("h2", { className: "player-rail__heading" }, HUD_CONTENT.players),
    React.createElement(
      "ul",
      { className: "player-rail__list" },
      players.map(player => React.createElement(PlayerCard, { key: player.playerId, player })),
    ),
  );
}

PlayerRail.propTypes = {
  players: PropTypes.arrayOf(PlayerCard.propTypes.player).isRequired,
};
