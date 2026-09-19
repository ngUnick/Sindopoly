import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFile } from "node:fs/promises";
import GameLiveAnnouncer, {
  announcementForChange,
} from "../features/game/hud/GameLiveAnnouncer.js";
import ActionFocusRegion from "../features/game/hud/ActionFocusRegion.js";

const state = (turn, connection = "CONNECTED") => ({
  turn: { state: turn, activePlayerId: turn === "OWN_TURN" ? 1 : 2, statusText: turn },
  connection: { state: connection, text: connection },
});

test("live announcement ignores initial and stable snapshots", () => {
  assert.equal(announcementForChange(null, state("OWN_TURN")), "");
  assert.equal(announcementForChange(state("OWN_TURN"), state("OWN_TURN")), "");
});

test("live announcement reports turn handoff and connection transitions once", () => {
  assert.equal(announcementForChange(state("OWN_TURN"), state("OTHER_PLAYER_TURN")), "OTHER_PLAYER_TURN");
  assert.equal(announcementForChange(state("OWN_TURN"), state("OWN_TURN", "OFFLINE")), "OFFLINE");
  assert.equal(announcementForChange(state("OWN_TURN", "OFFLINE"), state("OWN_TURN", "CONNECTED")), "CONNECTED");
});

test("announcer and action focus target are non-tabbable semantic regions", () => {
  const announcement = renderToStaticMarkup(React.createElement(GameLiveAnnouncer, { viewModel: state("OWN_TURN") }));
  const action = renderToStaticMarkup(React.createElement(ActionFocusRegion, { action: null }));
  assert.match(announcement, /aria-live="polite"/);
  assert.match(announcement, /aria-atomic="true"/);
  assert.match(action, /tabindex="-1"/);
  assert.match(action, /aria-label="Διαθέσιμες ενέργειες"/);
});

test("focus and narrow reflow safeguards use visible, bounded styling", async () => {
  const hudCss = await readFile(new URL("../features/game/hud/GameHud.css", import.meta.url), "utf8");
  const shellCss = await readFile(new URL("../features/game/shell/GameShell.css", import.meta.url), "utf8");
  assert.match(hudCss, /\.player-rail__list:focus-visible/);
  assert.match(hudCss, /\.action-focus-region:focus/);
  assert.match(hudCss, /@media \(max-width: 320px\)/);
  assert.match(shellCss, /\.game-live-board-region \[data-game-feedback="observer"\]/);
});
