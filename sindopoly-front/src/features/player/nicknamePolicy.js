const GREEK_OR_LATIN_LETTER = /^(?=\p{L}$)(?:\p{Script=Greek}|\p{Script=Latin})$/u;

/** Mirrors the server's create-time policy for immediate feedback only. */
export function validateNickname(input) {
  if (typeof input !== "string" || input.length > 64) return { valid: false, reason: "characters" };
  const nickname = input.normalize("NFC");
  const characters = Array.from(nickname);
  if (characters.length < 2) return { valid: false, reason: "short" };
  if (characters.length > 15) return { valid: false, reason: "long" };
  if (!characters.every(character => GREEK_OR_LATIN_LETTER.test(character)
      || /^[0-9_]$/u.test(character))) {
    return { valid: false, reason: "characters" };
  }
  return { valid: true, nickname };
}
