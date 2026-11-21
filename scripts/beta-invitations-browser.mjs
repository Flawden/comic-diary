/** Real browser + real APIs against explicit disposable PG, synthetic codes in memory only. */
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { hashSessionToken } from '../src/modules/auth/session-token.ts';
import { unsealActivationMailOutboxPayload } from '../src/modules/auth/registration-activation-outbox-crypto.ts';
const d = new URL(process.env.BETA_TEST_DATABASE_URL ?? '');
const local =
  d.hostname === '127.0.0.1' &&
  d.port === '55588' &&
  d.username === 'beta01_qa' &&
  d.pathname === '/beta01_review';
const ci =
  process.env.GITHUB_ACTIONS === 'true' &&
  process.env.GITHUB_REPOSITORY === 'Flawden/comic-diary' &&
  d.hostname === '127.0.0.1' &&
  d.port === '5432' &&
  d.username === 'comic_diary_ci' &&
  d.pathname === '/comic_diary_release';
if (!local && !ci) throw Error('Refused target');
const origin = 'http://127.0.0.1:3116',
  canonical = 'https://reader.example.invalid',
  prefix = 'beta-browser-' + randomUUID(),
  pool = new Pool({ connectionString: d.toString() }),
  q = (s, v = []) => pool.query(s, v);
const { chromium } = createRequire(
  resolve(process.env.WD_BROWSER_ROOT ?? '.qa/browser-deps', 'package.json'),
)('playwright-core');
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BETA_BROWSER_EXECUTABLE
    ? { executablePath: process.env.BETA_BROWSER_EXECUTABLE }
    : { channel: 'chrome' }),
});
const out = resolve(process.env.BETA_BROWSER_OUTPUT ?? '.qa/beta-browser');
await mkdir(out, { recursive: true });
let control;
const errors = [],
  contexts = [],
  users = [],
  result = { status: 'PENDING', checks: [], screenshots: [] };
