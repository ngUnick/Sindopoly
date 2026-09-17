const BOARD_SIZE = 40;

/** Builds an immutable semantic index; boardCalibration remains the geometry owner. */
export function buildBoardMetadataIndex(squares) {
  if (!Array.isArray(squares) || squares.length !== BOARD_SIZE) return null;
  const ordered = [];
  for (let position = 0; position < BOARD_SIZE; position += 1) {
    const square = squares[position];
    if (square?.position !== position) return null;
    ordered.push(Object.freeze({
      position,
      name: square.name,
      type: square.type,
      property: square.property == null ? null : Object.freeze({ ...square.property }),
    }));
  }
  const frozen = Object.freeze(ordered);
  return Object.freeze({ ordered: frozen, byPosition: frozen });
}

export function getSquareMetadata(index, position) {
  if (!Number.isSafeInteger(position) || position < 0 || position >= BOARD_SIZE) return null;
  return index?.byPosition?.[position] ?? null;
}
