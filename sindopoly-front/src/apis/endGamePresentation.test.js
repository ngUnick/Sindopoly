import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { END_GAME_CONTENT } from "../features/game/content/el.js";
import {
  buildCompletionViewModel,
  readCompletionNavigationState,
} from "../features/game/presentation/gameViewModel.js";
import { endedGameSnapshot } from "../test-fixtures/gameRealtimeFixtures.js";

const sourceRoot = new URL("../", import.meta.url);
const readSource = path => readFile(new URL(path, sourceRoot), "utf8");

function completionFor(standings) {
  const winner = standings.find(standing => standing.winner);
  return buildCompletionViewModel({
    ...endedGameSnapshot,
    winner: winner.playerId,
    finalResult: { winnerPlayerId: winner.playerId, standings },
  });
}

test("EndGame presents the authoritative winner, ordered results, and existing home action", async () => {
  const source = await readSource("pages/Game/EndGame.jsx");

  assert.match(source, /readCompletionNavigationState\(location\.state\)/);
  assert.match(source, /completion\.standings\.map/);
  assert.doesNotMatch(source, /\.sort\s*\(|calculate|fetch\s*\(|GameAPI|BoardAPI/);
  assert.match(source, /<main[^>]+aria-labelledby="endgame-title"/);
  assert.match(source, /<ol className="endgame-standings__list">/);
  assert.match(source, /navigate\("\/"\)/);
  assert.doesNotMatch(source, /rematch|επανάληψη/iu);
});

test("two-player completion preserves server standing order and formatted values", () => {
  const completion = completionFor(endedGameSnapshot.finalResult.standings);
  const routeCompletion = readCompletionNavigationState({ completion });

  assert.deepEqual(
    routeCompletion.standings.map(standing => standing.playerId),
    endedGameSnapshot.finalResult.standings.map(standing => standing.playerId),
  );
  assert.equal(routeCompletion.standings.length, 2);
  assert.equal(routeCompletion.standings[0].winner, true);
  assert.equal(routeCompletion.standings[0].totalValueText, "5.250€");
});

test("four-player completion preserves long identities and authoritative ranking", () => {
  const standings = [
    { playerId: 404, nickname: "Δευτεραθλητής", cash: 900, propertyValue: 500, totalValue: 1400, rank: 2, winner: false },
    { playerId: 101, nickname: "ΠολύΜεγάλοΕλληνικόΌνομαΠαίκτηΧωρίςΚενά", cash: 2100, propertyValue: 1300, totalValue: 3400, rank: 1, winner: true },
    { playerId: 303, nickname: "Τρίτος Παίκτης", cash: 700, propertyValue: 300, totalValue: 1000, rank: 3, winner: false },
    { playerId: 202, nickname: "Τέταρτος", cash: 300, propertyValue: 100, totalValue: 400, rank: 4, winner: false },
  ];
  const routeCompletion = readCompletionNavigationState({ completion: completionFor(standings) });

  assert.deepEqual(routeCompletion.standings.map(standing => standing.playerId), [404, 101, 303, 202]);
  assert.equal(routeCompletion.standings[1].nickname, standings[1].nickname);
  assert.equal(routeCompletion.standings[1].rankText, "1η θέση");
  assert.equal(routeCompletion.winnerPlayerId, 101);
});

test("EndGame copy is Greek and fireworks are finite, decorative, and reduced-motion safe", async () => {
  const [source, css] = await Promise.all([
    readSource("pages/Game/EndGame.jsx"),
    readSource("pages/Game/EndGame.css"),
  ]);

  assert.match(END_GAME_CONTENT.gameFinished, /[Α-ω]/u);
  assert.match(END_GAME_CONTENT.finalStandings, /[Α-ω]/u);
  assert.match(END_GAME_CONTENT.returnHome, /[Α-ω]/u);
  assert.match(source, /className="endgame-celebration" aria-hidden="true"/);
  assert.match(source, /const FIREWORK_BURSTS = 3/);
  assert.match(source, /const FIREWORK_RAYS = 10/);
  assert.match(source, /endgame-firework__ray/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.endgame-celebration\s*\{[\s\S]*?display: none;/);
  assert.match(css, /animation: endgame-firework-ray 1\.2s/);
  assert.match(css, /animation-delay: 700ms/);
  assert.match(css, /pointer-events: none/);
  assert.doesNotMatch(css, /animation[^;]*infinite/);
});
