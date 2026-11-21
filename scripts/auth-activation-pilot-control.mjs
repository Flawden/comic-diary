/** Trusted server operator CLI. Default-OFF; no issuance or provider HTTP. */
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
// Runtime enables these switches only for the exact string "true"; absence is
// default-OFF. Arming is stricter: reject malformed values rather than silently
// treating a typo as OFF. Keep the runtime-default contract tests in sync.
const authSwitches = [
  'PASSWORD_RESET_REQUEST_ENABLED',
  'PASSWORD_RESET_REQUEST_MAIL_READY',
  'PASSWORD_RESET_REDEEM_ENABLED',
  'AUTH_RECOVERY_WORKER_ENABLED',
  'AUTH_RECOVERY_DISPATCH_ENABLED',
  'AUTH_RECOVERY_SENDER_VERIFIED',
  'AUTH_RECOVERY_RESEND_CONFIG_READY',
  'REGISTRATION_ENABLED',
  'REGISTRATION_ACTIVATION_REDEEM_ENABLED',
  'AUTH_ACTIVATION_RESEND_CONFIG_READY',
  'AUTH_ACTIVATION_SENDER_VERIFIED',
  'AUTH_ACTIVATION_DISPATCH_ENABLED',
  'AUTH_ACTIVATION_WORKER_ENABLED',
  'AUTH_ACTIVATION_OPERATOR_CONTROL_ENABLED',
  'AUTH_LEGACY_EMAIL_VERIFICATION_ENABLED',
  'AUTH_LEGACY_EMAIL_VERIFICATION_REQUEST_ENABLED',
  'AUTH_BETA_INVITATION_REGISTRATION_ENABLED',
  'AUTH_BETA_INVITATION_DISPATCH_ENABLED',
];
const [command, expectedText, ...extra] = process.argv.slice(2);
if (extra.length || !['status','arm','close'].includes(command) ||
    (command==='status' ? expectedText!==undefined : !/^(0|[1-9][0-9]*)$/.test(expectedText??''))) {
  console.error('Usage: auth-activation-pilot-control.mjs status | arm GENERATION | close GENERATION'); process.exit(1);
}
const pool=new Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000});
let client;
try {
  if(!process.env.DATABASE_URL) throw Error('configuration');
  client=await pool.connect();
  if(command==='status') {
    // One read-only snapshot; explicitly select safe fields, never the payload.
    const {rows}=await client.query(`SELECT c.enabled,c.generation,c.pilot_id,c.pilot_user_id,c.pilot_outbox_id,
      c.pilot_armed_at,c.pilot_dispatch_used_at,c.pilot_closed_at,
      o.id IS NOT NULL AS job_exists,o.state AS job_state,
      o.dispatch_started_at IS NOT NULL AS job_started,o.finalized_at IS NOT NULL AS job_finalized
      FROM activation_mail_dispatch_control c LEFT JOIN activation_mail_outbox o ON o.id=c.pilot_outbox_id WHERE c.id=1`);
    if(rows.length!==1) throw Error('control');
    const {job_exists,job_state,job_started,job_finalized,...control}=rows[0];
    console.log(JSON.stringify({...control,outbox:{pinned:control.pilot_outbox_id!==null,
      exists:job_exists,state:job_state,dispatchStarted:job_started,finalized:job_finalized}}));
  } else {
    const expected=Number(expectedText); if(!Number.isSafeInteger(expected)) throw Error('generation');
    await client.query('BEGIN');
    const {rows:[control]}=await client.query('SELECT * FROM activation_mail_dispatch_control WHERE id=1 FOR UPDATE');
    if(!control || control.enabled || control.generation!==expected) throw Error('gate must be OFF at exact generation');
    let committedStart=false;
    if(command==='arm') {
      if(control.pilot_id!==null || authSwitches.some(k=>process.env[k]!==undefined && process.env[k]!=='false')) throw Error('arming prerequisites');
      const {rows:[recovery]}=await client.query('SELECT enabled FROM password_reset_mail_dispatch_control WHERE id=1 FOR SHARE');
      if(!recovery || recovery.enabled) throw Error('recovery gate');
      const {rows:[user]}=await client.query("SELECT id FROM users WHERE id=1 AND is_active AND email_verified_at IS NULL AND verification_required_at IS NULL AND password_hash IS NOT NULL AND length(password_hash)>0 FOR UPDATE");
      if(!user) throw Error('target');
      const {rows:[work]}=await client.query("SELECT (SELECT count(*) FROM activation_mail_outbox WHERE state IN ('ready','in_flight'))+(SELECT count(*) FROM password_reset_mail_outbox WHERE state IN ('ready','in_flight')) AS n");
      if(Number(work.n)!==0) throw Error('queue not empty');
      const changed=await client.query('UPDATE activation_mail_dispatch_control SET pilot_id=$1,pilot_user_id=1,pilot_armed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=1 AND NOT enabled AND generation=$2 AND pilot_id IS NULL RETURNING pilot_id',[randomUUID(),expected]);
      if(changed.rowCount!==1) throw Error('conflict');
    } else {
      if(!control.pilot_id || control.pilot_closed_at!==null) throw Error('not open');
      // CONTROL UPDATE excludes a new start while this snapshot is read. A
      // missing job must not hide a consumed budget's committed-start warning.
      committedStart=control.pilot_dispatch_used_at!==null;
      if(control.pilot_outbox_id!==null) {
        const {rows:[job]}=await client.query('SELECT dispatch_started_at IS NOT NULL AS started FROM activation_mail_outbox WHERE id=$1',[control.pilot_outbox_id]);
        committedStart ||= job?.started===true;
      }
      await client.query('UPDATE activation_mail_dispatch_control SET pilot_closed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=1');
    }
    await client.query('COMMIT'); console.log('PILOT_'+command.toUpperCase()+'=PASS; GATE_AND_GENERATION_UNCHANGED');
    if(committedStart) console.warn('WARNING: dispatch start was already committed; the HTTP operation may still complete. Close does not cancel it or restore the budget.');
  }
} catch {
  if(client) await client.query('ROLLBACK').catch(()=>{});
  console.error('Pilot control refused; inspect status and prerequisites. No values logged.');process.exitCode=1;
} finally {client?.release();await pool.end();}
