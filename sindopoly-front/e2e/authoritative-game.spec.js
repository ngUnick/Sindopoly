/* eslint-env node */
import { test, expect } from "@playwright/test";

const backendURL = process.env.SINDOPOLY_BACKEND_URL || "http://localhost:8080";
const uniqueNickname = suffix => `Playwright_${suffix}_${Date.now()}`;

async function readJSON(response, label) {
  const body = await response.text();
  if (!response.ok()) throw new Error(`${label} failed (${response.status()}): ${body}`);
  return body ? JSON.parse(body) : null;
}

async function createPlayer(request, nickname) {
  const response = await request.post(`${backendURL}/api/player-state/create`, { data: { nickname } });
  return Number(await readJSON(response, "create player"));
}

async function csrfToken(request) {
  return readJSON(await request.get(`${backendURL}/api/session/csrf`), "csrf token");
}

async function command(request, path, expectedVersion, payload, label) {
  const csrf = await csrfToken(request);
  const response = await request.post(`${backendURL}${path}`, {
    data: payload,
    headers: {
      [csrf.headerName]: csrf.token,
      "X-Sindopoly-Command-Id": crypto.randomUUID(),
      "X-Sindopoly-Expected-Version": String(expectedVersion),
    },
  });
  return readJSON(response, label);
}

async function snapshot(request, gameId) {
  return readJSON(await request.get(`${backendURL}/api/game-state/${gameId}/snapshot`), "game snapshot");
}

test("two isolated authenticated contexts converge on the authoritative game", async ({ browser, request }, testInfo) => {
  const ownerRequest = await request.newContext();
  const guestRequest = await request.newContext();
  const ownerName = uniqueNickname("owner");
  const guestName = uniqueNickname("guest");
  let ownerContext;
  let guestContext;
  const consoleErrors = { owner: [], guest: [] };

  try {
    const ownerId = await createPlayer(ownerRequest, ownerName);
    const ownerCreate = await command(ownerRequest, "/api/game-state/create", -1,
      { ownerId, visibility: "public" }, "create game");
    const gameId = Number(ownerCreate.gameId ?? ownerCreate.id);
    expect(gameId).toBeGreaterThan(0);

    const guestId = await createPlayer(guestRequest, guestName);
    const lobbyResponse = await guestRequest.get(`${backendURL}/api/game-state/public-lobby`);
    const lobbies = await readJSON(lobbyResponse, "public lobby");
    const lobby = lobbies.find(item => Number(item.gameId) === gameId);
    expect(lobby).toBeTruthy();
    await command(guestRequest, `/api/game-state/add/${gameId}/${guestId}`,
      Number(lobby.stateVersion), undefined, "join game");

    const beforeStart = await snapshot(ownerRequest, gameId);
    await command(ownerRequest, `/api/game-state/${gameId}/start?playerId=${ownerId}`,
      Number(beforeStart.stateVersion), undefined, "start game");

    ownerContext = await browser.newContext({ storageState: await ownerRequest.storageState() });
    guestContext = await browser.newContext({ storageState: await guestRequest.storageState() });
    const ownerPage = await ownerContext.newPage();
    const guestPage = await guestContext.newPage();
    for (const [page, key] of [[ownerPage, "owner"], [guestPage, "guest"]]) {
      page.on("console", message => {
        if (message.type() === "error") consoleErrors[key].push(message.text());
      });
      page.on("pageerror", error => consoleErrors[key].push(error.message));
    }
    await Promise.all([
      ownerContext.tracing.start({ screenshots: true, snapshots: true }),
      guestContext.tracing.start({ screenshots: true, snapshots: true }),
    ]);
    await Promise.all([
      ownerPage.goto(`/Game?game=${gameId}&player=${ownerId}`),
      guestPage.goto(`/Game?game=${gameId}&player=${guestId}`),
    ]);
    await Promise.all([
      expect(ownerPage.locator("canvas")).toHaveCount(1),
      expect(guestPage.locator("canvas")).toHaveCount(1),
      expect(ownerPage.getByRole("main")).toBeVisible(),
      expect(guestPage.getByRole("main")).toBeVisible(),
    ]);

    await expect(ownerPage.getByRole("button", { name: "Ρίξε τα ζάρια" })).toBeVisible();
    await expect(guestPage.getByRole("button", { name: "Ρίξε τα ζάρια" })).toHaveCount(0);
    await ownerPage.getByRole("button", { name: "Ρίξε τα ζάρια" }).press("Enter");
    await expect(ownerPage.locator(".game-shell__header")).toContainText(/σειρά|Παίζει τώρα/);
    await expect(guestPage.locator(".game-shell__header")).toContainText(/σειρά|Παίζει τώρα/);

    const decline = ownerPage.getByRole("button", { name: "Δεν αγοράζω" });
    if (await decline.count()) await decline.click();
    await guestPage.reload();
    await expect(guestPage.locator("canvas")).toHaveCount(1);
    await expect(guestPage.getByRole("main")).toBeVisible();
    expect(consoleErrors).toEqual({ owner: [], guest: [] });
  } catch (error) {
    await testInfo.attach("console-errors.json", {
      body: JSON.stringify(consoleErrors, null, 2), contentType: "application/json",
    });
    throw error;
  } finally {
    for (const [context, name] of [[ownerContext, "owner"], [guestContext, "guest"]]) {
      if (context) {
        await context.tracing.stop({ path: testInfo.outputPath(`${name}-trace.zip`) }).catch(() => {});
        await context.close();
      }
    }
    await ownerRequest.dispose();
    await guestRequest.dispose();
  }
});
