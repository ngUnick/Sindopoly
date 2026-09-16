import { DESIGN_TOKENS } from "./designTokens.js";

const { color, control, layer, motion, radius, shadow, typography } = DESIGN_TOKENS;

/** Ant 5.12 derives palettes in JavaScript, so seed colors must remain literals. */
export const APP_ANT_THEME = Object.freeze({
  token: Object.freeze({
    colorPrimary: color.actionPrimary,
    colorPrimaryHover: color.actionPrimaryHover,
    colorPrimaryActive: color.actionPrimaryActive,
    colorText: color.textPrimary,
    colorTextSecondary: color.textSecondary,
    colorTextPlaceholder: color.textSubdued,
    colorBgContainer: color.surface,
    colorBgElevated: color.surfaceElevated,
    colorBorder: color.borderControl,
    colorBorderSecondary: color.borderStructural,
    colorError: color.errorText,
    colorWarning: color.warningText,
    colorSuccess: color.successText,
    colorInfo: color.informationText,
    colorLink: color.actionPrimary,
    colorFocusBorder: color.focus,
    colorBgTextHover: color.surfaceHover,
    borderRadius: Number.parseInt(radius.control, 10),
    borderRadiusLG: Number.parseInt(radius.panel, 10),
    controlHeight: Number.parseInt(control.minHeight, 10),
    fontFamily: typography.family,
    fontSize: Number.parseInt(typography.sizeMd, 10),
    boxShadow: shadow.low,
    boxShadowSecondary: shadow.high,
    motionDurationFast: seconds(motion.instant),
    motionDurationMid: seconds(motion.short),
    motionDurationSlow: seconds(motion.medium),
    zIndexPopupBase: layer.popover,
  }),
});

function seconds(milliseconds) {
  return `${Number.parseInt(milliseconds, 10) / 1000}s`;
}
