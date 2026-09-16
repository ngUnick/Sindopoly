import React from "react";
import PropTypes from "prop-types";

/** Provides a semantic surface for real caller-owned context; empty panels do not render. */
export default function ContextPanel({ title, children }) {
  if (children == null) return null;

  return React.createElement(
    "section",
    { className: "context-panel", "aria-label": title },
    React.createElement("h2", { className: "context-panel__heading" }, title),
    React.createElement("div", { className: "context-panel__content" }, children),
  );
}

ContextPanel.propTypes = {
  title: PropTypes.string.isRequired,
  children: PropTypes.node,
};
