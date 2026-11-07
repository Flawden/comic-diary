import assert from "node:assert/strict";
import test from "node:test";

import type { NextRequest } from "next/server";

import {
  isAllowedRequestOrigin,
  isSameOriginRequest,
} from "./request-origin";

const PUBLIC = "https://comic-diary.2-26-67-21.sslip.io";
const CANONICAL_HOST = "comic-diary.2-26-67-21.sslip.io";

type RequestOverrides = {
  origin?: string | null;
  host?: string | null;
  forwardedHost?: string | null;
  forwardedProto?: string | null;
  requestUrl?: string;
};

function fakeRequest(overrides: RequestOverrides = {}): NextRequest {
  const headers = new Headers();
  const origin = overrides.origin === undefined ? PUBLIC : overrides.origin;
  const host = overrides.host === undefined ? CANONICAL_HOST : overrides.host;

  if (origin != null) headers.set("origin", origin);
  if (host != null) headers.set("host", host);
  if (overrides.forwardedHost != null) {
    headers.set("x-forwarded-host", overrides.forwardedHost);
  }
  if (overrides.forwardedProto != null) {
    headers.set("x-forwarded-proto", overrides.forwardedProto);
  }

  return {
    headers,
    nextUrl: new URL(overrides.requestUrl ?? `${PUBLIC}/api/auth/login`),
  } as unknown as NextRequest;
}

function withEnv(
  nodeEnv: string,
  configured: string | undefined,
  run: () => void,
): void {
  const beforeEnv = process.env.NODE_ENV;
  const beforeConfigured = process.env.COMIC_DIARY_PUBLIC_ORIGIN;
  try {
    Reflect.set(process.env, "NODE_ENV", nodeEnv);
    if (configured === undefined) {
      delete process.env.COMIC_DIARY_PUBLIC_ORIGIN;
    } else {
      process.env.COMIC_DIARY_PUBLIC_ORIGIN = configured;
    }
    run();
  } finally {
    if (beforeEnv === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else Reflect.set(process.env, "NODE_ENV", beforeEnv);
    if (beforeConfigured === undefined) delete process.env.COMIC_DIARY_PUBLIC_ORIGIN;
    else process.env.COMIC_DIARY_PUBLIC_ORIGIN = beforeConfigured;
  }
}

test("production allows a matching canonical origin and Host", () => {
  withEnv("production", PUBLIC, () => {
    assert.equal(isSameOriginRequest(fakeRequest()), true);
  });
});

test("production rejects a foreign Origin", () => {
  withEnv("production", PUBLIC, () => {
    assert.equal(isSameOriginRequest(fakeRequest({ origin: "https://probe.invalid" })), false);
  });
});

test("forged X-Forwarded-Host and proto cannot bypass Origin rejection", () => {
  withEnv("production", PUBLIC, () => {
    assert.equal(isSameOriginRequest(fakeRequest({
      origin: "https://probe.invalid",
      forwardedHost: "probe.invalid",
      forwardedProto: "https",
    })), false);
  });
});

test("a forged Host cannot bypass rejection", () => {
  withEnv("production", PUBLIC, () => {
    assert.equal(isSameOriginRequest(fakeRequest({
      origin: "https://probe.invalid",
      host: "probe.invalid",
    })), false);
  });
});

test("a forged Host is rejected even with an approved Origin", () => {
  withEnv("production", PUBLIC, () => {
    assert.equal(isSameOriginRequest(fakeRequest({ host: "probe.invalid" })), false);
  });
});

test("untrusted forwarding headers are ignored even with canonical Host", () => {
  withEnv("production", PUBLIC, () => {
    assert.equal(isSameOriginRequest(fakeRequest({
      forwardedHost: "probe.invalid",
      forwardedProto: "http",
    })), true);
  });
});

test("production rejects missing/invalid/insecure canonical URL", () => {
  for (const config of [
    undefined,
    "",
    "not a url",
    "http://comic-diary.2-26-67-21.sslip.io",
    `${PUBLIC}/`,
    `${PUBLIC}/api`,
    `${PUBLIC}?query=yes`,
    `${PUBLIC}#hash`,
    ` https://comic-diary.2-26-67-21.sslip.io`,
    "https://someone:secret@comic-diary.2-26-67-21.sslip.io",
  ]) {
    withEnv("production", config, () => {
      assert.equal(isSameOriginRequest(fakeRequest()), false, `Accepted ${String(config)}`);
    });
  }
});

test("missing Origin and null Origin are rejected", () => {
  withEnv("production", PUBLIC, () => {
    assert.equal(isSameOriginRequest(fakeRequest({ origin: null })), false);
    assert.equal(isSameOriginRequest(fakeRequest({ origin: "null" })), false);
  });
});

test("origin value must be an exact serialized Origin", () => {
  assert.equal(isAllowedRequestOrigin(`${PUBLIC}/anything`, PUBLIC), false);
  assert.equal(isAllowedRequestOrigin(`${PUBLIC}?query=yes`, PUBLIC), false);
  assert.equal(isAllowedRequestOrigin(`${PUBLIC}.evil.invalid`, PUBLIC), false);
  assert.equal(isAllowedRequestOrigin(PUBLIC, PUBLIC), true);
});

test("development localhost with arbitrary port remains usable", () => {
  withEnv("development", undefined, () => {
    assert.equal(isSameOriginRequest(fakeRequest({
      requestUrl: "http://localhost:3102/api/auth/login",
      host: "localhost:3102",
      origin: "http://localhost:3102",
    })), true);
    assert.equal(isSameOriginRequest(fakeRequest({
      requestUrl: "http://localhost:3102/api/auth/login",
      host: "localhost:3102",
      origin: "https://probe.invalid",
      forwardedHost: "probe.invalid",
      forwardedProto: "https",
    })), false);
  });
});
