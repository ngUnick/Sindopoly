import React, { useEffect, useRef } from "react";
import { HUD_CONTENT } from "../content/el.js";
import ActionTray from "./ActionTray.js";

/** Keep keyboard focus in the action landmark when a confirmed transition removes its focused control. */
export default function ActionFocusRegion({ action, onPrimaryAction, onSecondaryAction }) {
  const region = useRef(null);
  const hadControlFocus = useRef(false);

  useEffect(() => {
    if (!hadControlFocus.current || document.activeElement !== document.body) return;
    const target = region.current?.querySelector("button:not(:disabled)") ?? region.current;
    target?.focus();
    hadControlFocus.current = false;
  }, [action]);

  return React.createElement(
    "div",
    {
      ref: region,
      className: "action-focus-region",
      role: "group",
      tabIndex: -1,
      "aria-label": HUD_CONTENT.availableActions,
      onFocusCapture: event => {
        if (event.target?.tagName === "BUTTON") hadControlFocus.current = true;
      },
      onBlurCapture: event => {
        if (event.relatedTarget && !region.current?.contains(event.relatedTarget)) {
          hadControlFocus.current = false;
        }
      },
    },
    React.createElement(ActionTray, { action, onPrimaryAction, onSecondaryAction }),
  );
}

ActionFocusRegion.propTypes = ActionTray.propTypes;
