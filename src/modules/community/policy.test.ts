import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { CommunityError, textValue, parseCreate, parseEdit, parseReport, parseModeration,
  queryId, targetQuery, encodeCursor, decodeCursor, publicAlias } from "./policy";
const payload = () => ({ comicId: 1, body: "Hello", requestId: randomUUID() });
const bad = (action: () => unknown) => assert.throws(action, (e: unknown) => e instanceof CommunityError && e.status === 400);

test("trim, CRLF, Cyrillic, emoji and code-point maximum", () => {
  assert.equal(textValue("  Привет\r\n🐉  "), "Привет\n🐉");
  assert.equal(Array.from(textValue("🐉".repeat(2000))).length, 2000);
  bad(() => textValue("🐉".repeat(2001)));
});
test("empty, invisible-only, controls and unpaired surrogates rejected", () => {
  for (const v of ["", " \n\t", "\u200b\u200d", "\u0000", "a\u0001b", "\ud800", "\udfff"]) bad(() => textValue(v));
  assert.equal(textValue("👩‍💻"), "👩‍💻");
});
test("plain text preserves HTML/SQL literally; interpretation is never a policy feature", () => {
  assert.equal(textValue("<script>alert(1)</script> ' OR 1=1 --"), "<script>alert(1)</script> ' OR 1=1 --");
});
test("strict create DTO, UUID, IDs, booleans, chapter spoiler default", () => {
  assert.equal(parseCreate(payload()).spoiler, false);
  assert.equal(parseCreate({ ...payload(), chapterId: 2 }).spoiler, true);
  assert.equal(parseCreate({ ...payload(), chapterId: 2, spoiler: false }).spoiler, false);
  for (const patch of [{ authorUserId: 3 }, { status: "VISIBLE" }, { comicId: "1" }, { comicId: 0 }, { chapterId: -1 },
    { parentId: 0 }, { spoiler: "true" }, { requestId: "not-uuid" }]) bad(() => parseCreate({ ...payload(), ...patch }));
});
test("edit cannot retarget or change ownership/status", () => {
  assert.deepEqual(parseEdit({ body: " next ", spoiler: true }), { body: "next", spoiler: true });
  for (const p of [{ comicId: 2 }, { parentId: 3 }, { status: "VISIBLE" }, { authorUserId: 1 }]) bad(() => parseEdit({ body: "next", spoiler: false, ...p }));
  bad(() => parseEdit({ body: "x" }));
});
test("report reason whitelist and bounded optional note", () => {
  assert.deepEqual(parseReport({ reason: "SPOILER" }), { reason: "SPOILER", note: null });
  bad(() => parseReport({ reason: "FAKE" })); bad(() => parseReport({ reason: "SPAM", note: "x".repeat(301) }));
  bad(() => parseReport({ reason: "SPAM", reporterUserId: 5 }));
});
test("moderation payloads enforce action-specific target and ISO expiry", () => {
  assert.equal(parseModeration({ action: "HIDE", commentId: 1, reason: "Reviewed" }).action, "HIDE");
  bad(() => parseModeration({ action: "HIDE", userId: 1, reason: "x" }));
  bad(() => parseModeration({ action: "RESTRICT", userId: 1, reason: "x", until: "tomorrow" }));
  bad(() => parseModeration({ action: "UNRESTRICT", userId: 1, reason: " " }));
  bad(() => parseModeration({ action: "DELETE_ALL", reason: "x" }));
});
test("canonical cursor and strict numeric/query grammar", () => {
  const date = new Date("2026-11-19T01:02:03.004Z"); const encoded = encodeCursor(date, 42);
  assert.deepEqual(decodeCursor(encoded), { at: date, id: 42 }); assert.equal(decodeCursor(null), null);
  for (const v of ["01", "1.0", "1e2", "-1", "0", "2147483648"]) bad(() => queryId(v));
  for (const v of ["!", encoded + "=", "A".repeat(151), Buffer.from('["invalid",1]').toString("base64url"), Buffer.from('["0000-01-01T00:00:00.000Z",1]').toString("base64url")]) bad(() => decodeCursor(v));
  bad(() => targetQuery(new URLSearchParams("comicId=1&comicId=2")));
  bad(() => targetQuery(new URLSearchParams("comicId=1&authorId=4")));
});
test("public alias never falls back to email or inactive identity", () => {
  assert.equal(publicAlias("reader@example.invalid", true), "Читатель");
  assert.equal(publicAlias("Alice", false), "Читатель"); assert.equal(publicAlias(null, true), "Читатель");
  assert.equal(publicAlias("  Reader\u0001 A ", true), "Reader A");
});

let http: typeof import("./http");
before(async () => {
  Object.assign(process.env, { DATABASE_URL: "postgresql://unit:unit@127.0.0.1:1/unit", NODE_ENV: "test", COMIC_DIARY_PUBLIC_ORIGIN: "https://reader.example.invalid" });
  http = await import("./http");
});
after(async () => { const { db } = await import("@/db"); await db.$client.end(); });
test("bounded JSON accepts chunked input and rejects oversized/invalid UTF-8/JSON/media", async () => {
  assert.deepEqual(await http.readBoundedJson(new Request("https://reader.example.invalid", { method: "POST", headers: { "content-type": "application/json" }, body: '{"x":1}' })), { x: 1 });
  for (const [body, contentType, status] of [[" ".repeat(16385), "application/json", 413], ["{", "application/json", 400], ["{}", "text/plain", 415]] as const) {
    await assert.rejects(http.readBoundedJson(new Request("https://reader.example.invalid", { method: "POST", headers: { "content-type": contentType }, body })), (e: unknown) => e instanceof CommunityError && e.status === status);
  }
  await assert.rejects(http.readBoundedJson(new Request("https://reader.example.invalid", { method: "POST", headers: { "content-type": "application/json" }, body: new Uint8Array([0xff]) })), (e: unknown) => e instanceof CommunityError && e.status === 400);
});
test("foreign origin is rejected before body access or any session/DB resolution", async () => {
  const request = new NextRequest("https://reader.example.invalid/api/community/comments", { method: "POST", headers: { origin: "https://evil.example.invalid", host: "reader.example.invalid" } });
  Object.defineProperty(request, "body", { get() { throw Error("BODY MUST NOT BE READ"); } });
  const response = await http.commentsPost(request);
  assert.equal(response.status, 403); assert.deepEqual(await response.json(), { error: "forbidden_origin" });
  assert.match(response.headers.get("cache-control")!, /no-store/);
});
test("oversized payload is rejected before Next session context and DB", async () => {
  const request = new NextRequest("https://reader.example.invalid/api/community/comments", { method: "POST", headers: { origin: "https://reader.example.invalid", host: "reader.example.invalid", "content-type": "application/json", "content-length": "999999" }, body: "{}" });
  assert.equal((await http.commentsPost(request)).status, 413);
});
test("DELETE accepts an empty stream as well as null body, but rejects actual content", async () => {
  await http.readEmptyBody(new Request("https://reader.example.invalid", { method: "DELETE" }));
  await http.readEmptyBody(new Request("https://reader.example.invalid", { method: "DELETE", body: "" }));
  await assert.rejects(http.readEmptyBody(new Request("https://reader.example.invalid", { method: "DELETE", body: "{}" })), (e: unknown) => e instanceof CommunityError && e.status === 400);
});
