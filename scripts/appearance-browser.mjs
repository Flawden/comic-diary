/** Real localhost APIs, synthetic users and images, no provider calls. */
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { Pool } from "pg";
const u = new URL(process.env.APPEARANCE_TEST_DATABASE_URL ?? "");
const local =
  u.hostname === "127.0.0.1" &&
  u.port === "55725" &&
  u.username === "appearance_qa" &&
  u.pathname === "/appearance_review";
const ci =
  process.env.GITHUB_ACTIONS === "true" &&
  process.env.GITHUB_REPOSITORY === "Flawden/comic-diary" &&
  u.hostname === "127.0.0.1" &&
  u.port === "5432" &&
  u.username === "comic_diary_ci" &&
  u.pathname === "/comic_diary_release";
if (!local && !ci) throw Error("Refused database");
const pool = new Pool({ connectionString: u.href }),
  q = (s, v = []) => pool.query(s, v),
  origin = "http://127.0.0.1:3118",
  canonical = "https://reader.example.invalid",
  prefix = "avatar-browser-" + randomUUID(),
  out = resolve(
    process.env.APPEARANCE_BROWSER_OUTPUT ?? ".qa/appearance-browser",
  );
await mkdir(out, { recursive: true });
const { chromium } = createRequire(
  resolve(process.env.WD_BROWSER_ROOT ?? ".qa/browser-deps", "package.json"),
)("playwright-core");
const browser = await chromium.launch({
  headless: true,
  ...(process.env.APPEARANCE_BROWSER_EXECUTABLE
    ? { executablePath: process.env.APPEARANCE_BROWSER_EXECUTABLE }
    : { channel: "chrome" }),
});
const users = [],
  errors = [],
  external = [],
  contexts = [],
  result = { status: "PENDING", checks: [], screenshots: [] };
