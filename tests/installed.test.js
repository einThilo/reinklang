import { test } from "node:test";
import assert from "node:assert/strict";
import { isInstalledApp } from "../js/installed.js";

const fakeWindow = ({ matches = false, standalone } = {}) => ({
  matchMedia: () => ({ matches }),
  navigator: standalone === undefined ? {} : { standalone }
});

test("im Browser-Tab: nicht installiert", () => {
  assert.equal(isInstalledApp(fakeWindow()), false);
});

test("Anzeigeart aus dem Manifest: installiert (Android)", () => {
  assert.equal(isInstalledApp(fakeWindow({ matches: true })), true);
});

test("navigator.standalone: installiert (iOS)", () => {
  assert.equal(isInstalledApp(fakeWindow({ standalone: true })), true);
});

test("ohne matchMedia und navigator: nicht installiert", () => {
  assert.equal(isInstalledApp({}), false);
});
