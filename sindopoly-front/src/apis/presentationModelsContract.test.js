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
  ])).join("\n");
  assert.doesNotMatch(source, /fetch\s*\(|apiClient|sockjs|stomp|react|three|redis|mariadb/iu);
});

test("game presentation depends on ownership projection and Greek content", async () => {
  const source = await readPresentation("gameViewModel.js");
  assert.match(source, /ownershipProjection\.js/);
  assert.match(source, /content\/el\.js/);
});

test("presentation models contain no capital, ranking, affordability, or rule calculation", async () => {
  const source = (await Promise.all([
    readPresentation("gameViewModel.js"),
    readPresentation("eventViewModel.js"),
  ])).join("\n");
  assert.doesNotMatch(source, /priceMap|totalCapital|propertyValue|ranking|afford|money\s*[<>]=?|calculateRent/iu);
});

test("presentation models introduce no state or memoization library", async () => {
  const source = await readPresentation("gameViewModel.js");
  assert.doesNotMatch(source, /redux|zustand|reselect|useMemo|memoize/iu);
});
