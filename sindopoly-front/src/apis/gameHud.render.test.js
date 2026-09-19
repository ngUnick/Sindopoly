import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ActionTray from "../features/game/hud/ActionTray.js";
import ConnectionStatus from "../features/game/hud/ConnectionStatus.js";
import ContextPanel from "../features/game/hud/ContextPanel.js";
import MatchStatusHeader from "../features/game/hud/MatchStatusHeader.js";
import PlayerCard from "../features/game/hud/PlayerCard.js";
import PlayerRail from "../features/game/hud/PlayerRail.js";
import { ACTION_KINDS, TURN_STATES } from "../features/game/presentation/gameViewModel.js";
import {
  CONNECTION_STATES,
  buildConnectionViewModel,
} from "../features/game/presentation/connectionViewModel.js";
import { TRANSPORT_ERROR_CODES } from "./transportError.js";
import { contentForTransportError } from "../features/game/content/el.js";

const sourceRoot = new URL("../", import.meta.url);
const readSource = path => readFile(new URL(path, sourceRoot), "utf8");
const componentPaths = [
  "features/game/hud/ActionTray.js",
  "features/game/hud/ConnectionStatus.js",
  "features/game/hud/ContextPanel.js",
  "features/game/hud/MatchStatusHeader.js",
  "features/game/hud/PlayerCard.js",
  "features/game/hud/PlayerRail.js",
];
const [componentSource, styles, indexSource, gameSource, authoritativeGameSource] = await Promise.all([
  Promise.all(componentPaths.map(readSource)).then(parts => parts.join("\n")),
  readSource("features/game/hud/GameHud.css"),
  readSource("features/game/hud/index.js"),
  readSource("pages/Game/Game.jsx"),
  readSource("pages/Game/AuthoritativeGame.jsx"),
]);

const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));

function player(overrides = {}) {
  return {
    playerId: 101,
    nickname: "Αΐντα_Ω",
    isSelf: false,
    isActive: false,
    moneyText: "1.440€",
    propertyCount: 2,
    jailed: false,
    bankrupt: false,
    afk: false,
    ...overrides,
  };
}

function turn(state, overrides = {}) {
  return {
    state,
    activePlayerId: 101,
    activePlayerName: "Αΐντα_Ω",
    statusText: "Παίζει τώρα: Αΐντα_Ω",
    waitingText: "Αναμονή για Αΐντα_Ω",
    canShowActions: false,
    ...overrides,
  };
}

function action(overrides = {}) {
  return {
    kind: ACTION_KINDS.ROLL,
    authorized: true,
    enabled: true,
    pending: false,
    primaryLabel: "Ρίξε τα ζάρια",
    secondaryLabel: null,
    canDecline: false,
    statusText: null,
    error: null,
    ...overrides,
  };
}

function findNativeElements(node, type, found = []) {
  if (Array.isArray(node)) {
    node.forEach(child => findNativeElements(child, type, found));
    return found;
  }
  if (!React.isValidElement(node)) return found;
  if (node.type === type) found.push(node);
  React.Children.forEach(node.props.children, child => findNativeElements(child, type, found));
  return found;
}

for (const state of Object.values(CONNECTION_STATES)) {
  test(`ConnectionStatus renders ${state} presentation text and semantics`, () => {
    const model = buildConnectionViewModel(state);
    const html = render(ConnectionStatus, { connection: model });
    assert.match(html, new RegExp(`data-connection-state="${state}"`));
    assert.ok(html.includes(model.text));
    assert.match(html, new RegExp(`data-connection-status="${model.semanticStatus}"`));
  });
}

test("ConnectionStatus omits unknown or absent connection presentation", () => {
  assert.equal(render(ConnectionStatus, { connection: null }), "");
});

for (const [state, text] of [
  [TURN_STATES.OWN_TURN, "Η σειρά σου"],
  [TURN_STATES.OTHER_PLAYER_TURN, "Παίζει τώρα: Αΐντα_Ω"],
  [TURN_STATES.NO_ACTIVE_PLAYER, "Αναμονή για τον επόμενο παίκτη"],
  [TURN_STATES.GAME_COMPLETE, "Το παιχνίδι ολοκληρώθηκε"],
]) {
  test(`MatchStatusHeader renders ${state} without deriving it`, () => {
    const html = render(MatchStatusHeader, {
      turn: turn(state, { statusText: text, waitingText: null }),
      connection: null,
    });
    assert.match(html, new RegExp(`data-turn-state="${state}"`));
    assert.ok(html.includes(text));
  });
}

