/** Explicit server-operator tool, never called by startup or migrations.
 * No provider HTTP. Keep DATABASE_URL and credentials in server secret storage.
 */
import { Pool } from 'pg';

async function main() {
  const [command, generationText, ...extra] = process.argv.slice(2);
  if (extra.length || !['status', 'on', 'off'].includes(command) ||
      (command === 'status' ? generationText !== undefined : !/^(0|[1-9][0-9]*)$/.test(generationText ?? ''))) {
    throw Error('Usage: auth-recovery-control.mjs status | on GENERATION | off GENERATION');
  }
  const expected = Number(generationText);
  if (command !== 'status' && (!Number.isSafeInteger(expected) || expected >= 2147483646)) throw Error('Invalid generation');
  if (!process.env.DATABASE_URL) throw Error('DATABASE_URL is required');
  if (command === 'on') {
    const flags = ['AUTH_RECOVERY_DISPATCH_ENABLED', 'AUTH_RECOVERY_SENDER_VERIFIED', 'AUTH_RECOVERY_RESEND_CONFIG_READY', 'AUTH_RECOVERY_WORKER_ENABLED', 'PASSWORD_RESET_REDEEM_ENABLED'];
    const settings = ['RESEND_API_KEY', 'AUTH_RECOVERY_FROM_ADDRESS', 'AUTH_RECOVERY_SENDER_DOMAIN', 'AUTH_RECOVERY_PUBLIC_ORIGIN', 'PASSWORD_RESET_OUTBOX_KEY_ID', 'PASSWORD_RESET_OUTBOX_KEY_BASE64'];
    if (flags.some(name => process.env[name] !== 'true') || settings.some(name => !process.env[name]) ||
        process.env.AUTH_RECOVERY_PUBLIC_ORIGIN !== process.env.COMIC_DIARY_PUBLIC_ORIGIN) throw Error('Recovery configuration is incomplete');
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  try {
    if (command === 'status') {
      const result = await pool.query('SELECT enabled,generation FROM password_reset_mail_dispatch_control WHERE id=1');
      if (result.rows.length !== 1) throw Error('Recovery control is unavailable');
      console.log(JSON.stringify(result.rows[0]));
      return;
    }
    // UPDATE serializes on the SAME control row as reservation and network start.
    const result = await pool.query('UPDATE password_reset_mail_dispatch_control SET enabled=$1,generation=generation+1,updated_at=now() WHERE id=1 AND generation=$2 AND enabled<>$1 RETURNING enabled,generation', [command === 'on', expected]);
    if (result.rows.length !== 1) throw Error('Control conflict: reread status before an explicit transition');
    console.log(JSON.stringify(result.rows[0]));
  } finally { await pool.end(); }
}
main().catch(() => { console.error('Recovery control refused or unavailable; check arguments, configuration and current generation'); process.exitCode = 1; });
