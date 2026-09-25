import { DESIGN_TOKENS } from "../../../styles/designTokens.js";

/**
 * Stable presentation slots deliberately own cosmetic identity. Player IDs are
 * assigned to these slots by BoardSceneAdapter, so snapshot ordering cannot
 * change a player's model or semantic accent during a game.
 */
export const PAWN_SLOT_ASSETS = Object.freeze([
  Object.freeze({ id: "backpack", accentColor: DESIGN_TOKENS.color.player1 }),
  Object.freeze({ id: "frappeCup", accentColor: DESIGN_TOKENS.color.player2 }),
  Object.freeze({ id: "graduationCap", accentColor: DESIGN_TOKENS.color.player3 }),
  Object.freeze({ id: "laptop", accentColor: DESIGN_TOKENS.color.player4 }),
]);
