import React from "react";
import PropTypes from "prop-types";
import { HUD_CONTENT } from "../content/el.js";

/** Emits user intent only; authorization and enabled state come from the presentation model. */
export default function ActionTray({
  action,
  onPrimaryAction,
  onSecondaryAction,
}) {
  if (!action) return null;

  const errorText = action.error?.message ?? null;
  const showPrimary = action.authorized === true && Boolean(action.primaryLabel);
  const showSecondary = showPrimary
    && action.canDecline === true
    && Boolean(action.secondaryLabel);
  if (!showPrimary && !action.statusText && !errorText) return null;

  const primaryDisabled = !action.enabled || action.pending || typeof onPrimaryAction !== "function";
  const secondaryDisabled = !action.enabled || action.pending || typeof onSecondaryAction !== "function";

  return React.createElement(
    "section",
    {
      className: "action-tray",
      "aria-label": HUD_CONTENT.availableActions,
      "aria-busy": action.pending ? "true" : undefined,
      "data-action-kind": action.kind,
    },
    React.createElement(
      "div",
      { className: "action-tray__copy" },
      action.statusText && React.createElement("p", { className: "action-tray__status" }, action.statusText),
      errorText && React.createElement("p", { className: "action-tray__error", role: "alert" }, errorText),
    ),
    showPrimary && React.createElement(
      "div",
      { className: "action-tray__controls" },
      React.createElement(
        "button",
        {
          type: "button",
          className: "action-tray__primary",
          disabled: primaryDisabled,
          onClick: primaryDisabled ? undefined : () => onPrimaryAction(),
        },
        action.primaryLabel,
      ),
      showSecondary && React.createElement(
        "button",
        {
          type: "button",
          className: "action-tray__secondary",
          disabled: secondaryDisabled,
          onClick: secondaryDisabled ? undefined : () => onSecondaryAction(),
        },
        action.secondaryLabel,
      ),
    ),
  );
}

ActionTray.propTypes = {
  action: PropTypes.shape({
    kind: PropTypes.string.isRequired,
    authorized: PropTypes.bool.isRequired,
    enabled: PropTypes.bool.isRequired,
    pending: PropTypes.bool.isRequired,
    primaryLabel: PropTypes.string,
    secondaryLabel: PropTypes.string,
    canDecline: PropTypes.bool,
    statusText: PropTypes.string,
    error: PropTypes.shape({ message: PropTypes.string.isRequired }),
  }),
  onPrimaryAction: PropTypes.func,
  onSecondaryAction: PropTypes.func,
};
