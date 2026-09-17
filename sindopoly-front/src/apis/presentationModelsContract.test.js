import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const presentationRoot = new URL("../features/game/presentation/", import.meta.url);
const readPresentation = file => readFile(new URL(file, presentationRoot), "utf8");

test("presentation modules have no effects or rendering dependencies", async () => {
  const source = (await Promise.all([
    readPresentation("gameViewModel.js"),
    readPresentation("connectionViewModel.js"),
    readPresentation("eventViewModel.js"),
    readPresentation("eventHistory.js"),
  ])).join("\n");
  assert.doesNotMatch(
    source,
    /fetch\s*\(|apiClient|sockjs|stomp|react|three|redis|mariadb|localStorage|sessionStorage/iu,
  );
});

test("game presentation depends on ownership projection and Greek content", async () => {
  const source = await readPresentation("gameViewModel.js");
  assert.match(source, /ownershipProjection\.js/);
  assert.match(source, /content\/el\.js/);
});

test("presentation models format authoritative completion values without rule calculation", async () => {
  const source = (await Promise.all([
    readPresentation("gameViewModel.js"),
    readPresentation("eventViewModel.js"),
    readPresentation("eventHistory.js"),
  ])).join("\n");
  assert.doesNotMatch(
    source,
    /priceMap|totalCapital|properties\s*\.\s*reduce|purchasePrice\s*[+*]|afford|money\s*[<>]=?|calculateRent/iu,
  );
});

test("production completion path retires query-string and hard-coded price authority", async () => {
  const sourceRoot = new URL("../", import.meta.url);
  const [board, endGame] = await Promise.all([
    readFile(new URL("pages/Game/Board.jsx", sourceRoot), "utf8"),
    readFile(new URL("pages/Game/EndGame.jsx", sourceRoot), "utf8"),
  ]);
  assert.doesNotMatch(`${board}\n${endGame}`, /priceMap|totalCapital|properties\s*\.\s*reduce/iu);
  assert.doesNotMatch(endGame, /useSearchParams|searchParams|get\(["']capital|BoardAPI/iu);
  assert.match(board, /buildCompletionViewModel\(snapshot\)/);
  assert.match(board, /state:\s*\{\s*completion\s*\}/);
});

test("presentation models introduce no state or memoization library", async () => {
  const source = (await Promise.all([
    readPresentation("gameViewModel.js"),
    readPresentation("eventHistory.js"),
  ])).join("\n");
  assert.doesNotMatch(source, /redux|zustand|rxjs|reselect|useMemo|memoize/iu);
});

test("session history consumes presentation text without formatting raw event details", async () => {
  const source = await readPresentation("eventHistory.js");
  assert.match(source, /EVENT_HISTORY_CONTENT/);
  assert.doesNotMatch(source, /payload|details|JSON\.parse|formatGameEventFact/iu);
});
