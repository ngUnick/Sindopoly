import React from "react";
import PropTypes from "prop-types";
import { ACCESSIBILITY_CONTENT } from "../content/el.js";

/** Resets only local presentation state through the mounted scene adapter. */
export default function CameraResetControl({ onReset, disabled = false }) {
  return React.createElement(
    "button",
    {
      type: "button",
      className: "game-camera-reset",
      "aria-label": ACCESSIBILITY_CONTENT.resetCamera,
      title: ACCESSIBILITY_CONTENT.resetCamera,
      disabled: disabled || typeof onReset !== "function",
      onClick: disabled || typeof onReset !== "function" ? undefined : onReset,
    },
    React.createElement("span", { "aria-hidden": "true" }, "↺"),
  );
}

CameraResetControl.propTypes = {
  onReset: PropTypes.func,
  disabled: PropTypes.bool,
};
