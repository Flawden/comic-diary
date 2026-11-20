import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const login = read("src/app/login/LoginForm.tsx");
const activatePage = read("src/app/activate/page.tsx");
const activateForm = read("src/app/activate/ActivationForm.tsx");
const forgot = read("src/app/forgot-password/page.tsx");
const resetPage = read("src/app/reset-password/page.tsx");
const resetForm = read("src/app/reset-password/ResetPasswordForm.tsx");
const activationAPI = read("src/app/api/auth/activate/redeem/route.ts");
const resetAPI = read("src/app/api/auth/password-reset/redeem/route.ts");
const activationMail = read("src/modules/auth/registration-activation-mail.ts");
const ci = read(".github/workflows/ci.yml");

test("login shows an actual navigable forgot-password link", () => {
  assert.match(login, /href="\/forgot-password"/);
  assert.match(login, /Забыли пароль\?/);
});
test("forgot-password never pretends a reset-link request endpoint exists", () => {
  assert.match(forgot, /Отправка кодов сброса пароля пока не подключена/);
  assert.match(forgot, /href="\/reset-password"/);
  assert.doesNotMatch(forgot, /fetch\(|method="POST"|name="email"/);
});
test("activation page exposes no opt-in and respects strict server flag", () => {
  assert.match(activatePage, /REGISTRATION_ACTIVATION_REDEEM_ENABLED === "true"/);
  assert.match(activatePage, /<ActivationForm enabled=\{enabled\}/);
  assert.match(activationAPI, /registrationActivationRedeemEnabled\(process\.env\.REGISTRATION_ACTIVATION_REDEEM_ENABLED\)/);
});
test("reset page exposes no opt-in and respects strict server flag", () => {
  assert.match(resetPage, /PASSWORD_RESET_REDEEM_ENABLED === "true"/);
  assert.match(resetPage, /<ResetPasswordForm enabled=\{enabled\}/);
  assert.match(resetAPI, /passwordResetRedeemEnabled\(process\.env\.PASSWORD_RESET_REDEEM_ENABLED\)/);
});
test("UI never transmits code in URL", () => {
  for (const form of [activateForm, resetForm]) {
    assert.doesNotMatch(form, /searchParams|location\.hash|location\.search|URLSearchParams|window\.location/);
    assert.match(form, /name="token"/);
    assert.match(form, /autoComplete="off"/);
  }
  assert.match(activationMail, /activationPageUrl = `\$\{origin\}\/activate`/);
});
test("both forms use exactly the existing JSON POST redemption APIs", () => {
  assert.match(activateForm, /fetch\("\/api\/auth\/activate\/redeem", \{/);
  assert.match(resetForm, /fetch\("\/api\/auth\/password-reset\/redeem", \{/);
  for (const form of [activateForm, resetForm]) {
    assert.match(form, /credentials: "same-origin"/);
    assert.match(form, /method: "POST"/);
    assert.match(form, /"Content-Type": "application\/json"/);
    assert.match(form, /JSON\.stringify\(\{ token, newPassword, newPasswordConfirm \}\)/);
  }
});
test("buttons and fields are disabled if the server feature is OFF", () => {
  for (const form of [activateForm, resetForm]) {
    assert.match(form, /if \(!enabled \|\| submitting\) return/);
    assert.match(form, /<fieldset disabled=\{!enabled \|\| submitting\}/);
    assert.match(form, /<button type="submit" disabled=\{!enabled \|\| submitting\}/);
  }
});
test("forms validate both new password entries before POST", () => {
  for (const form of [activateForm, resetForm]) {
    assert.match(form, /newPassword !== newPasswordConfirm/);
    assert.match(form, /name="newPassword" required minLength=\{10\} maxLength=\{256\}/);
    assert.match(form, /name="newPasswordConfirm" required minLength=\{10\} maxLength=\{256\}/);
  }
});
test("redemption UI handles expiry, rate limiting and transport outage honestly", () => {
  for (const form of [activateForm, resetForm]) {
    assert.match(form, /response\.status === 429/);
    assert.match(form, /response\.status === 503/);
    assert.match(form, /invalid_or_expired_token/);
    assert.match(form, /setError\("Нет соединения с сервером/);
    assert.match(form, /role="alert"/);
  }
});
test("successful redemption clears inputs and does not fake a login session", () => {
  for (const form of [activateForm, resetForm]) {
    assert.match(form, /form\.reset\(\)/);
    assert.match(form, /setComplete\(true\)/);
    assert.match(form, /href="\/login"/);
    assert.doesNotMatch(form, /setSessionCookie|router\.replace|document\.cookie/);
  }
});
test("only one code is submitted, never retained in browser storage or logs", () => {
  for (const form of [activateForm, resetForm]) {
    assert.doesNotMatch(form, /console\.|localStorage|sessionStorage|indexedDB|navigator\.sendBeacon/);
    assert.doesNotMatch(form, /sendAuthorized:\s*true|smtp|sendMail|mailgun/i);
  }
});
test("CI executes UI contract but production deployment remains master-only", () => {
  assert.match(ci, /node --test scripts\/auth-user-flows-d1-contract\.test\.mjs/);
  assert.match(ci, /if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/master'/);
});
