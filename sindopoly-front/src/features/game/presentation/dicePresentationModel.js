/** Projects only validated authoritative dice facts into the scene boundary. */
export function buildDicePresentationModel({
  die1,
  die2,
  total,
  presentationId,
} = {}) {
  if (!isIntegerBetween(die1, 1, 6)
      || !isIntegerBetween(die2, 1, 6)
      || !isIntegerBetween(total, 2, 12)
      || total !== die1 + die2
      || !Number.isSafeInteger(presentationId)
      || presentationId < 0) {
    return null;
  }
  return Object.freeze({ die1, die2, total, presentationId });
}

function isIntegerBetween(value, minimum, maximum) {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}
