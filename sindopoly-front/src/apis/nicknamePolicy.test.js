import test from "node:test";
import assert from "node:assert/strict";
import { validateNickname } from "../features/player/nicknamePolicy.js";

test("nickname feedback accepts and NFC-normalizes the server policy examples", () => {
  for (const nickname of ["Νίκος", "Γιώργος", "Νικοσ", "ΝΙΚΟΣ", "Nikos", "AΑ_7", "ＡΒ", "Α".repeat(15)]) {
    assert.deepEqual(validateNickname(nickname), { valid: true, nickname });
  }
  assert.deepEqual(validateNickname("Νι\u0301κος"), { valid: true, nickname: "Νίκος" });
});

test("nickname feedback rejects whitespace, unsupported scripts and unsafe characters", () => {
  for (const nickname of [" Νίκος", "Νίκος ", "Νί κος", "Νί  κος", "Νίκος!", "Νίκος😀",
    "Α\u0301\u0301", "Α\u200BΒ", "Α\u202EΒ", "Α\nΒ", "АΒ"]) {
    assert.equal(validateNickname(nickname).valid, false, nickname);
  }
  assert.equal(validateNickname("").reason, "short");
  assert.equal(validateNickname("Α").reason, "short");
  assert.equal(validateNickname("Α".repeat(16)).reason, "long");
  assert.equal(validateNickname(null).valid, false);
});
