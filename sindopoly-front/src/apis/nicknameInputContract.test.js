import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Login nickname input preserves raw Unicode and validates on submit", async () => {
  const login = await readFile(new URL("../pages/Login/Login.jsx", import.meta.url), "utf8");

  assert.match(login, /onChange=\{\(e\) => setNickname\(e\.target\.value\)\}/u);
  assert.match(login, /body: JSON\.stringify\(\{ nickname: result\.nickname \}\)/u);
  assert.doesNotMatch(login, /sanitizeText|glin-profanity|onBeforeInput|onKeyPress|pattern=|maxLength=/u);
});
