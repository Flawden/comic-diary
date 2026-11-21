/** Real browser -> real account API/PG; only the local proxy headers are adapted.
 * No mail is sent. Code is read from the fixture's encrypted outbox in memory.
 */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { hashPassword } from '../src/modules/auth/password.ts';
import { unsealActivationMailOutboxPayload } from '../src/modules/auth/registration-activation-outbox-crypto.ts';
const db = new URL(process.env.DATABASE_URL ?? '');
const local = db.hostname === '127.0.0.1' && db.port === '55526' && db.username === 'purpose01_qa' && db.pathname === '/purpose01_review';
const ci = process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_REPOSITORY === 'Flawden/comic-diary' && db.hostname === '127.0.0.1' && db.port === '5432' && db.username === 'comic_diary_ci' && db.pathname === '/comic_diary_release';
if (db.protocol !== 'postgresql:' || (!local && !ci) || db.search || db.hash) throw Error('REFUSED non-disposable browser database');
const enabled = process.env.LEGACY_BROWSER_MODE !== 'disabled';
const origin = process.env.LEGACY_BROWSER_ORIGIN ?? (enabled ? 'http://127.0.0.1:3110' : 'http://127.0.0.1:3111');
const site = new URL(origin); if (site.hostname !== '127.0.0.1' || !['3110','3111','3113'].includes(site.port)) throw Error('REFUSED browser origin');
const { chromium } = createRequire(resolve(process.env.WD_BROWSER_ROOT ?? '.qa/browser', 'package.json'))('playwright-core');
const browser = await chromium.launch({ headless: true, ...(process.env.LEGACY_BROWSER_EXECUTABLE ? { executablePath: process.env.LEGACY_BROWSER_EXECUTABLE } : { channel: 'chrome' }) });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const control = (await pool.query('SELECT * FROM activation_mail_dispatch_control WHERE id=1')).rows[0];
const output = resolve('.qa/legacy-browser', enabled ? 'enabled' : 'disabled'); await mkdir(output, { recursive: true });
const manifest = { source: 'disposable PG17 / local production build / real APIs / provider blocked', checks: [], screenshots: [] };
const password = 'old'; const hash = await hashPassword(password);
try {
  await pool.query('UPDATE activation_mail_dispatch_control SET enabled=true,generation=1 WHERE id=1');
  let address = 100;
  const ipPrefix = `2001:db8:${randomBytes(2).toString("hex")}:${randomBytes(2).toString("hex")}`;
  for (const theme of ['tea', 'paper', 'night']) for (const width of [320, 390, 1440]) {
    const fixtureIp = `${ipPrefix}::${address++}`;
    const [user] = (await pool.query('INSERT INTO users(email,password_hash,verification_required_at) VALUES($1,$2,NULL) RETURNING id', [`browser-${randomUUID()}@example.invalid`, hash])).rows;
    const session = randomBytes(32).toString('base64url');
    const context = await browser.newContext({ viewport: { width, height: 1000 }, locale: 'ru-RU', reducedMotion: 'reduce' });
    let releaseResponse = () => {};
    try {
      await pool.query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')", [user.id, createHash('sha256').update(session).digest('hex')]);
      await context.addCookies([{ name: 'comic_diary_session', value: session, url: origin, httpOnly: true }, { name: 'comic-diary-theme', value: theme, url: origin }]);
      const lostAck = theme === 'paper' && width === 390;
      const responseGate = new Promise(resolve => { releaseResponse = resolve; });
      await context.route('**/*', async route => {
        const request = route.request(); const url = new URL(request.url());
        if (url.origin !== origin) return route.abort();
        if (url.pathname.startsWith('/api/account/email-verification/')) {
          // Simulates canonical TLS ingress, without DNS or external network.
          const headers = { ...await request.allHeaders(), host: 'reader.example.invalid', origin: 'https://reader.example.invalid', 'x-real-ip': fixtureIp };
          const response = await context.request.fetch(request.url(), { method: request.method(), headers, data: request.postData(), maxRedirects: 0 });
          if (url.pathname.endsWith('/request')) {
            await responseGate;
            if (lostAck) return route.abort('failed');
          }
          return route.fulfill({ response });
        }
        return route.continue();
      });
      const page = await context.newPage(); const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(origin + '/account', { waitUntil: 'networkidle' });
      if (!enabled) {
        await page.getByRole('heading', { name: 'Профиль', exact: true }).waitFor();
        assert.equal(await page.locator('#email-verification').count(), 0);
        const response = await context.request.post(origin + '/api/account/email-verification/request', { data: { currentPassword: password } });
        assert.equal(response.status(), 503);
        const shot = `${theme}-${width}-off.png`; await page.screenshot({ path: resolve(output, shot), fullPage: true });
        manifest.screenshots.push(shot); manifest.checks.push({ theme, width, defaultOff: true, ordinarySessionPreserved: true });
        assert.deepEqual(errors, []); continue;
      }
      await page.getByText('Подтвердить почту', { exact: true }).first().click();
      const panel = page.getByRole('dialog', { name: 'Подтверждение почты', exact: true });
      await panel.waitFor();
      await page.keyboard.press('Escape'); await panel.waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: 'Подтвердить почту', exact: true }).click();
      await panel.getByLabel('Действующий пароль для отправки кода').fill('synthetic-unsaved');
      await page.keyboard.press('Escape');
      await panel.getByRole('button', { name: 'Продолжить ввод', exact: true }).click();
      assert.equal(await panel.getByLabel('Действующий пароль для отправки кода').inputValue(), 'synthetic-unsaved');
      await panel.getByLabel('Действующий пароль для отправки кода').fill(password);
      await panel.getByRole('button', { name: 'Отправить код на почту' }).click();
      await panel.getByRole('status').filter({ hasText: 'Принимаем запрос на письмо' }).waitFor();
      assert.equal(await panel.getByRole('button', { name: 'Принимаем запрос…', exact: true }).isDisabled(), true);
      await page.keyboard.press('Escape'); assert.equal(await panel.isVisible(), true);
      releaseResponse();
      if (lostAck) await panel.getByRole('alert').filter({ hasText: 'Соединение прервалось' }).waitFor();
      else await panel.getByRole('status').filter({ hasText: 'Запрос принят сервером' }).waitFor();
      assert.equal(await panel.getByLabel('Действующий пароль для отправки кода').count(), 0);
      assert.equal(await panel.getByLabel('Введите действующий пароль ещё раз').inputValue(), '');
      await panel.getByLabel('Код из письма').fill('x'.repeat(43));
      await panel.getByRole('button', { name: 'Закрыть подтверждение почты' }).click();
      await panel.getByRole('button', { name: 'Закрыть без сохранения' }).click();
      await panel.waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: 'Подтвердить почту', exact: true }).click();
      assert.equal(await panel.getByLabel('Код из письма').inputValue(), '');
      assert.equal(await panel.getByRole('button', { name: 'Отправить код на почту', exact: true }).count(), 0);
      const [row] = (await pool.query('SELECT t.*,o.* FROM email_verification_tokens t JOIN activation_mail_outbox o ON o.verification_token_id=t.id WHERE t.user_id=$1', [user.id])).rows;
      assert.ok(row); assert.equal(row.state, 'ready');
      const plain = unsealActivationMailOutboxPayload({ payloadCiphertext: row.payload_ciphertext, payloadNonce: row.payload_nonce, payloadKeyId: row.payload_key_id, payloadDigest: row.payload_digest }, {
        verificationTokenId: row.verification_token_id, idempotencyKey: row.idempotency_key, expiresAt: row.expires_at, purpose: 'legacy_email_verification',
      }, new Map([['legacy-browser', new Uint8Array(32).fill(23)]])); assert.ok(plain);
      const shot = `${theme}-${width}-form.png`;
      const bounds = await panel.boundingBox(); assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.y + bounds.height <= 1001, 'modal must fit the viewport'); await page.screenshot({ path: resolve(output, shot) }); manifest.screenshots.push(shot);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${theme}/${width}: horizontal overflow`);
      await panel.getByLabel('Код из письма').fill(plain.token);
      await panel.getByLabel('Введите действующий пароль ещё раз').fill('wrong');
      await panel.getByRole('button', { name: 'Подтвердить почту', exact: true }).click();
      await panel.getByRole('alert').waitFor();
      await panel.getByLabel('Код из письма').fill(plain.token);
      await panel.getByLabel('Введите действующий пароль ещё раз').fill(password);
      await panel.getByRole('button', { name: 'Подтвердить почту', exact: true }).click();
      await panel.getByRole('heading', { name: 'Почта подтверждена', exact: true }).waitFor();
      await panel.getByRole('button', { name: 'Вернуться в профиль', exact: true }).click();
      await panel.waitFor({ state: 'hidden' });
      await page.getByText('Почта подтверждена', { exact: true }).waitFor();
      assert.equal(await page.locator('#email-verification').count(), 0);
      const [verified] = (await pool.query('SELECT password_hash,email_verified_at,verification_required_at FROM users WHERE id=$1', [user.id])).rows;
      assert.equal(verified.password_hash, hash); assert.ok(verified.email_verified_at); assert.equal(verified.verification_required_at, null);
      assert.equal((await pool.query('SELECT count(*)::int n FROM sessions WHERE user_id=$1', [user.id])).rows[0].n, 1);
      assert.deepEqual(errors, []);
      manifest.checks.push({ theme, width, realRequest: true, wrongPasswordBlocked: true, realRedemption: true, unchangedPasswordAndSession: true, wizardSteps: true, busyCloseGuard: true, dirtyCloseGuard: true, reopenRetainsCodeStepWithoutSecrets: true, lostCommitAck: lostAck, noOverflow: true });
    } finally { releaseResponse(); await context.close(); await pool.query('DELETE FROM users WHERE id=$1', [user.id]); }
  }
  console.log(`LEGACY_BROWSER=PASS; MODE=${enabled ? 'enabled' : 'disabled'}; THEMES=3; WIDTHS=320,390,1440; PROVIDER_HTTP=BLOCKED`);
} finally {
  await writeFile(resolve(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await pool.query('UPDATE activation_mail_dispatch_control SET enabled=$1,generation=$2,updated_at=$3 WHERE id=1', [control.enabled, control.generation, control.updated_at]);
  await pool.end(); await browser.close();
}
