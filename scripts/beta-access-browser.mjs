/** Compiled standalone HTTP, synthetic accounts only. No dotenv or real mail. */
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";
import { hash } from "@node-rs/argon2";
const url = new URL(process.env.BETA_ACCESS_TEST_DATABASE_URL ?? "");
const local =
  url.hostname === "127.0.0.1" &&
  url.port === "55726" &&
  url.username === "beta_access_qa" &&
  url.pathname === "/beta_access_review";
const ci =
  process.env.GITHUB_ACTIONS === "true" &&
  process.env.GITHUB_REPOSITORY === "Flawden/comic-diary" &&
  url.hostname === "127.0.0.1" &&
  url.port === "5432" &&
  url.username === "comic_diary_ci" &&
  url.pathname === "/comic_diary_release";
if (url.protocol !== "postgresql:" || (!local && !ci) || url.search || url.hash)
  throw Error("Refused non-disposable database");
const origin = process.env.BETA_ACCESS_TEST_ORIGIN ?? "http://127.0.0.1:3120";
if (!["http://127.0.0.1:3119", "http://127.0.0.1:3120"].includes(origin))
  throw Error("Refused non-local origin");
const canonical = "https://reader.example.invalid",
  out = resolve(process.env.BETA_ACCESS_OUTPUT ?? ".qa/beta-access-browser");
await mkdir(out, { recursive: true });
const { chromium } = createRequire(
  resolve(
    process.env.WD_BROWSER_ROOT ??
      "../comic-diary-account-beta-controls/.qa/browser-deps",
    "package.json",
  ),
)("playwright-core");
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BETA_ACCESS_BROWSER_EXECUTABLE
    ? { executablePath: process.env.BETA_ACCESS_BROWSER_EXECUTABLE }
    : { channel: "chrome" }),
});
const pool = new Pool({ connectionString: url.href }),
  q = (sql, values = []) => pool.query(sql, values),
  prefix = "beta-access-" + randomUUID(),
  password = "Synthetic-access-password-123!",
  users = [],
  contexts = [];