test("MatchStatusHeader composes the supplied connection model", () => {
  const html = render(MatchStatusHeader, {
    turn: turn(TURN_STATES.OWN_TURN, { statusText: "Η σειρά σου", waitingText: null }),
    connection: buildConnectionViewModel(CONNECTION_STATES.OFFLINE),
  });
  assert.ok(html.includes("Η σύνδεση χάθηκε."));
});

test("status header does not continuously announce stable facts", () => {
  const html = render(MatchStatusHeader, {
    turn: turn(TURN_STATES.OWN_TURN),
    connection: buildConnectionViewModel(CONNECTION_STATES.CONNECTED),
  });
  assert.doesNotMatch(html, /aria-live|role="status"/);
});

test("MatchStatusHeader does not infer turn state from a raw snapshot prop", () => {
  const html = render(MatchStatusHeader, {
    turn: null,
    connection: null,
    snapshot: { playerTurn: 101, players: [player()] },
  });
  assert.equal(html, "");
});

test("MatchStatusHeader never steals focus", () => {
  const html = render(MatchStatusHeader, {
    turn: turn(TURN_STATES.OWN_TURN, { statusText: "Η σειρά σου" }),
    connection: null,
  });
  assert.doesNotMatch(html, /autofocus|tabindex=/i);
});

test("PlayerCard preserves a Unicode nickname and formatted balance", () => {
  const html = render(PlayerCard, { player: player() });
  assert.ok(html.includes("Αΐντα_Ω"));
  assert.ok(html.includes("1.440€"));
});

test("PlayerCard uses a stable neutral ID marker", () => {
  const html = render(PlayerCard, { player: player({ playerId: 247 }) });
  assert.ok(html.includes("#247"));
  assert.match(html, /data-player-id="247"/);
});

test("PlayerCard identifies the authenticated player in text", () => {
  const html = render(PlayerCard, { player: player({ isSelf: true }) });
  assert.ok(html.includes("Εσύ"));
  assert.match(html, /player-card--self/);
});

test("PlayerCard identifies the active player in text and semantics", () => {
  const html = render(PlayerCard, { player: player({ isActive: true }) });
  assert.ok(html.includes("Παίζει τώρα"));
  assert.match(html, /aria-current="true"/);
});

test("PlayerCard supports simultaneous self and active emphasis", () => {
  const html = render(PlayerCard, { player: player({ isSelf: true, isActive: true }) });
  assert.match(html, /player-card--self player-card--active/);
  assert.ok(html.includes("Εσύ") && html.includes("Παίζει τώρα"));
});

for (const [field, label] of [
  ["jailed", "Στη ΦΥΛΑΚΗ"],
  ["bankrupt", "Χρεοκοπία"],
  ["afk", "Απών"],
]) {
  test(`PlayerCard renders ${field} as text, not color alone`, () => {
    const html = render(PlayerCard, { player: player({ [field]: true }) });
    assert.ok(html.includes(label));
  });
}

for (const [count, label] of [[0, "0 ιδιοκτησίες"], [1, "1 ιδιοκτησία"], [4, "4 ιδιοκτησίες"]]) {
  test(`PlayerCard formats property count ${count}`, () => {
    assert.ok(render(PlayerCard, { player: player({ propertyCount: count }) }).includes(label));
  });
}

test("PlayerCard facts use a semantic description list", () => {
  const html = render(PlayerCard, { player: player() });
  assert.match(html, /<dl/);
  assert.match(html, /<dt>Υπόλοιπο<\/dt>/);
  assert.match(html, /<dt>Ιδιοκτησίες<\/dt>/);
});

test("PlayerCard is informational and has no nested controls", () => {
  assert.doesNotMatch(render(PlayerCard, { player: player() }), /<button|tabindex=/);
});

test("PlayerRail renders a labelled list", () => {
  const html = render(PlayerRail, { players: [player()] });
  assert.match(html, /<section[^>]+aria-label="Παίκτες"/);
  assert.match(html, /<ul/);
  assert.match(html, /<li/);
});

test("PlayerRail preserves caller-supplied player order", () => {
  const html = render(PlayerRail, {
    players: [player({ playerId: 101, nickname: "Πρώτος" }), player({ playerId: 102, nickname: "Δεύτερος" })],
  });
  assert.ok(html.indexOf("Πρώτος") < html.indexOf("Δεύτερος"));
});

for (const count of [2, 3, 4]) {
  test(`PlayerRail supports ${count} supplied players`, () => {
    const players = Array.from({ length: count }, (_, index) => player({
      playerId: 101 + index,
      nickname: `Παίκτης ${index + 1}`,
    }));
    const html = render(PlayerRail, { players });
    assert.equal((html.match(/<li/g) ?? []).length, count);
  });
}

