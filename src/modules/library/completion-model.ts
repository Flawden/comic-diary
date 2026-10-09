import type { SeriesStatus } from "@/modules/comics/series-status";
export type CompletionScope = "MAIN" | "ALL" | "LEGACY" | "STATUS_ONLY";

export function completionSnapshot(registry: { id: number; kind: string; status: string }[], legacyTotal: number | null, seriesStatus: SeriesStatus = "UNKNOWN") {
  const chapters = registry.length
    ? registry.map((c) => `${c.id}:${c.kind}:${c.status}`).sort().join("|")
    : `legacy:${legacyTotal ?? "unknown"}`;
  return `${seriesStatus}:${chapters}`;
}

export function isCompletionScope(value: unknown): value is CompletionScope {
  return value === "MAIN" || value === "ALL" || value === "STATUS_ONLY";
}
