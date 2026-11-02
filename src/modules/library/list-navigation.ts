type Query = Record<string, string | string[] | undefined>;
type Origin = "catalog" | "library";
const fields = {
  catalog: ["q", "category", "sort", "series", "type", "format"],
  library: ["q", "status", "sort"],
} as const;

function filters(origin: Origin, values: Query) {
  const params = new URLSearchParams();
  for (const field of fields[origin]) {
    const raw = values[field];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value) params.set(field, value);
  }
  return params;
}

export function comicListHref(slug: string, origin: Origin, values: Query) {
  const params = filters(origin, values);
  params.set("from", origin);
  return `/comics/${encodeURIComponent(slug)}?${params}`;
}

export function listReturn(values: Query, comicId: number) {
  const origin = values.from;
  if (origin !== "library" && origin !== "catalog") return { href: "/", label: "Каталог" };
  const query = filters(origin, values).toString();
  const path = origin === "library" ? "/library" : "/";
  return { href: path + (query ? "?" + query : "") + "#book-" + comicId,
    label: origin === "library" ? "В дневник" : "Каталог" };
}
