import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Button, ConfigProvider } from "antd";
import tailwindConfig from "../../tailwind.config.js";
import {
  CSS_CUSTOM_PROPERTIES,
  DESIGN_TOKENS,
} from "../styles/designTokens.js";
import { APP_ANT_THEME } from "../styles/antTheme.js";

const sourceRoot = new URL("../", import.meta.url);
const readSource = path => readFile(new URL(path, sourceRoot), "utf8");

test("required semantic foundation and text colors are present", () => {
  const { color } = DESIGN_TOKENS;
  assert.deepEqual(
    [
      color.shell,
      color.surface,
      color.surfaceElevated,
      color.surfaceStrong,
      color.borderStructural,
      color.borderControl,
      color.textPrimary,
      color.textSecondary,
      color.textSubdued,
      color.textInverse,
    ],
    [
      "#172522",
      "#FFF8E8",
      "#FFFCF4",
      "#233D38",
      "#C8BAA2",
      "#81725F",
      "#1B2927",
      "#435754",
      "#5F706D",
      "#FFF9EF",
    ],
  );
});

test("approved action, interaction, and status colors are present", () => {
  const { color } = DESIGN_TOKENS;
  assert.equal(color.actionPrimary, "#0F6B62");
  assert.equal(color.actionPrimaryHover, "#0B5B54");
  assert.equal(color.actionPrimaryActive, "#084A45");
  assert.equal(color.actionSecondary, "#EFE6D6");
  assert.equal(color.actionDestructive, "#A33A35");
  assert.equal(color.focus, "#075EE8");
  assert.equal(color.selection, "#D7EFEA");
  assert.deepEqual(
    [color.successText, color.warningText, color.errorText, color.informationText],
    ["#176B47", "#754A00", "#8B2C29", "#245C78"],
  );
});

test("approved surface and primary constants remain exact", () => {
  assert.equal(DESIGN_TOKENS.color.surface, "#FFF8E8");
  assert.equal(DESIGN_TOKENS.color.actionPrimary, "#0F6B62");
  assert.equal(DESIGN_TOKENS.color.focus, "#075EE8");
});

test("player identity and property-group color roles are complete", () => {
  const { color } = DESIGN_TOKENS;
  assert.deepEqual(
    [color.player1, color.player2, color.player3, color.player4],
    ["#00796B", "#B23A48", "#3F60B5", "#8B5A00"],
  );
  assert.deepEqual(
    [
      color.propertyBrown,
      color.propertyCyan,
      color.propertyMagenta,
      color.propertyOrange,
      color.propertyRed,
      color.propertyYellow,
      color.propertyGreen,
      color.propertyBlue,
    ],
    ["#7A4F35", "#2E7D91", "#A13D73", "#B65D1E", "#B23A48", "#9A7400", "#34744B", "#3F60B5"],
  );
});

test("spacing and radius scales match the approved foundation", () => {
  assert.deepEqual(Object.values(DESIGN_TOKENS.spacing), [
    "4px", "8px", "12px", "16px", "24px", "32px", "48px",
  ]);
  assert.deepEqual(DESIGN_TOKENS.radius, {
    control: "8px",
    panel: "12px",
    major: "18px",
    pill: "999px",
  });
});

test("typography stack and scale are available without claiming a bundled font", () => {
  const { typography } = DESIGN_TOKENS;
  assert.equal(typography.family, '"Noto Sans", "Segoe UI", Arial, sans-serif');
  assert.deepEqual(
    [typography.sizeXs, typography.sizeSm, typography.sizeMd, typography.sizeLg,
      typography.sizeXl, typography.sizeDisplay],
    ["12px", "14px", "16px", "20px", "28px", "36px"],
  );
});

test("motion, shadow, surface, and layer scales are bounded and complete", () => {
  assert.deepEqual(DESIGN_TOKENS.motion, {
    instant: "100ms",
    short: "180ms",
    medium: "280ms",
    long: "460ms",
    reduced: "1ms",
    easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
  });
  assert.equal(DESIGN_TOKENS.shadow.low, "0 2px 8px rgba(23, 37, 34, 0.16)");
  assert.equal(DESIGN_TOKENS.surface.standardOpacity, 0.96);
  assert.deepEqual(Object.values(DESIGN_TOKENS.layer), [0, 10, 20, 30, 1000, 1100, 1200, 1300]);
});

test("focus and control foundations use the approved accessible dimensions", () => {
  assert.equal(DESIGN_TOKENS.focus.ringWidth, "3px");
  assert.equal(DESIGN_TOKENS.focus.ringOffset, "3px");
  assert.equal(DESIGN_TOKENS.control.minHeight, "44px");
});

test("key foreground and border pairs preserve accessible contrast", () => {
  const { color } = DESIGN_TOKENS;
  assert.ok(contrast(color.textPrimary, color.surface) >= 7);
  assert.ok(contrast(color.textSecondary, color.surface) >= 7);
  assert.ok(contrast(color.textSubdued, color.surface) >= 4.5);
  assert.ok(contrast(color.textInverse, color.surfaceStrong) >= 7);
  assert.ok(contrast(color.textInverse, color.actionPrimary) >= 4.5);
  assert.ok(contrast(color.focus, color.surface) >= 3);
  assert.ok(contrast(color.borderControl, color.surfaceElevated) >= 3);
});

