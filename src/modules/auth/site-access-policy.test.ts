import { test } from "node:test";
import assert from "node:assert/strict";
import { canEnterBeta, accessGateExempt } from "./site-access-policy";
test("closed beta denies guest and nonparticipant USER/EDITOR; ADMIN always retains control", () => {
  for (const role of [null, "USER", "EDITOR", "ADMIN"])
    for (const participant of [true, false]) {
      assert.equal(canEnterBeta(false, role, participant), true);
      assert.equal(
        canEnterBeta(true, role, participant),
        role === "ADMIN" || participant,
      );
    }
});
test("content and write endpoints cannot bypass beta gate; authentication remains reachable", () => {
  for (const p of [
    "/",
    "/account",
    "/admin/invitations",
    "/comics/a",
    "/api/community/reviews",
    "/api/library/reading-state",
    "/api/admin/site-access",
    "/api/account/profile",
    "/media/avatars/a.webp",
  ])
    assert.equal(accessGateExempt(p), false, p);
  for (const p of [
    "/beta-wait",
    "/account/delete",
    "/api/account/delete",
    "/api/account/export",
    "/login",
    "/register",
    "/activate",
    "/forgot-password",
    "/reset-password",
    "/api/auth/login",
    "/api/auth/logout",
    "/api/health/ready",
    "/_next/static/a.js",
    "/images/a.webp",
  ])
    assert.equal(accessGateExempt(p), true, p);
});
