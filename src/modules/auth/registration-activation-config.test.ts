import assert from "node:assert/strict";
import test from "node:test";
import { readActivationDispatchConfig, activationDispatchOperational, activationRegistrationOperational } from "./registration-activation-config";
const ready = { AUTH_ACTIVATION_DISPATCH_ENABLED:"true", AUTH_ACTIVATION_SENDER_VERIFIED:"true", REGISTRATION_ACTIVATION_REDEEM_ENABLED:"true",
 AUTH_ACTIVATION_WORKER_ENABLED:"true", REGISTRATION_ENABLED:"true", AUTH_ACTIVATION_RESEND_CONFIG_READY:"true",
 RESEND_API_KEY:"re_SYNTHETIC_NO_REAL_CREDENTIAL", AUTH_ACTIVATION_FROM_ADDRESS:"no-reply@example.invalid",
 AUTH_ACTIVATION_SENDER_DOMAIN:"example.invalid", AUTH_ACTIVATION_PUBLIC_ORIGIN:"https://example.invalid", COMIC_DIARY_PUBLIC_ORIGIN:"https://example.invalid",
 AUTH_ACTIVATION_OUTBOX_KEY_ID:"test", AUTH_ACTIVATION_OUTBOX_KEY_BASE64:Buffer.alloc(32,7).toString("base64") };
test("empty environment and key alone are disabled",()=>{assert.equal(readActivationDispatchConfig({}),null);assert.equal(activationRegistrationOperational({RESEND_API_KEY:ready.RESEND_API_KEY}),false);});
for(const name of Object.keys(ready)) test(`registration fails closed without ${name}`,()=>{
 const env:Record<string,string|undefined>={...ready};delete env[name];assert.equal(activationRegistrationOperational(env),false);
});
test("config, worker and public registration are separate",()=>{
 assert.ok(readActivationDispatchConfig({...ready,REGISTRATION_ENABLED:"false",AUTH_ACTIVATION_WORKER_ENABLED:"false"}));
 assert.equal(activationDispatchOperational({...ready,REGISTRATION_ENABLED:"false"}),true);
 assert.equal(activationRegistrationOperational({...ready,REGISTRATION_ENABLED:"false"}),false);
 assert.equal(activationRegistrationOperational(ready),true);
});
for(const [name,value] of [["AUTH_ACTIVATION_FROM_ADDRESS","Dragon <no-reply@example.invalid>"],["AUTH_ACTIVATION_PUBLIC_ORIGIN","https://evil.invalid"],["AUTH_ACTIVATION_OUTBOX_KEY_BASE64","invalid"],["AUTH_ACTIVATION_RESEND_CONFIG_READY","TRUE"],["AUTH_ACTIVATION_SENDER_VERIFIED","1"],["RESEND_API_KEY","bad"]]) test(`invalid ${name} is denied`,()=>{assert.equal(readActivationDispatchConfig({...ready,[name]:value}),null);});