test("CSS custom properties mirror the canonical JavaScript source", async () => {
  const css = await readSource("styles/tokens.css");
  assert.deepEqual(readRootProperties(css), stringValues(CSS_CUSTOM_PROPERTIES));
});

test("token CSS provides visible focus, selection, tabular numbers, and reduced motion", async () => {
  const css = await readSource("styles/tokens.css");
  assert.match(css, /:focus-visible/);
  assert.match(css, /outline:\s*var\(--focus-ring-width\) solid var\(--color-focus\)/);
  assert.doesNotMatch(css, /outline:\s*none/);
  assert.match(css, /::selection/);
  assert.match(css, /font-variant-numeric:\s*tabular-nums/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(css, /animation:\s*none\s*!important/);
});

test("root imports the CSS token interface exactly once", async () => {
  const [main, index] = await Promise.all([
    readSource("main.jsx"),
    readSource("index.css"),
  ]);
  assert.equal((`${main}\n${index}`.match(/styles\/tokens\.css/g) ?? []).length, 1);
});

test("Ant theme maps canonical palette, shape, and control values", () => {
  const { token } = APP_ANT_THEME;
  const { color } = DESIGN_TOKENS;
  assert.equal(token.colorPrimary, color.actionPrimary);
  assert.equal(token.colorBgContainer, color.surface);
  assert.equal(token.colorText, color.textPrimary);
  assert.equal(token.colorTextSecondary, color.textSecondary);
  assert.equal(token.colorBorder, color.borderControl);
  assert.equal(token.colorError, color.errorText);
  assert.equal(token.colorWarning, color.warningText);
  assert.equal(token.colorSuccess, color.successText);
  assert.equal(token.borderRadius, 8);
  assert.equal(token.controlHeight, 44);
});

test("Ant derivative inputs are literals rather than unsafe CSS var expressions", () => {
  assert.doesNotMatch(JSON.stringify(APP_ANT_THEME), /var\(--/);
});

test("application owns one root Ant theme while legacy local overrides remain nested", async () => {
  const app = await readSource("App.jsx");
  assert.match(app, /<ConfigProvider theme=\{APP_ANT_THEME\}>/);
  assert.match(app, /<Router>/);
});

test("a retained Ant primitive renders under the application theme", () => {
  const markup = renderToStaticMarkup(React.createElement(
    ConfigProvider,
    { theme: APP_ANT_THEME },
    React.createElement(Button, { type: "primary" }, "Ενέργεια"),
  ));
  assert.match(markup, /<button/);
  assert.match(markup, /ant-btn-primary/);
  assert.match(markup, />Ενέργεια<\/span>/u);
});

test("Tailwind aliases consume CSS variables and compile", async () => {
  const config = {
    ...tailwindConfig,
    content: [{ raw: '<div class="bg-surface text-primary border-structural bg-action-primary rounded-control p-space-4 font-interface shadow-low z-chrome"></div>' }],
  };
  const result = await postcss([tailwindcss(config)]).process("@tailwind utilities;", { from: undefined });
  assert.match(result.css, /background-color:\s*var\(--color-surface\)/);
  assert.match(result.css, /color:\s*var\(--color-text-primary\)/);
  assert.match(result.css, /border-color:\s*var\(--color-border-structural\)/);
  assert.match(result.css, /border-radius:\s*var\(--radius-control\)/);
  assert.match(result.css, /padding:\s*var\(--space-4\)/);
  assert.match(result.css, /font-family:\s*var\(--font-family-interface\)/);
  assert.match(result.css, /z-index:\s*var\(--layer-chrome\)/);
});

test("theme sources have no component, scene, transport, persistence, or rule dependencies", async () => {
  const source = (await Promise.all([
    readSource("styles/designTokens.js"),
    readSource("styles/antTheme.js"),
    readSource("styles/tokens.css"),
  ])).join("\n");
  assert.doesNotMatch(source, /from\s+["']react|three|fetch\s*\(|apiClient|sockjs|stomp|redis|mariadb/iu);
  assert.doesNotMatch(source, /dice|rent|playerTurn|optionalAction|stateVersion|calculate/iu);
});

test("token and theme sources do not own background or board assets", async () => {
  const source = (await Promise.all([
    readSource("styles/designTokens.js"),
    readSource("styles/antTheme.js"),
    readSource("styles/tokens.css"),
  ])).join("\n");
  assert.doesNotMatch(source, /monopoly_bg|board\.glb|Dice\.glb|background-image|url\(/iu);
});

function readRootProperties(css) {
  const body = css.match(/:root\s*{([\s\S]*?)}/)?.[1] ?? "";
  return Object.fromEntries(body
    .split(";")
    .map(declaration => declaration.trim())
    .filter(Boolean)
    .map((declaration) => {
      const separator = declaration.indexOf(":");
      return [declaration.slice(0, separator).trim(), declaration.slice(separator + 1).trim()];
    }));
}

function stringValues(values) {
  return Object.fromEntries(Object.entries(values).map(([name, value]) => [name, String(value)]));
}

function contrast(left, right) {
  const [light, dark] = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

function luminance(hex) {
  const channels = hex.match(/[0-9a-f]{2}/giu).map(value => Number.parseInt(value, 16) / 255);
  const linear = channels.map(value => value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4);
  return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
}