let book;
async function context(role, theme = "tea", width = 1440) {
  const c = await browser.newContext({
    viewport: { width, height: 1000 },
    reducedMotion: "reduce",
  });
  contexts.push(c);
  await c.addCookies([
    { name: "comic-diary-theme", value: theme, url: origin },
  ]);
  await c.route("**/*", async (r) => {
    const req = r.request();
    if (new URL(req.url()).origin !== origin) {
      external.push("blocked");
      return r.abort();
    }
    if (req.url().startsWith(origin + "/api/")) {
      const headers = {
        ...(await req.allHeaders()),
        host: "reader.example.invalid",
      };
      if (!["GET", "HEAD"].includes(req.method())) headers.origin = canonical;
      const response = await c.request.fetch(req.url(), {
        method: req.method(),
        headers,
        data: req.postDataBuffer(),
        maxRedirects: 0,
      });
      return r.fulfill({ response });
    }
    return r.continue();
  });
  let id = null;
  if (role) {
    id = (
      await q(
        "INSERT INTO users(email,password_hash,role,display_name,email_verified_at) VALUES($1,'synthetic-unused',$2,$3,now()) RETURNING id",
        [
          prefix + "-" + randomUUID() + "@example.invalid",
          role,
          role === "ADMIN" ? "Администратор проверки" : "Читатель проверки",
        ],
      )
    ).rows[0].id;
    users.push(id);
    const token = randomBytes(32).toString("base64url");
    await q(
      "INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')",
      [id, createHash("sha256").update(token).digest("hex")],
    );
    await c.addCookies([
      { name: "comic_diary_session", value: token, url: origin },
    ]);
  }
  return { c, id };
}
async function post(c, path, data) {
  return c.request.post(origin + path, {
    headers: { origin: canonical, host: "reader.example.invalid" },
    data,
  });
}
async function state(c) {
  const r = await c.request.get(origin + "/api/account/appearance");
  assert.equal(r.status(), 200);
  return r.json();
}
async function settled(page) {
  await page.getByRole("status").filter({ hasText: "Сохранено." }).waitFor();
}
try {
  const guest = await context(null);
  assert.equal(
    (
      await post(guest.c, "/api/account/appearance", {
        frame: null,
        revision: 0,
      })
    ).status(),
    401,
  );
  for (const role of ["USER", "EDITOR"]) {
    const who = await context(role);
    assert.equal(
      (
        await post(who.c, "/api/admin/users/" + who.id + "/appearance", {
          betaParticipant: true,
          betaFrameGranted: true,
          revision: 0,
        })
      ).status(),
      403,
    );
    const p = await who.c.newPage();
    await p.goto(origin + "/admin/beta-participants", {
      waitUntil: "networkidle",
    });
    await p.getByRole("heading", { name: "Доступ запрещён" }).waitFor();
    await who.c.close();
  }
  result.checks.push("GUEST_USER_EDITOR_SERVER_AND_PAGE_BOUNDARIES");
  const image = await sharp({
    create: { width: 320, height: 200, channels: 3, background: "#bd8f45" },
  })
    .png()
    .withMetadata()
    .toBuffer();
  for (const [theme, width] of [
    ["tea", 1440],
    ["paper", 390],
    ["night", 320],
  ]) {
    const admin = await context("ADMIN", theme, width),
      reader = await context("USER", theme, width),
      outsider = await context("USER", theme, width);
    const p = await reader.c.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(origin + "/account#appearance", { waitUntil: "networkidle" });
    const settings = p.locator(".avatar-settings, .avatar-editor-dialog");
    async function openAvatar() {
      if (!(await p.locator("dialog[open]").count()))
        await p
          .getByRole("button", { name: "Изменить аватар", exact: true })
          .click();
    }
    await settings.getByRole("heading", { name: "Рамки" }).waitFor();
    assert.equal(await settings.getByRole("radio").count(), 1);
    await settings
      .getByRole("radio", { name: "Без рамки", exact: true })
      .check();
    assert.equal(
      (
        await post(reader.c, "/api/account/appearance", {
          frame: "beta_dragon_2026",
          revision: 0,
        })
      ).status(),
      403,
    );
    assert.equal(
      (
        await post(reader.c, "/api/account/appearance", {
          frame: null,
          revision: 0,
          userId: outsider.id,
        })
      ).status(),
      400,
    );
    assert.equal(
      (
        await reader.c.request.post(origin + "/api/account/avatar", {
          headers: {
            origin: canonical,
            host: "reader.example.invalid",
            "content-type": "image/png",
            "if-match": "0",
            "x-avatar-crop": '{"left":0,"top":0,"size":64}',
          },
          data: Buffer.from("<svg/>"),
        })
      ).status(),
      415,
    );
    assert.equal(
      (
        await reader.c.request.post(origin + "/api/account/avatar", {
          headers: {
            origin: "https://foreign.example.invalid",
            host: "reader.example.invalid",
            "content-type": "image/png",
          },
          data: image,
        })
      ).status(),
      403,
    );
    const a = await admin.c.newPage();
    a.on("pageerror", (e) => errors.push(e.message));
    await a.goto(origin + "/admin/beta-participants", {
      waitUntil: "networkidle",
    });
    const member = a.locator('[data-beta-user="' + reader.id + '"]');
    await member.getByLabel("Участник закрытой беты", { exact: true }).check();
    await member
      .getByLabel("Доступ к рамке «Бета-дракон»", { exact: true })
      .check();
    await member
      .getByRole("button", { name: "Сохранить доступ", exact: true })
      .click();
    await settled(member);
    assert.equal((await state(reader.c)).selectedFrame, null);
    // Exercise the actual Proxy and HTTP policy boundary with existing cookies.
    const readPolicy = await admin.c.request.get(
      origin + "/api/admin/site-access",
    );
    assert.equal(readPolicy.status(), 200);
    const initialPolicy = await readPolicy.json();
    await a.goto(origin+'/admin/invitations',{waitUntil:'networkidle'});
    await a.getByLabel('Пускать только участников закрытой беты',{exact:false}).check();
    await a.getByRole('button',{name:'Сохранить режим доступа',exact:true}).click();
    await a.getByRole('status').filter({hasText:'Настройки сохранены.'}).waitFor();
    const activePolicy=await (await admin.c.request.get(origin+'/api/admin/site-access')).json();
    assert.equal(activePolicy.betaOnly,true);assert.equal(activePolicy.revision,initialPolicy.revision+1);
    try {
      assert.equal(
        (await admin.c.request.get(origin + "/api/admin/site-access")).status(),
        200,
      );
      assert.equal(
        (
          await reader.c.request.get(origin + "/api/account/appearance")
        ).status(),
        200,
      );
      assert.equal(
        (
          await outsider.c.request.get(origin + "/api/account/appearance")
        ).status(),
        403,
      );
      assert.equal(
        (
          await outsider.c.request.get(
            origin + "/api/community/reviews?comicId=1",
          )
        ).status(),
        403,
      );
      const denied = await outsider.c.request.get(origin + "/account", {
        maxRedirects: 0,
      });
      assert.equal(denied.status(), 307);
      assert.ok(denied.headers().location.endsWith("/beta-wait"));
      await p.goto(origin + "/account", { waitUntil: "networkidle" });
      await p
        .getByRole("button", { name: "Изменить аватар", exact: true })
        .waitFor();
      const waiting = await outsider.c.newPage();
      await waiting.goto(origin + "/account", {
        waitUntil: "domcontentloaded",
      });
      assert.ok(waiting.url().endsWith("/beta-wait"));
      await waiting
        .getByRole("heading", { name: "Закрытое бета-тестирование" })
        .waitFor();
      await waiting.screenshot({
        path: resolve(out, theme + "-" + width + "-waiting.png"),
        fullPage: true,
      });
      await waiting.close();
      const crossOrigin = await admin.c.request.post(
        origin + "/api/admin/site-access",
        {
          headers: {
            host: "reader.example.invalid",
            origin: "https://foreign.example.invalid",
          },
          data: {
            publicRegistration: false,
            betaOnly: false,
            revision: activePolicy.revision,
          },
        },
      );
      assert.equal(crossOrigin.status(), 403);
    } finally {
      assert.equal(
        (
          await post(admin.c, "/api/admin/site-access", {
            publicRegistration: false,
            betaOnly: false,
            revision: activePolicy.revision,
          })
        ).status(),
        200,
      );
    }
    result.checks.push(
      "HTTP_BETA_GATE_ADMIN_ESCAPE_MEMBER_ACCESS_OUTSIDER_CONTENT_AND_API_DENIAL_CSRF",
    );
    await a.goto(origin+'/admin/beta-participants',{waitUntil:'networkidle'});
    await p.reload({ waitUntil: "networkidle" });
    await openAvatar();
    await settings.locator("input[type=file]").setInputFiles({
      name: "portrait.png",
      mimeType: "image/png",
      buffer: image,
    });
    await settings.getByRole("heading", { name: "Обрезка аватара" }).waitFor();
    await settings.getByLabel("Масштаб", { exact: true }).press("ArrowRight");
    await settings.getByLabel("По горизонтали", { exact: true }).press("Home");
    await settings
      .getByRole("button", { name: "Сохранить аватар", exact: true })
      .click();
    await settled(settings);
    let current = await state(reader.c);
    const oldUrl = current.avatarUrl;
    assert.ok(oldUrl);
    const media = await reader.c.request.get(origin + oldUrl);
    assert.equal(media.status(), 200);
    assert.equal(media.headers()["content-type"], "image/webp");
    const metadata = await sharp(await media.body()).metadata();
    assert.equal(metadata.width, 256);
    assert.equal(metadata.exif, undefined);
    // A replaced avatar must survive a lost HTTP acknowledgement of its commit.
    await openAvatar();
    await settings.locator("input[type=file]").setInputFiles({
      name: "replacement.png",
      mimeType: "image/png",
      buffer: image,
    });
    await settings.getByRole("heading", { name: "Обрезка аватара" }).waitFor();
    await p.route(
      "**/api/account/avatar",
      async (route) => {
        const req = route.request();
        const response = await route.fetch({
          headers: {
            ...(await req.allHeaders()),
            host: "reader.example.invalid",
            origin: canonical,
          },
        });
        assert.equal(response.status(), 200);
        await route.abort("connectionreset");
      },
      { times: 1 },
    );
    await settings
      .getByRole("button", { name: "Сохранить аватар", exact: true })
      .click();
    await settings
      .getByRole("alert")
      .filter({ hasText: "Подтверждение не получено" })
      .waitFor();
    current = await state(reader.c);
    assert.ok(current.avatarUrl);
    assert.notEqual(current.avatarUrl, oldUrl);
    assert.equal(
      (await reader.c.request.get(origin + current.avatarUrl)).status(),
      200,
    );
    assert.equal((await reader.c.request.get(origin + oldUrl)).status(), 404);
    await settings
      .getByRole("button", { name: "Обновить данные", exact: true })
      .click();
    await settings
      .locator('img[src="' + current.avatarUrl + '"]')
      .first()
      .waitFor();
    if (await p.locator("dialog[open]").count())
      await p.getByRole("button", { name: "Закрыть", exact: true }).click();
    await settings.getByRole("radio", { name: /Бета-дракон/ }).check();
    await settled(settings);
    current = await state(reader.c);
    assert.equal(current.selectedFrame, "beta_dragon_2026");
    assert.equal(
      (
        await post(outsider.c, "/api/account/appearance", {
          frame: "beta_dragon_2026",
          revision: 0,
        })
      ).status(),
      403,
    );
    assert.equal((await state(outsider.c)).betaFrameGranted, false);
    const future = await context("USER", theme, width);
    assert.equal((await state(future.c)).betaFrameGranted, false);
    await future.c.close();
    await p.evaluate(() =>
      document.querySelector(".avatar-settings").scrollIntoView(),
    );
    await settings
      .locator(".user-avatar-frame")
      .first()
      .evaluate((img) => img.decode());
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await p.screenshot({
      path: resolve(out, theme + "-" + width + "-profile.png"),
      fullPage: true,
    });
    result.screenshots.push(theme + "-" + width + "-profile.png");
    book = (
      await q(
        "INSERT INTO comics(title,slug,visibility,publication_status,description) VALUES($1,$2,'SHARED','PUBLISHED','Synthetic') RETURNING id",
        ["Avatar acceptance", prefix + "-" + theme],
      )
    ).rows[0].id;
    const review = (
      await q(
        "INSERT INTO community_reviews(comic_id,user_id,rating_plot,rating_characters,rating_art,rating_depth,rating_world,body) VALUES($1,$2,4,4,4,4,4,'Synthetic review') RETURNING id",
        [book, reader.id],
      )
    ).rows[0].id;
    const root = (
      await q(
        "INSERT INTO community_comments(comic_id,author_user_id,request_id,request_digest,body) VALUES($1,$2,$3,repeat('a',64),'Synthetic root') RETURNING id",
        [book, reader.id, randomUUID()],
      )
    ).rows[0].id;
    await q(
      "INSERT INTO community_comments(comic_id,author_user_id,parent_id,request_id,request_digest,body) VALUES($1,$2,$3,$4,repeat('b',64),'Synthetic reply')",
      [book, reader.id, root, randomUUID()],
    );
    const reviews = await (
      await reader.c.request.get(
        origin + "/api/community/reviews?comicId=" + book,
      )
    ).json();
    assert.equal(
      reviews.items.find((r) => r.id === review).appearance.frameUrl,
      current.frameUrl,
    );
    const comments = await (
      await reader.c.request.get(
        origin + "/api/community/comments?comicId=" + book,
      )
    ).json();
    assert.equal(comments.items.length, 2);
    for (const comment of comments.items) {
      assert.equal(comment.appearance.frameUrl, current.frameUrl);
      assert.equal(comment.appearance.avatarUrl, current.avatarUrl);
      assert.equal(Object.hasOwn(comment, "email"), false);
    }
    await p.goto(origin + "/comics/" + prefix + "-" + theme + "#reviews", {
      waitUntil: "networkidle",
    });
    await p
      .locator('[data-review-id="' + review + '"] .user-avatar-frame')
      .waitFor();
    const archive = p.getByText("Ранее опубликованные комментарии", {
      exact: true,
    });
    await archive.click();
    await p.locator(".reviews-history .user-avatar-frame").first().waitFor();
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await p.screenshot({
      path: resolve(out, theme + "-" + width + "-reviews.png"),
      fullPage: true,
    });
    result.screenshots.push(theme + "-" + width + "-reviews.png");
    await q("DELETE FROM community_comments WHERE comic_id=$1", [book]);
    await q("DELETE FROM community_reviews WHERE comic_id=$1", [book]);
    await q("DELETE FROM comics WHERE id=$1", [book]);
    book = null;
    await p.goto(origin + "/account#appearance", { waitUntil: "networkidle" });
    await settings
      .getByRole("radio", { name: "Без рамки", exact: true })
      .check();
    await settled(settings);
    assert.equal((await state(reader.c)).selectedFrame, null);
    // Restore selection, then revoke it through ADMIN: no stale grant can survive.
    current = await state(reader.c);
    assert.equal(
      (
        await post(reader.c, "/api/account/appearance", {
          frame: "beta_dragon_2026",
          revision: current.revision,
        })
      ).status(),
      200,
    );
    await a.reload({ waitUntil: "networkidle" });
    await member
      .getByLabel("Доступ к рамке «Бета-дракон»", { exact: true })
      .uncheck();
    await member
      .getByRole("button", { name: "Сохранить доступ", exact: true })
      .click();
    await settled(member);
    assert.equal((await state(reader.c)).selectedFrame, null);
    await p.reload({ waitUntil: "networkidle" });
    const removedAvatar = (await state(reader.c)).avatarUrl;
    await openAvatar();
    await settings
      .getByRole("button", { name: "Удалить аватар", exact: true })
      .click();
    await settled(settings);
    assert.equal((await reader.c.request.get(origin + oldUrl)).status(), 404);
    assert.equal(
      (await reader.c.request.get(origin + removedAvatar)).status(),
      404,
    );
    assert.equal((await state(reader.c)).avatarUrl, null);
    result.checks.push(
      theme +
        "_" +
        width +
        "_UPLOAD_CROP_METADATA_FRAME_OPT_OUT_EXCLUSIVITY_FUTURE_USER_REVOCATION_REVIEW_REPLY_DELETE=PASS",
    );
    await reader.c.close();
    await admin.c.close();
    await outsider.c.close();
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  result.status = "PASS";
  console.log(
    "APPEARANCE_BROWSER=PASS; THREE_THEMES; 320_390_1440; NO_PROVIDER_HTTP",
  );
} catch (e) {
  result.status = "BLOCKED";
  result.error = e.message;
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
  result.errors = errors;
  result.external = external;
  await writeFile(
    resolve(out, "RESULTS.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  if (book) {
    await q("DELETE FROM community_comments WHERE comic_id=$1", [book]);
    await q("DELETE FROM community_reviews WHERE comic_id=$1", [book]);
    await q("DELETE FROM comics WHERE id=$1", [book]);
  }
  await q("DELETE FROM site_access_events WHERE actor_user_id=ANY($1::int[])", [
    users,
  ]);
  await q("DELETE FROM users WHERE id=ANY($1::int[])", [users]);
  await pool.end();
}