test("PlayerRail renders active and self state independently", () => {
  const html = render(PlayerRail, {
    players: [player({ playerId: 101, isSelf: true }), player({ playerId: 102, isActive: true })],
  });
  assert.equal((html.match(/player-card--self/g) ?? []).length, 1);
  assert.equal((html.match(/player-card--active/g) ?? []).length, 1);
});

test("PlayerRail has no synthetic empty-state player", () => {
  assert.equal(render(PlayerRail, { players: [] }), "");
});

test("PlayerRail exposes no ranking or client color identity", () => {
  const html = render(PlayerRail, { players: [player(), player({ playerId: 102 })] });
  assert.doesNotMatch(html, /rank|player-[1-4]/i);
});

test("ActionTray renders one primary roll action", () => {
  const html = render(ActionTray, { action: action(), onPrimaryAction: () => {} });
  assert.equal((html.match(/<button/g) ?? []).length, 1);
  assert.ok(html.includes("Ρίξε τα ζάρια"));
});

test("ActionTray renders purchase accept and decline actions", () => {
  const html = render(ActionTray, {
    action: action({
      kind: ACTION_KINDS.PURCHASE_PROPERTY,
      primaryLabel: "Αγορά για 100€",
      secondaryLabel: "Δεν αγοράζω",
      canDecline: true,
    }),
    onPrimaryAction: () => {},
    onSecondaryAction: () => {},
  });
  assert.equal((html.match(/<button/g) ?? []).length, 2);
  assert.ok(html.includes("Αγορά για 100€") && html.includes("Δεν αγοράζω"));
});

test("ActionTray renders jail payment and skip actions", () => {
  const html = render(ActionTray, {
    action: action({
      kind: ACTION_KINDS.PAY_JAIL_EXIT,
      primaryLabel: "Πληρωμή 50€ και ρίψη",
      secondaryLabel: "Παράλειψη σειράς",
      canDecline: true,
    }),
    onPrimaryAction: () => {},
    onSecondaryAction: () => {},
  });
  assert.ok(html.includes("Πληρωμή 50€ και ρίψη"));
  assert.ok(html.includes("Παράλειψη σειράς"));
});

test("ActionTray waiting state shows status and no action", () => {
  const html = render(ActionTray, {
    action: action({ kind: ACTION_KINDS.WAITING, authorized: false, enabled: false, primaryLabel: null, statusText: "Αναμονή για Νίκο" }),
  });
  assert.ok(html.includes("Αναμονή για Νίκο"));
  assert.doesNotMatch(html, /<button/);
});

test("ActionTray NONE state without feedback renders nothing", () => {
  assert.equal(render(ActionTray, {
    action: action({ kind: ACTION_KINDS.NONE, authorized: false, enabled: false, primaryLabel: null }),
  }), "");
});

for (const reason of ["disabled model", "pending command", "missing callback"]) {
  test(`ActionTray disables primary action for ${reason}`, () => {
    const props = { action: action(), onPrimaryAction: () => {} };
    if (reason === "disabled model") props.action = action({ enabled: false });
    if (reason === "pending command") props.action = action({ enabled: false, pending: true, primaryLabel: "Ρίψη σε εξέλιξη…" });
    if (reason === "missing callback") delete props.onPrimaryAction;
    assert.match(render(ActionTray, props), /<button[^>]+disabled=""/);
  });
}

test("ActionTray marks pending work as busy", () => {
  const html = render(ActionTray, {
    action: action({ enabled: false, pending: true, statusText: "Η ενέργεια είναι σε εξέλιξη…" }),
    onPrimaryAction: () => {},
  });
  assert.match(html, /aria-busy="true"/);
});

test("ActionTray displays normalized transport error content", () => {
  const html = render(ActionTray, {
    action: action({
      enabled: false,
      error: contentForTransportError(TRANSPORT_ERROR_CODES.NETWORK),
    }),
    onPrimaryAction: () => {},
  });
  assert.ok(html.includes("Δεν υπάρχει σύνδεση με τον διακομιστή."));
  assert.match(html, /role="alert"/);
});

test("ActionTray never exposes a secondary button unless the model is declinable", () => {
  const html = render(ActionTray, {
    action: action({ secondaryLabel: "Δεν αγοράζω", canDecline: false }),
    onPrimaryAction: () => {},
    onSecondaryAction: () => {},
  });
  assert.equal((html.match(/<button/g) ?? []).length, 1);
});

test("ActionTray controls are native buttons", () => {
  const html = render(ActionTray, { action: action(), onPrimaryAction: () => {} });
  assert.match(html, /<button type="button"/);
  assert.doesNotMatch(html, /tabindex=/);
});

