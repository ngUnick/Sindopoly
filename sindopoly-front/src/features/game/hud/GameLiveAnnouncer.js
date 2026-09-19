import React, { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";

/** Announce transitions, not snapshot refreshes or the already-live outcome toast. */
export function announcementForChange(previous, current) {
  if (!previous || !current) return "";
  const oldTurn = previous.turn;
  const newTurn = current.turn;
  if (newTurn?.statusText && (
    oldTurn?.state !== newTurn.state
    || oldTurn?.activePlayerId !== newTurn.activePlayerId
  )) return newTurn.statusText;

  const oldConnection = previous.connection;
  const newConnection = current.connection;
  if (newConnection?.text && oldConnection?.state !== newConnection.state) {
    return newConnection.text;
  }
  return "";
}

export default function GameLiveAnnouncer({ viewModel }) {
  const previous = useRef(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const next = announcementForChange(previous.current, viewModel);
    previous.current = viewModel;
    if (next) setMessage(next);
  }, [viewModel]);

  return React.createElement("div", {
    className: "game-live-announcer",
    role: "status",
    "aria-live": "polite",
    "aria-atomic": "true",
  }, message);
}

GameLiveAnnouncer.propTypes = { viewModel: PropTypes.object };
