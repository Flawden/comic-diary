import assert from "node:assert/strict";
import test from "node:test";
import { comicListHref, listReturn } from "./list-navigation";

function roundTrip(origin: "library" | "catalog", values: Record<string,string>) {
  const link = new URL(comicListHref("123", origin, values), "https://example.test");
  assert.equal(link.pathname, "/comics/123");
  return listReturn(Object.fromEntries(link.searchParams), 42);
}

test("catalog search 12 returns to both results at the selected card", () => {
  assert.deepEqual(roundTrip("catalog", { q: "12" }), { label: "Каталог", href: "/?q=12#book-42" });
});
test("all catalog filters survive, including punctuation in a query", () => {
  const fields = { q: "Кровь & чай + 12", category: "tea", sort: "TITLE_DESC", series: "FINISHED", type: "MANGA", format: "OTHER" };
  const url = new URL(roundTrip("catalog", fields).href, "https://example.test");
  assert.deepEqual(Object.fromEntries(url.searchParams), fields);
});
test("shelf keeps status, search and sort separately from catalog filters", () => {
  const back = roundTrip("library", { status: "COMPLETED", q: "12", sort: "UPDATED", category: "ignored" });
  assert.equal(back.label, "В дневник");
  const url = new URL(back.href, "https://example.test");
  assert.equal(url.pathname, "/library");
  assert.deepEqual(Object.fromEntries(url.searchParams), { q: "12", status: "COMPLETED", sort: "UPDATED" });
});
test("direct, ambiguous and external origins never become destinations", () => {
  for (const from of [undefined, ["catalog", "library"], "//untrusted.example"]) {
    assert.deepEqual(listReturn({from, q:"12"}, 42), {href:"/", label:"Каталог"});
  }
  assert.equal(listReturn({from:"library", next:"https://untrusted.example"},42).href,"/library#book-42");
});