const result = {
  status: "PENDING",
  checks: [],
  screenshots: [],
  pageErrors: [],
  unexpectedExternal: [],
  blockedFixtureImages: [],
};
let savedPolicy, controlsBefore;
async function controls() {
  return {
    activation: (
      await q(
        "SELECT enabled,generation,pilot_id,pilot_user_id,pilot_outbox_id,pilot_armed_at,pilot_dispatch_used_at,pilot_closed_at FROM activation_mail_dispatch_control WHERE id=1",
      )
    ).rows,
    recovery: (
      await q(
        "SELECT enabled,generation FROM password_reset_mail_dispatch_control WHERE id=1",
      )
    ).rows,
  };
}
async function context(actor, theme = "tea", width = 390) {
  const c = await browser.newContext({
    viewport: { width, height: 900 },
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  contexts.push(c);
  await c.addCookies([
    { name: "comic-diary-theme", value: theme, url: origin },
  ]);
  if (actor)
    await c.addCookies([
      { name: "comic_diary_session", value: actor.token, url: origin },
    ]);
  await c.route("**/*", async (r) => {
    const req = r.request(),
      u = new URL(req.url());
    if (u.origin !== origin) {
      if (req.resourceType() === "image" && req.method() === "GET")
        result.blockedFixtureImages.push(u.origin);
      else
        result.unexpectedExternal.push({
          origin: u.origin,
          type: req.resourceType(),
          method: req.method(),
        });
      return r.abort();
    }
    if (u.pathname.startsWith("/api/")) {
      const headers = {
        ...(await req.allHeaders()),
        host: "reader.example.invalid",
        "x-real-ip": "192.0.2.83",
      };
      if (!["GET", "HEAD"].includes(req.method())) headers.origin = canonical;
      const response = await c.request.fetch(req.url(), {
        method: req.method(),
        headers,
        data: req.postDataBuffer(),
        maxRedirects: 0,
      });
      const responseHeaders = response.headers();
      if (u.pathname === "/api/auth/login" && response.status() === 200) {
        assert.match(
          responseHeaders["set-cookie"],
          /;\s*secure/i,
          "Application must still issue Secure production cookies",
        );
        // The fixture alone runs over loopback HTTP. Preserve the application header
        // assertion, then adapt only this synthetic browser transport to HTTP.
        responseHeaders["set-cookie"] = responseHeaders["set-cookie"].replace(
          /;\s*secure/gi,
          "",
        );
      }
      return r.fulfill({ response, headers: responseHeaders });
    }
    return r.continue();
  });
  c.on("page", (p) =>
    p.on("pageerror", (e) => result.pageErrors.push(e.message)),
  );
  return c;
}
async function actor(
  label,
  role = "USER",
  member = true,
  verified = false,
  required = false,
  active = true,
  expired = false,
) {
  const email = prefix + "-" + label + "@example.invalid";
  const id = (
    await q(
      "INSERT INTO users(email,password_hash,role,email_verified_at,verification_required_at,is_active) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
      [
        email,
        await hash(password),
        role,
        verified ? new Date() : null,
        required ? new Date() : null,
        active,
      ],
    )
  ).rows[0].id;
  users.push(id);
  await q(
    "INSERT INTO user_appearance(user_id,beta_participant) VALUES($1,$2)",
    [id, member],
  );
  const token = randomBytes(32).toString("base64url");
  await q(
    "INSERT INTO sessions(user_id,token_hash,expires_at,last_seen_at) VALUES($1,$2,$3,now()-interval '1 hour')",
    [
      id,
      createHash("sha256").update(token).digest("hex"),
      new Date(Date.now() + (expired ? -60000 : 86400000)),
    ],
  );
  return { id, email, token };
}
async function get(c, path) {
  return c.request.get(origin + path, {
    maxRedirects: 0,
    headers: { host: "reader.example.invalid", "Cache-Control": "no-cache" },
  });
}
async function grant(c, user, enabled) {
  const rev = (
    await q("SELECT revision FROM user_appearance WHERE user_id=$1", [user.id])
  ).rows[0].revision;
  const r = await c.request.post(
    origin + "/api/admin/users/" + user.id + "/appearance",
    {
      headers: { host: "reader.example.invalid", origin: canonical },
      data: {
        betaParticipant: enabled,
        betaFrameGranted: false,
        revision: rev,
      },
    },
  );
  assert.equal(r.status(), 200);
}
try {
  assert.equal(
    (await q("SELECT current_setting('server_version_num')::int/10000 AS n"))
      .rows[0].n,
    17,
  );
  controlsBefore = await controls();
  savedPolicy = (await q("SELECT * FROM site_access_policy WHERE id=1"))
    .rows[0];
  await q(
    "UPDATE site_access_policy SET public_registration=false,beta_only=true WHERE id=1",
  );
  const admin = await actor("admin", "ADMIN", false),
    member = await actor("legacy-member"),
    verified = await actor("verified-member", "USER", true, true, true),
    outsider = await actor("outsider", "USER", false),
    pending = await actor("pending", "USER", true, false, true),
    inactive = await actor("inactive", "USER", true, true, false, false),
    expired = await actor(
      "expired-admin",
      "ADMIN",
      true,
      true,
      false,
      true,
      true,
    );
  const adminC = await context(admin);
  for (const [a, allowed] of [
    [admin, true],
    [member, true],
    [verified, true],
    [outsider, false],
    [pending, false],
    [inactive, false],
    [expired, false],
  ]) {
    const c = await context(a);
    assert.equal((await get(c, "/")).status(), allowed ? 200 : 307, a.email);
    assert.equal(
      (await get(c, "/api/account/appearance")).status(),
      allowed ? 200 : 403,
      a.email,
    );
    await c.close();
  }
  result.checks.push(
    "STANDALONE_LEGACY_STALE_SESSION_VERIFIED_ADMIN_POSITIVE_PENDING_INACTIVE_EXPIRED_OUTSIDER_NEGATIVE",
  );
  for (const [theme, width] of [
    ["tea", 1440],
    ["paper", 390],
    ["night", 320],
  ]) {
    await grant(adminC, outsider, false);
    const c = await context(outsider, theme, width),
      p = await c.newPage();
    await p.goto(origin + "/account", { waitUntil: "domcontentloaded" });
    assert.ok(p.url().endsWith("/beta-wait"));
    await p.getByText(outsider.email, { exact: true }).waitFor();
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    const shot = theme + "-" + width + "-waiting.png";
    await p.screenshot({ path: resolve(out, shot), fullPage: true });
    result.screenshots.push(shot);
    await grant(adminC, outsider, true);
    assert.equal((await get(c, "/")).status(), 200);
    await p
      .getByRole("button", { name: "Проверить доступ", exact: true })
      .click();
    await p.waitForURL(origin + "/");
    await p.locator(".catalog-hero").waitFor();
    await p.goto(origin + "/beta-wait", { waitUntil: "domcontentloaded" });
    assert.equal(new URL(p.url()).pathname, "/");
    await grant(adminC, outsider, false);
    assert.equal((await get(c, "/api/account/appearance")).status(), 403);
    await p.goto(origin + "/account", { waitUntil: "domcontentloaded" });
    assert.ok(p.url().endsWith("/beta-wait"));
    await grant(adminC, outsider, true);
    await p.reload({ waitUntil: "domcontentloaded" });
    assert.equal(new URL(p.url()).pathname, "/");
    await c.close();
    assert.equal(
      (
        await q(
          "SELECT count(*)::int n FROM sessions WHERE user_id=$1 AND token_hash=$2 AND expires_at>now()",
          [
            outsider.id,
            createHash("sha256").update(outsider.token).digest("hex"),
          ],
        )
      ).rows[0].n,
      1,
    );
    result.checks.push(
      theme +
        "_" +
        width +
        "_DENIED_GRANT_RETRY_REVOKE_GRANT_RELOAD_NO_NEW_LOGIN",
    );
  }
  const loginC = await context(null),
    loginPage = await loginC.newPage();
  await loginPage.goto(origin + "/account", { waitUntil: "domcontentloaded" });
  assert.ok(loginPage.url().endsWith("/beta-wait"));
  await loginPage
    .getByRole("link", { name: "Войти в аккаунт", exact: true })
    .click();
  await loginPage.getByLabel("Email", { exact: true }).fill(member.email);
  await loginPage.getByLabel("Пароль", { exact: true }).fill(password);
  await loginPage.evaluate(() => {
    window.betaLoginDocument = "before-login";
  });
  await loginPage.getByRole("button", { name: "Войти", exact: true }).click();
  await loginPage.waitForURL(origin + "/");
  await loginPage.locator(".catalog-hero").waitFor();
  assert.equal(
    await loginPage.evaluate(() => window.betaLoginDocument),
    undefined,
  );
  assert.equal((await get(loginC, "/api/account/appearance")).status(), 200);
  result.checks.push(
    "GUEST_DENIAL_LOGIN_FORM_COOKIE_HARD_NAVIGATION_NO_CACHED_DENIAL",
  );
  await loginC.close();
  await grant(adminC, outsider, false);
  const lastC = await context(outsider),
    last = await lastC.newPage();
  await last.goto(origin + "/account", { waitUntil: "domcontentloaded" });
  assert.ok(last.url().endsWith("/beta-wait"));
  await q("UPDATE site_access_policy SET beta_only=false WHERE id=1");
  await last
    .getByRole("button", { name: "Проверить доступ", exact: true })
    .click();
  await last.waitForURL(origin + "/");
  assert.equal(
    (await q("SELECT public_registration FROM site_access_policy WHERE id=1"))
      .rows[0].public_registration,
    false,
  );
  result.checks.push(
    "RESTRICTION_OFF_RELEASES_EXISTING_WAITING_PAGE_PUBLIC_REGISTRATION_UNCHANGED",
  );
  assert.deepEqual(await controls(), controlsBefore);
  result.checks.push("AUTH_GATES_GENERATIONS_CLOSED_PILOT_UNCHANGED");
  assert.deepEqual(result.pageErrors, []);
  assert.deepEqual(result.unexpectedExternal, []);
  result.status = "PASS";
  console.log(
    "BETA_ACCESS_STANDALONE_BROWSER=PASS; LEGACY_SESSION_LOGIN_WAIT_GRANT_REVOKE_THEMES_320_390_1440; NO_MAIL",
  );
} catch (e) {
  result.status = "BLOCKED";
  result.error = e.message;
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
  if (savedPolicy)
    await q(
      "UPDATE site_access_policy SET public_registration=$1,beta_only=$2,revision=$3,updated_at=$4 WHERE id=1",
      [
        savedPolicy.public_registration,
        savedPolicy.beta_only,
        savedPolicy.revision,
        savedPolicy.updated_at,
      ],
    );
  await q(
    "DELETE FROM user_appearance_events WHERE actor_user_id=ANY($1::int[]) OR target_user_id=ANY($1::int[])",
    [users],
  );
  await q("DELETE FROM users WHERE id=ANY($1::int[])", [users]);
  await pool.end();
  await writeFile(
    resolve(out, "RESULTS.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
}
