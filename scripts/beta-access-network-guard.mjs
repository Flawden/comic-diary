/** Test-only preload for the compiled standalone server. Never deployed or loaded by the app. */
import http from "node:http";
import https from "node:https";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const names =
  "PASSWORD_RESET_REQUEST_ENABLED PASSWORD_RESET_REQUEST_MAIL_READY PASSWORD_RESET_REDEEM_ENABLED AUTH_RECOVERY_WORKER_ENABLED AUTH_RECOVERY_DISPATCH_ENABLED AUTH_RECOVERY_SENDER_VERIFIED AUTH_RECOVERY_RESEND_CONFIG_READY REGISTRATION_ENABLED REGISTRATION_ACTIVATION_REDEEM_ENABLED AUTH_ACTIVATION_RESEND_CONFIG_READY AUTH_ACTIVATION_SENDER_VERIFIED AUTH_ACTIVATION_DISPATCH_ENABLED AUTH_ACTIVATION_WORKER_ENABLED AUTH_ACTIVATION_OPERATOR_CONTROL_ENABLED AUTH_LEGACY_EMAIL_VERIFICATION_ENABLED AUTH_LEGACY_EMAIL_VERIFICATION_REQUEST_ENABLED AUTH_BETA_INVITATION_REGISTRATION_ENABLED AUTH_BETA_INVITATION_DISPATCH_ENABLED".split(
    " ",
  );
if (
  names.some(
    (k) => process.env[k] !== undefined && process.env[k] !== "false",
  ) ||
  process.env.RESEND_API_KEY
)
  throw Error("Standalone QA requires all AUTH OFF and no provider key");
const folder = process.env.BETA_ACCESS_RUNTIME_OUTPUT;
if (!folder) throw Error("Explicit runtime evidence directory required");
mkdirSync(folder, { recursive: true });
let attempts = 0;
const report = () =>
  writeFileSync(
    resolve(folder, "runtime-" + process.pid + ".json"),
    JSON.stringify({
      externalHttpAttempts: attempts,
      allAuthFlagsOff: true,
      providerKeyPresent: false,
    }),
  );
function deny() {
  attempts++;
  report();
  throw Error("QA_EXTERNAL_HTTP_BLOCKED");
}
const local = (name) =>
  ["localhost", "127.0.0.1", "::1", "[::1]"].includes(name);
function host(input, options) {
  if (input instanceof URL) return input.hostname;
  if (typeof input === "string") return new URL(input).hostname;
  const o = input ?? options ?? {};
  return String(o.hostname ?? o.host ?? "localhost").split(":")[0];
}
for (const transport of [http, https])
  for (const method of ["request", "get"]) {
    const original = transport[method];
    transport[method] = function (input, options, ...args) {
      if (!local(host(input, options))) deny();
      return original.call(this, input, options, ...args);
    };
  }
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input
        : input.url,
  );
  if (!local(url.hostname)) deny();
  return originalFetch(input, init);
};
report();
setInterval(report, 250).unref();
