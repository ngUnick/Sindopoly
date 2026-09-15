const EMPTY_PROPERTY_IDS = Object.freeze([]);

/**
 * Derives display ownership from the accepted snapshot without inventing game
 * rules. Invalid claims are reported and filtered; cross-player conflicts have
 * no owner so array order can never decide authoritative ownership.
 */
export function deriveOwnershipProjection(snapshot) {
  const players = Array.isArray(snapshot?.players) ? snapshot.players : [];
  const playersById = new Map();
  const claimsBySquareId = new Map();
  const invalidPlayers = [];
  const invalidPropertyClaims = [];
  const duplicatePropertyClaims = [];

  for (const player of players) {
    const playerId = player?.playerId;
    if (!isPlayerId(playerId)) {
      invalidPlayers.push(Object.freeze({ playerId: playerId ?? null }));
      continue;
    }

    playersById.set(playerId, Object.freeze({
      playerId,
      nickname: typeof player.nickname === "string" ? player.nickname : "",
    }));

    if (player.properties != null && !Array.isArray(player.properties)) {
      invalidPropertyClaims.push(Object.freeze({
        playerId,
        propertyId: null,
        reason: "properties-not-array",
      }));
      continue;
    }

    const seenForPlayer = new Set();
    for (const propertyId of player.properties ?? []) {
      if (!isPropertyId(propertyId)) {
        invalidPropertyClaims.push(Object.freeze({
          playerId,
          propertyId: propertyId ?? null,
          reason: "invalid-property-id",
        }));
        continue;
      }
      if (seenForPlayer.has(propertyId)) {
        duplicatePropertyClaims.push(Object.freeze({ playerId, propertyId }));
        continue;
      }
      seenForPlayer.add(propertyId);
      const claimers = claimsBySquareId.get(propertyId) ?? new Set();
      claimers.add(playerId);
      claimsBySquareId.set(propertyId, claimers);
    }
  }

  const ownerBySquareId = {};
  const resolvedByPlayerId = new Map(
    [...playersById.keys()].map(playerId => [playerId, []]),
  );
  const conflicts = [];

  for (const squareId of [...claimsBySquareId.keys()].sort((left, right) => left - right)) {
    const playerIds = [...claimsBySquareId.get(squareId)].sort((left, right) => left - right);
    if (playerIds.length !== 1) {
      conflicts.push(Object.freeze({ squareId, playerIds: Object.freeze(playerIds) }));
      continue;
    }
    const owner = playersById.get(playerIds[0]);
    ownerBySquareId[squareId] = owner;
    resolvedByPlayerId.get(owner.playerId).push(squareId);
  }

  const propertiesByPlayerId = {};
  for (const playerId of [...resolvedByPlayerId.keys()].sort((left, right) => left - right)) {
    propertiesByPlayerId[playerId] = Object.freeze(resolvedByPlayerId.get(playerId));
  }

  return Object.freeze({
    ownerBySquareId: Object.freeze(ownerBySquareId),
    propertiesByPlayerId: Object.freeze(propertiesByPlayerId),
    conflicts: Object.freeze(conflicts),
    invalidPlayers: Object.freeze(invalidPlayers),
    invalidPropertyClaims: Object.freeze(invalidPropertyClaims),
    duplicatePropertyClaims: Object.freeze(duplicatePropertyClaims),
    isValid: conflicts.length === 0
      && invalidPlayers.length === 0
      && invalidPropertyClaims.length === 0
      && duplicatePropertyClaims.length === 0,
  });
}

export function propertyIdsForPlayer(ownership, playerId) {
  if (!isPlayerId(playerId)) return EMPTY_PROPERTY_IDS;
  return ownership?.propertiesByPlayerId?.[playerId] ?? EMPTY_PROPERTY_IDS;
}

/** Preserve the legacy square display shape without mutating its metadata rows. */
export function applyOwnershipToSquares(squares, ownership) {
  if (!Array.isArray(squares)) return EMPTY_PROPERTY_IDS;
  return Object.freeze(squares.map(square => {
    const owner = ownership?.ownerBySquareId?.[square.position];
    return Object.freeze({
      ...square,
      player: owner?.nickname ?? null,
      ownerPlayerId: owner?.playerId ?? null,
    });
  }));
}

function isPlayerId(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function isPropertyId(value) {
  return Number.isSafeInteger(value) && value >= 0;
}
