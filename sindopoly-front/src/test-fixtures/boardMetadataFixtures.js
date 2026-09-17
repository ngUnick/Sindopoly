const BOARD_TYPES = Object.freeze([
  "START", "BROWN", "CARD", "BROWN", "TAX", "TRAIN", "CYAN", "CARD", "CYAN", "CYAN",
  "JAIL", "PURPLE", "UTILITY", "PURPLE", "PURPLE", "TRAIN", "ORANGE", "CARD", "ORANGE", "ORANGE",
  "PARKING", "RED", "CARD", "RED", "RED", "TRAIN", "YELLOW", "YELLOW", "UTILITY", "YELLOW",
  "GOJAIL", "GREEN", "GREEN", "CARD", "GREEN", "TRAIN", "CARD", "BLUE", "TAX", "BLUE",
]);

const PROPERTY_TYPES = new Set([
  "TRAIN", "UTILITY", "BROWN", "CYAN", "PURPLE", "ORANGE",
  "RED", "YELLOW", "GREEN", "BLUE",
]);

const REPRESENTATIVE_NAMES = Object.freeze({
  0: "ΑΦΕΤΗΡΙΑ",
  1: "ΓΥΜΝΑΣΤΗΡΙΟ",
  10: "ΦΥΛΑΚΗ",
  20: "ΝΑΥΤΙΛΟΣ",
  30: "ΠΑΝΕ ΣΤΗ ΦΥΛΑΚΗ",
  39: "ΗΛΕΚΤΡΟΝΙΚΗΣ",
});

export function createBoardMetadataPayload() {
  return BOARD_TYPES.map((type, position) => ({
    position,
    name: REPRESENTATIVE_NAMES[position] ?? `Τετράγωνο ${position}`,
    type,
    property: PROPERTY_TYPES.has(type) ? {
      purchasePrice: 100 + position,
      baseRent: type === "UTILITY" ? null : position + 1,
      group: type,
    } : null,
  }));
}
