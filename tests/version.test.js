import { test } from "node:test";
import assert from "node:assert/strict";
import { VERSION } from "../js/version.js";

test("Versionsnummer hat die Form v<Zahl>.<Zahl>, auf Test-Branches mit -test:<Branch>", () => {
  assert.match(VERSION, /^v\d+\.\d+(-test(:[a-z0-9-]+)?)?$/);
});
