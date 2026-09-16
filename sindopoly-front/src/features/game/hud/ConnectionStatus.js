import React from "react";
import PropTypes from "prop-types";

/** Renders caller-supplied connection presentation without estimating transport health. */
export default function ConnectionStatus({ connection }) {
  if (!connection?.text) return null;

  return React.createElement(
    "span",
    {
      className: "game-connection-status",
      "data-connection-state": connection.state,
      "data-connection-status": connection.semanticStatus,
    },
    React.createElement("span", {
      className: "game-connection-status__indicator",
      "aria-hidden": "true",
    }),
    React.createElement("span", null, connection.text),
  );
}

ConnectionStatus.propTypes = {
  connection: PropTypes.shape({
    state: PropTypes.string.isRequired,
    semanticStatus: PropTypes.oneOf(["ready", "warning", "progress", "error"]).isRequired,
    text: PropTypes.string.isRequired,
    canSubmitCommands: PropTypes.bool.isRequired,
  }),
};
