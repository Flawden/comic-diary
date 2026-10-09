export type CompletionScope = "MAIN" | "ALL" | "LEGACY" | "STATUS_ONLY";

export function completionSnapshot(registry: { id: number; kind: string; status: string }[], legacyTotal: number | null) {
  return registry.length
    ? registry.map((c) => `${c.id}:${c.kind}:${c.status}`).sort().join("|")
    : `legacy:${legacyTotal ?? "unknown"}`;
}

export function isCompletionScope(value: unknown): value is CompletionScope {
  return value === "MAIN" || value === "ALL" || value === "LEGACY" || value === "STATUS_ONLY";
}
