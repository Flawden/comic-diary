/** C2B4B offline contracts: full-session gate and no auto-login for new accounts. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = (path) => readFileSync(path, "utf8");
const reg = read("src/modules/auth/registration-service.ts");
const registerRoute = read("src/app/api/auth/register/route.ts");
const login = read("src/modules/auth/login-service.ts");
const session = read("src/modules/auth/session-service.ts");
const registerForm = read("src/app/register/RegisterForm.tsx");
const registerPage = read("src/app/register/page.tsx");
const activation = read("src/modules/auth/registration-activation-policy.ts");

test("new registration is explicitly marked pending and never auto-verifies", () => {
  assert.match(reg, /verificationRequiredAt:\s*new Date\(\)/);
  assert.match(reg, /emailVerifiedAt:\s*users\.emailVerifiedAt/);
  assert.doesNotMatch(reg, /emailVerifiedAt:\s*new Date\(\)/);
  assert.match(reg, /role:\s*"USER"/);
});
test("registration route preserves origin and rate limit, but never sets a cookie", () => {
  assert.match(registerRoute, /isSameOriginRequest/);
  assert.match(registerRoute, /consumeRegistrationRateLimit/);
  assert.match(registerRoute, /activationRequired: true/);
  assert.doesNotMatch(registerRoute, /createUserSession|setSessionCookie|session\.token/);
  assert.match(registerRoute, /"no-store"/);
});
test("login verifies password before checking activation state", () => {
  assert.match(login, /verifyPassword\(/);
  assert.match(login, /canUseFullAccountSession\(user\)/);
  assert.ok(login.indexOf('const passwordMatches') < login.indexOf('canUseFullAccountSession(user)'));
});
test("new session creation and reading enforce active verified or historical account", () => {
  assert.match(session, /createUserSession[\s\S]*?canUseFullAccountSession\(userRows\[0\]\)/);
  assert.match(session, /getAuthenticatedSession[\s\S]*?canUseFullAccountSession\(row\)/);
  assert.match(session, /verificationRequiredAt:\s*users\.verificationRequiredAt/g);
  assert.match(session, /emailVerifiedAt:\s*users\.emailVerifiedAt/g);
  assert.match(activation, /state === "verified" \|\| state === "legacy_unverified"/);
});
test("registration UI does not redirect pending users or claim email was sent", () => {
  assert.match(registerForm, /response\.status === 201/);
  assert.match(registerForm, /setPendingActivation\(true\)/);
  assert.ok(registerForm.indexOf('setPendingActivation(true)') < registerForm.indexOf('router.replace('));
  assert.match(registerForm, /письмо ещё не отправлено/);
  assert.doesNotMatch(registerPage, /После регистрации вы сразу войдёте/);
});
