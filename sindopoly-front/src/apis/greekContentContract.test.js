import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sourceRoot = new URL("../", import.meta.url);
const readSource = relativePath => readFile(new URL(relativePath, sourceRoot), "utf8");

test("transport modules remain language-neutral", async () => {
  const sources = await Promise.all([
    readSource("apis/transportError.js"),
    readSource("apis/transportDecoders.js"),
    readSource("apis/gameEventDecoder.js"),
  ]);
  assert.doesNotMatch(sources.join("\n"), /[Α-ω]/u);
});

test("the content boundary has no network, realtime, React, or Three dependencies", async () => {
  const source = await readSource("features/game/content/el.js");
  assert.doesNotMatch(source, /fetch\s*\(|sockjs|stomp|three|react/iu);
});

test("migrated user-message paths do not render raw exception messages", async () => {
  const sources = await Promise.all([
    readSource("pages/Home/Home.jsx"),
    readSource("pages/Lobby/Lobby.jsx"),
  ]);
  assert.doesNotMatch(sources.join("\n"), /(?:err|error)\??\.message/);
});

test("the frontend content boundary does not duplicate board or thematic card catalogs", async () => {
  const source = await readSource("features/game/content/el.js");
  assert.doesNotMatch(source, /ΓΥΜΝΑΣΤΗΡΙΟ|ΒΙΒΛΙΟΘΗΚΗ|Βρήκες ένα τάλιρο|Ο φίλος σου που έχει αμάξι/u);
});