test("ActionTray native button preserves keyboard activation semantics", () => {
  const tree = ActionTray({ action: action(), onPrimaryAction: () => {} });
  const [button] = findNativeElements(tree, "button");
  assert.equal(button.type, "button");
  assert.equal(button.props.type, "button");
  assert.equal(button.props.disabled, false);
});

test("ActionTray renders the exact supplied presentation label", () => {
  const label = "Επιβεβαίωση δοκιμαστικής ενέργειας";
  const html = render(ActionTray, {
    action: action({ primaryLabel: label }),
    onPrimaryAction: () => {},
  });
  assert.ok(html.includes(label));
});

test("disabled ActionTray control has no callable handler", () => {
  const tree = ActionTray({ action: action({ enabled: false }), onPrimaryAction: () => {} });
  const [button] = findNativeElements(tree, "button");
  assert.equal(button.props.onClick, undefined);
});

test("ActionTray emits one primary intent per click handler call", () => {
  let calls = 0;
  const tree = ActionTray({ action: action(), onPrimaryAction: () => { calls += 1; } });
  const [button] = findNativeElements(tree, "button");
  button.props.onClick();
  assert.equal(calls, 1);
});

test("ActionTray emits one secondary intent per click handler call", () => {
  let calls = 0;
  const tree = ActionTray({
    action: action({ secondaryLabel: "Δεν αγοράζω", canDecline: true }),
    onPrimaryAction: () => {},
    onSecondaryAction: () => { calls += 1; },
  });
  const buttons = findNativeElements(tree, "button");
  buttons[1].props.onClick();
  assert.equal(calls, 1);
});

test("ContextPanel renders real caller-owned content under a heading", () => {
  const html = render(ContextPanel, {
    title: "Ιδιοκτησίες",
    children: React.createElement("p", null, "Πανεπιστημιούπολη Θέρμης"),
  });
  assert.match(html, /aria-label="Ιδιοκτησίες"/);
  assert.ok(html.includes("Πανεπιστημιούπολη Θέρμης"));
});

test("ContextPanel omits an absent child instead of fabricating content", () => {
  assert.equal(render(ContextPanel, { title: "Ιδιοκτησίες", children: null }), "");
});

test("ContextPanel contains no built-in event history", () => {
  assert.doesNotMatch(render(ContextPanel, {
    title: "Ιδιοκτησίες",
    children: React.createElement("p", null, "Πραγματικό περιεχόμενο"),
  }), /Πρόσφατα γεγονότα/);
});

test("HUD components import no transport, controller, scene, or browser APIs", () => {
  assert.doesNotMatch(componentSource, /axios|fetch\(|stomp|sockjs|WebSocket|three|gameService|useEffect|setInterval|setTimeout/i);
});

test("HUD components do not inspect versions, UUIDs, snapshots, or game rules", () => {
  assert.doesNotMatch(
    componentSource,
    /\b(stateVersion|commandId|UUID|squareType|playerTurn|optionalAction)\b|\bsnapshot\./,
  );
});

test("HUD barrel owns the single co-located stylesheet import", () => {
  assert.match(indexSource, /import "\.\/GameHud\.css"/);
  assert.equal((indexSource.match(/\.\/GameHud\.css/g) ?? []).length, 1);
});

test("HUD CSS uses canonical custom properties and no raw colors", () => {
  assert.match(styles, /var\(--color-/);
  assert.match(styles, /var\(--space-/);
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
});

test("HUD CSS enforces the shared control target height", () => {
  assert.match(styles, /min-height: var\(--control-min-height\)/);
});

test("HUD CSS defines tablet and phone adaptation", () => {
  assert.match(styles, /@media \(min-width: 761px\) and \(max-width: 1100px\)/);
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.match(styles, /overflow-x: auto/);
});

test("HUD CSS represents status with text-compatible selectors", () => {
  for (const status of ["ready", "warning", "progress", "error"]) {
    assert.match(styles, new RegExp(`data-connection-status=\\"${status}\\"`));
  }
});

test("production route mounts extracted HUD only through the authoritative owner", () => {
  for (const name of ["ActionTray", "ConnectionStatus", "ContextPanel", "MatchStatusHeader", "PlayerRail"]) {
    assert.doesNotMatch(gameSource, new RegExp(`from .*hud|<${name}`));
  }
  assert.match(authoritativeGameSource, /ActionFocusRegion/);
  assert.match(authoritativeGameSource, /MatchStatusHeader/);
  assert.match(authoritativeGameSource, /PlayerRail/);
});

test("production route mounts the authoritative HUD owner without legacy controls", () => {
  assert.match(gameSource, /<AuthoritativeGame \/>/);
  assert.doesNotMatch(gameSource, /FIRST_VERTICAL_SLICE_ENABLED|legacyBoard|<Board/u);
});
