/**
 * AUTH-01C2B4D2C1: Schema/constraint integration on the EXACT disposable CI PG17 only.
 * No real code, encryption implementation, outbox worker or mail sending.
 */
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';

function assertDisposableCiTarget(): string {
 const url=process.env.DATABASE_URL;
 if(!url || process.env.GITHUB_ACTIONS !== 'true' ||
    process.env.GITHUB_REPOSITORY !== 'Flawden/comic-diary' ||
    process.env.GITHUB_WORKFLOW !== 'CI') throw new Error('REFUSED: exact disposable CI only');
 let u:URL;
 try {u=new URL(url);}catch {throw new Error('REFUSED: invalid DB URI');}
 if(u.protocol!=='postgresql:' || u.hostname!=='127.0.0.1' || u.port!=='5432' ||
    u.pathname!=='/comic_diary_release' || u.username!=='comic_diary_ci' ||
    u.password!=='ci_ephemeral_password' || u.search!=='' || u.hash!=='') {
   throw new Error('REFUSED: non-disposable database');
 }
 return url;
}

async function main():Promise<void> {
 const connectionString=assertDisposableCiTarget();
 const pool=new Pool({connectionString,connectionTimeoutMillis:5000});
 let userId:number|null=null;
 let tokenId:number|null=null;
 const digest=(text:string)=>createHash('sha256').update(text).digest('hex');
 const tokenHash=digest(`ci-${randomUUID()}`);
 const encryptedFixture=randomBytes(96).toString('base64url'); // opaque fake ciphertext; NO live crypto or code.
 const nonce=randomBytes(12).toString('base64url');
 const idem=randomBytes(24).toString('base64url');
 const expiry=new Date(Date.now()+30*60*1000);
 const claim1=randomBytes(24).toString('base64url');
 const claim2=randomBytes(24).toString('base64url');
 async function expectRejected(query:string, values:unknown[], expectedCode:string) {
   await assert.rejects(pool.query(query,values),(error:unknown)=>{
     assert.equal((error as {code?:string}).code,expectedCode);return true;
   });
 }
 try {
  const v=await pool.query<{major:number}>("SELECT current_setting('server_version_num')::int / 10000 AS major");
  assert.equal(v.rows[0]?.major,17);
  const fixtureEmail=`auth-d2c1-${randomUUID()}@example.invalid`;
  const user=await pool.query<{id:number}>(
   "INSERT INTO users (email,password_hash,role,is_active,verification_required_at) VALUES ($1,$2,'USER',true,now()) RETURNING id",
   [fixtureEmail,'ci-non-login-fixture-hash']);
  userId=user.rows[0].id;
  const token=await pool.query<{id:number}>(
   "INSERT INTO email_verification_tokens (user_id,email_snapshot,token_hash,expires_at) VALUES ($1,$2,$3,$4) RETURNING id",
   [userId,fixtureEmail,tokenHash,expiry]);
  tokenId=token.rows[0].id;
  const insert=`INSERT INTO activation_mail_outbox
    (verification_token_id,payload_ciphertext,payload_nonce,payload_key_id,payload_digest,idempotency_key,expires_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id,state,attempt_count`;
  const values=[tokenId,encryptedFixture,nonce,'ci_ephemeral_v1',digest(encryptedFixture),idem,expiry];
  const inserted=await pool.query<{id:number;state:string;attempt_count:number}>(insert,values);
  const id=inserted.rows[0].id;
  assert.equal(inserted.rows[0].state,'ready');
  assert.equal(inserted.rows[0].attempt_count,0);
  await expectRejected(insert,values,'23505'); // one mail per issuance.
  await expectRejected(insert,[tokenId,encryptedFixture,nonce,'ci_ephemeral_v1',digest(encryptedFixture),randomBytes(24).toString('base64url'),expiry],'23505');
  await pool.query('UPDATE email_verification_tokens SET revoked_at=now() WHERE id=$1',[tokenId]);
  const second=await pool.query<{id:number}>(
   'INSERT INTO email_verification_tokens (user_id,email_snapshot,token_hash,expires_at) VALUES ($1,$2,$3,$4) RETURNING id',
   [userId,fixtureEmail,digest(`ci-second-${randomUUID()}`),expiry]);
  await expectRejected(insert,[second.rows[0].id,encryptedFixture,nonce,'ci_ephemeral_v1',digest(encryptedFixture),idem,expiry],'23505');
  await expectRejected('UPDATE activation_mail_outbox SET state=$1 WHERE id=$2',['unknown',id],'23514');
  await expectRejected('UPDATE activation_mail_outbox SET payload_nonce=$1 WHERE id=$2',['wrong',id],'23514');
  await expectRejected('UPDATE activation_mail_outbox SET attempt_count=$1 WHERE id=$2',[2,id],'23514');
  await expectRejected('UPDATE activation_mail_outbox SET payload_ciphertext=$1 WHERE id=$2',['raw code with spaces',id],'23514');
  console.log('C2B4D2C1_SCHEMA_GUARDS=PASS');

  const claim=`UPDATE activation_mail_outbox SET state='in_flight',attempt_count=1,
       claim_id=$2,claimed_at=now(),updated_at=now()
       WHERE id=$1 AND state='ready' AND expires_at>now()+interval '1 minute' RETURNING id`;
  const replies=await Promise.all([pool.query(claim,[id,claim1]),pool.query(claim,[id,claim2])]);
  assert.equal(replies.filter(r=>r.rowCount===1).length,1);
  assert.equal(replies.filter(r=>r.rowCount===0).length,1);
  console.log('C2B4D2C1_CONCURRENT_CLAIM=PASS');
  await pool.query("UPDATE activation_mail_outbox SET state='uncertain',finalized_at=now(),updated_at=now() WHERE id=$1",[id]);
  assert.equal((await pool.query(claim,[id,randomBytes(24).toString('base64url')])).rowCount,0);
  await expectRejected("UPDATE activation_mail_outbox SET state='ready' WHERE id=$1",[id],'23514');
  console.log('C2B4D2C1_NO_RECLAIM=PASS');

  await pool.query('DELETE FROM users WHERE id=$1',[userId]);
  userId=null;
  const remain=await pool.query<{count:string}>('SELECT count(*)::text AS count FROM activation_mail_outbox WHERE id=$1',[id]);
  assert.equal(remain.rows[0]?.count,'0');
  console.log('C2B4D2C1_CASCADE=PASS');
 } finally {
  if(userId!==null) await pool.query('DELETE FROM users WHERE id=$1',[userId]).catch(()=>undefined);
  await pool.end();
 }
}
main().catch(e=>{console.error('C2B4D2C1_PG_PROBE=FAIL',e instanceof Error?e.message:'error');process.exitCode=1;});