async function context(role, theme = 'tea', width = 1440) {
  const c = await browser.newContext({
    viewport: { width, height: 1000 },
    reducedMotion: 'reduce',
  });
  contexts.push(c);
  await c.addCookies([
    { name: 'comic-diary-theme', value: theme, url: origin },
  ]);
  if (role) {
    const u = (
      await q(
        "INSERT INTO users(email,password_hash,role,email_verified_at) VALUES($1,'synthetic-unused',$2,now()) RETURNING id",
        [prefix + '-' + randomUUID() + '@example.invalid', role],
      )
    ).rows[0].id;
    users.push(u);
    const token = randomBytes(32).toString('base64url');
    await q(
      "INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')",
      [u, hashSessionToken(token)],
    );
    await c.addCookies([
      { name: 'comic_diary_session', value: token, url: origin },
    ]);
  }
  await c.route('**/*', async (route) => {
    const req = route.request();
    if (new URL(req.url()).origin !== origin) {
      errors.push('external HTTP blocked');
      return route.abort();
    }
    if (new URL(req.url()).pathname.startsWith('/api/')) {
      const headers = {
        ...(await req.allHeaders()),
        host: 'reader.example.invalid',
        'x-real-ip': '198.51.100.77',
      };
      if (req.method() !== 'GET' && req.method() !== 'HEAD')
        headers.origin = canonical;
      const response = await c.request.fetch(req.url(), {
        method: req.method(),
        headers,
        data: req.postData(),
        maxRedirects: 0,
      });
      return route.fulfill({ response });
    }
    return route.continue();
  });
  return c;
}
async function post(c, path, data, headers = {}) {
  return c.request.post(origin + path, {
    data,
    headers: {
      host: 'reader.example.invalid',
      origin: canonical,
      'x-real-ip': '198.51.100.78',
      ...headers,
    },
  });
}
try {
  control = (
    await q('SELECT * FROM activation_mail_dispatch_control WHERE id=1')
  ).rows[0];
  await q('DELETE FROM activation_mail_dispatch_control WHERE id=1');
  await q(
    "INSERT INTO activation_mail_dispatch_control(id,enabled,generation,pilot_id,pilot_user_id,pilot_outbox_id,pilot_armed_at,pilot_dispatch_used_at,pilot_closed_at) VALUES(1,true,7,$1,1,1,now()-interval '3 hours',now()-interval '2 hours',now()-interval '1 hour')",
    [randomUUID()],
  );
  const guest = await context(null),
    gp = await guest.newPage();
  gp.on('pageerror', (e) => errors.push(e.message));
  await gp.goto(origin + '/register', { waitUntil: 'networkidle' });
  await gp
    .getByText(
      'Сейчас регистрация доступна только участникам закрытого бета-тестирования по персональным приглашениям.',
      { exact: true },
    )
    .waitFor();
  assert.equal(await gp.locator('input[type=password]').count(), 0);
  assert.equal(
    (
      await guest.request.get(origin + '/api/admin/invitations', {
        headers: { host: 'reader.example.invalid' },
      })
    ).status(),
    401,
  );
  assert.equal(
    (
      await post(guest, '/api/auth/register', {
        email: prefix + '@example.invalid',
        password: 'beta-password-long',
        passwordConfirm: 'beta-password-long',
      })
    ).status(),
    503,
  );
  result.checks.push('PUBLIC_REGISTRATION_CLOSED_NO_DIRECT_API_BYPASS');
  for (const role of ['USER', 'EDITOR']) {
    const c = await context(role);
    assert.equal(
      (
        await c.request.get(origin + '/api/admin/invitations', {
          headers: { host: 'reader.example.invalid' },
        })
      ).status(),
      403,
    );
    assert.equal(
      (
        await post(c, '/api/admin/invitations', {
          email: prefix + '@example.invalid',
        })
      ).status(),
      403,
    );
    const p = await c.newPage();
    await p.goto(origin + '/admin/invitations', { waitUntil: 'networkidle' });
    await p.getByRole('heading', { name: 'Доступ запрещён' }).waitFor();
    await c.close();
  }
  result.checks.push('USER_EDITOR_SERVER_AND_PAGE_DENIED');
  for (const [theme, width] of [
    ['tea', 1440],
    ['paper', 390],
    ['night', 320],
  ]) {
    await q("DELETE FROM auth_rate_limits WHERE scope='registration-ip-v1'");
    const admin = await context('ADMIN', theme, width),
      p = await admin.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    const email = prefix + '-' + theme + '@example.invalid';
    await p.goto(origin + '/admin/invitations', { waitUntil: 'networkidle' });
    await p.getByLabel('Почта участника', { exact: true }).fill(email);
    const createdResponse = p.waitForResponse(
      (r) =>
        r.url().endsWith('/api/admin/invitations') &&
        r.request().method() === 'POST',
    );
    await p
      .getByRole('button', { name: 'Создать приглашение', exact: true })
      .click();
    const creation = await createdResponse;
    if (creation.status() !== 201)
      throw Error(
        'Admin create HTTP ' +
          creation.status() +
          ' ' +
          (await creation.json()).error,
      );
    const linkField = p.getByRole('textbox', {
      name: 'Новая ссылка приглашения',
    });
    await linkField.waitFor();
    const link = await linkField.inputValue();
    assert.ok(link.startsWith(canonical + '/register#invite='));
    const secret = new URLSearchParams(new URL(link).hash.slice(1)).get(
      'invite',
    );
    await p.getByRole('button', { name: 'Скрыть ссылку', exact: true }).click();
    assert.equal(await p.locator('input[readonly]').count(), 0);
    await p.screenshot({
      path: resolve(out, theme + '-' + width + '-admin.png'),
      fullPage: true,
    });
    result.screenshots.push(theme + '-' + width + '-admin.png');
    const candidate = await context(null, theme, width),
      page = await candidate.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(origin + '/register#invite=' + secret, {
      waitUntil: 'networkidle',
    });
    await page
      .getByRole('heading', { name: 'Шаг 1 из 2 · Создание аккаунта' })
      .waitFor();
    assert.equal(
      (await q('SELECT id FROM users WHERE email=$1', [email])).rowCount,
      0,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: resolve(out, theme + '-' + width + '-register.png'),
      fullPage: true,
    });
    result.screenshots.push(theme + '-' + width + '-register.png');
    await page.getByLabel('Email (логин)', { exact: true }).fill(email);
    await page.getByLabel('Пароль', { exact: true }).fill('beta-password-long');
    await page
      .getByLabel('Повторите пароль', { exact: true })
      .fill('beta-password-long');
    await page
      .getByRole('button', {
        name: 'Создать аккаунт и запросить код',
        exact: true,
      })
      .click();
    await page
      .getByRole('heading', { name: 'Шаг 2 из 2 · Подтверждение почты' })
      .waitFor();
    const u = (
      await q('SELECT id,email_verified_at FROM users WHERE email=$1', [email])
    ).rows[0];
    assert.equal(u.email_verified_at, null);
    const beforeCount = (
      await q(
        'SELECT count(*)::int n FROM activation_mail_outbox o JOIN email_verification_tokens t ON t.id=o.verification_token_id WHERE t.user_id=$1',
        [u.id],
      )
    ).rows[0].n;
    assert.equal(beforeCount, 1);
    const pendingLogin = await post(candidate, '/api/auth/login', {
      email,
      password: 'beta-password-long',
    });
    assert.equal(pendingLogin.status(), 401);
    const row = (
      await q(
        'SELECT o.*,t.expires_at AS token_expiry,t.purpose FROM activation_mail_outbox o JOIN email_verification_tokens t ON t.id=o.verification_token_id WHERE t.user_id=$1',
        [u.id],
      )
    ).rows[0];
    const payload = unsealActivationMailOutboxPayload(
      {
        payloadCiphertext: row.payload_ciphertext,
        payloadNonce: row.payload_nonce,
        payloadKeyId: row.payload_key_id,
        payloadDigest: row.payload_digest,
      },
      {
        verificationTokenId: row.verification_token_id,
        idempotencyKey: row.idempotency_key,
        expiresAt: row.token_expiry,
        purpose: row.purpose,
      },
      new Map([['beta-browser', Buffer.alloc(32, 19)]]),
      new Date(),
    );
    assert.ok(payload);
    await page
      .getByLabel('Одноразовый код из письма', { exact: true })
      .fill(payload.token);
    await page.locator('input[name=newPassword]').fill('final-beta-password');
    await page
      .locator('input[name=newPasswordConfirm]')
      .fill('final-beta-password');
    await page
      .getByRole('button', { name: 'Подтвердить почту', exact: true })
      .click();
    await page
      .getByText(
        'Почта подтверждена. Ваш аккаунт готов — войдите с окончательным паролем.',
        { exact: true },
      )
      .waitFor();
    assert.equal(new URL(page.url()).hash, '');
    await page.screenshot({
      path: resolve(out, theme + '-' + width + '-activated.png'),
      fullPage: true,
    });
    result.screenshots.push(theme + '-' + width + '-activated.png');
    const login = await post(candidate, '/api/auth/login', {
      email,
      password: 'final-beta-password',
    });
    assert.equal(login.status(), 200);
    const sessionCookie = login
      .headers()
      ['set-cookie']?.match(/comic_diary_session=([^;]+)/)?.[1];
    assert.ok(
      sessionCookie,
      'synthetic HTTPS fixture requires the server-issued session cookie',
    );
    await candidate.addCookies([
      {
        name: 'comic_diary_session',
        value: sessionCookie,
        url: origin,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    await page.goto(origin + '/account', { waitUntil: 'networkidle' });
    await page.getByText('Почта подтверждена', { exact: true }).waitFor();
    result.checks.push(theme + '_' + width + '_CREATE_PENDING_ACTIVATE_LOGIN');
    console.log(theme + '_' + width + '_CREATE_PENDING_ACTIVATE_LOGIN=PASS');
    await admin.close();
    await candidate.close();
  }
  assert.deepEqual(errors, []);
  result.status = 'PASS';
  console.log(
    'BETA_BROWSER=PASS; ADMIN_ONLY; THREE_THEMES; 320_390_1440; REAL_APIS; NO_PROVIDER_HTTP',
  );
} catch (e) {
  result.status = 'BLOCKED';
  result.error = e.message;
  throw e;
} finally {
  await browser.close();
  result.errors = errors;
  await writeFile(
    resolve(out, 'RESULTS.json'),
    JSON.stringify(result, null, 2) + '\n',
  );
  await q(
    'DELETE FROM email_verification_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)',
    [prefix + '%'],
  );
  await q(
    'DELETE FROM beta_registration_invitations WHERE created_by_user_id=ANY($1::int[])',
    [users],
  );
  await q('DELETE FROM users WHERE email LIKE $1', [prefix + '%']);
  if (control) {
    await q('DELETE FROM activation_mail_dispatch_control WHERE id=1');
    const keys = Object.keys(control);
    await q(
      'INSERT INTO activation_mail_dispatch_control(' +
        keys.join(',') +
        ') VALUES(' +
        keys.map((_, i) => '$' + (i + 1)).join(',') +
        ')',
      keys.map((k) => control[k]),
    );
  }
  await pool.end();
}
