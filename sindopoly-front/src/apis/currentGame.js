import { decodeCurrentGame } from "./transportDecoders.js";
import { readJsonResponse } from "./transportError.js";

export async function readCurrentGameResponse(response) {
  return readJsonResponse(response, { allowNoContent: true, decoder: decodeCurrentGame });
}

export function continueGameRoute(currentGame, playerId) {
  let decoded;
  try {
    decoded = decodeCurrentGame(currentGame);
  } catch {
    return null;
  }
  if (decoded.status === "lobby") {
    return `/lobby?game_id=${decoded.gameId}&visibility=${decoded.visibility}`;
  }

  const parsedPlayerId = Number(playerId);
  if (!Number.isSafeInteger(parsedPlayerId) || parsedPlayerId <= 0) return null;
  return `/Game?game=${decoded.gameId}&player=${parsedPlayerId}`;
}
