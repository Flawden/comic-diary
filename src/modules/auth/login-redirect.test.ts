import { test } from "node:test";
import assert from "node:assert/strict";
import { getSafeLoginRedirect } from "./login-redirect";
test("successful login never returns to a cached beta waiting page", () => {
  for (const p of ["/beta-wait", "/beta-wait?old=1#blocked", "/login"])
    assert.equal(getSafeLoginRedirect(p), "/");
  assert.equal(getSafeLoginRedirect("/library"), "/library");
});
test("login redirect still rejects external destinations", () => {
  for (const p of [
    "https://outside.invalid",
    "//outside.invalid",
    "/\\outside.invalid",
  ])
    assert.equal(getSafeLoginRedirect(p), "/");
});
