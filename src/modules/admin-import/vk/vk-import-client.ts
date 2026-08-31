export type VkImportAction =
  | "create"
  | "update"
  | "unchanged"
  | "imported";

export type VkImportResultItem = {
  candidateId: string;
  albumId: number;
  canonicalSha256: string;
  action: VkImportAction;
  receiptInserted: boolean;
};

export type VkImportResult = {
  summary: {
    accepted: number;
    create: number;
    update: number;
    unchanged: number;
    imported: number;
    receiptsInserted: number;
  };

  items: VkImportResultItem[];
};

export type VkImportMode =
  | "dry-run"
  | "apply";

export type VkImportSuccess = {
  ok: true;
  mode: VkImportMode;
  result: VkImportResult;
};

export class VkImportRequestError
  extends Error {
  readonly status:
    number;

  readonly kind:
    string;

  constructor(
    status: number,
    kind: string,
  ) {
    super(
      `Catalog import request failed: ${kind}`,
    );

    this.name =
      "VkImportRequestError";

    this.status =
      status;

    this.kind =
      kind;
  }
}

type RequestInput = {
  candidateSha256: string;
  reviewArtifact: unknown;
  mode: VkImportMode;
  confirmApply: boolean;
};

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function requireInteger(
  value: unknown,
  field: string,
) {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new Error(
      `Invalid import response field: ${field}`,
    );
  }

  return value;
}

function requireString(
  value: unknown,
  field: string,
) {
  if (
    typeof value !== "string"
  ) {
    throw new Error(
      `Invalid import response field: ${field}`,
    );
  }

  return value;
}

function requireAction(
  value: unknown,
): VkImportAction {
  if (
    value === "create" ||
    value === "update" ||
    value === "unchanged" ||
    value === "imported"
  ) {
    return value;
  }

  throw new Error(
    "Invalid import response action",
  );
}

function readErrorKind(
  value: unknown,
) {
  if (
    isRecord(value) &&
    isRecord(value.error) &&
    typeof value.error.kind ===
      "string"
  ) {
    return value.error.kind;
  }

  return "unexpected-response";
}

function parseSuccess(
  value: unknown,
): VkImportSuccess {
  if (
    !isRecord(value) ||
    value.ok !== true ||
    (
      value.mode !== "dry-run" &&
      value.mode !== "apply"
    ) ||
    !isRecord(value.result) ||
    !isRecord(value.result.summary) ||
    !Array.isArray(value.result.items)
  ) {
    throw new Error(
      "Invalid catalog import response",
    );
  }

  const summary =
    value.result.summary;

  const items =
    value.result.items.map(
      (
        raw,
        index,
      ): VkImportResultItem => {
        if (!isRecord(raw)) {
          throw new Error(
            `Invalid import result item ${index}`,
          );
        }

        const receiptInserted =
          raw.receiptInserted;

        if (
          receiptInserted !== undefined &&
          typeof receiptInserted !==
            "boolean"
        ) {
          throw new Error(
            `Invalid import receipt flag ${index}`,
          );
        }

        return {
          candidateId:
            requireString(
              raw.candidateId,
              `items[${index}].candidateId`,
            ),

          albumId:
            requireInteger(
              raw.albumId,
              `items[${index}].albumId`,
            ),

          canonicalSha256:
            requireString(
              raw.canonicalSha256,
              `items[${index}].canonicalSha256`,
            ),

          action:
            requireAction(
              raw.action,
            ),

          receiptInserted:
            receiptInserted ===
            true,
        };
      },
    );

  return {
    ok:
      true,

    mode:
      value.mode,

    result: {
      summary: {
        accepted:
          requireInteger(
            summary.accepted,
            "summary.accepted",
          ),

        create:
          requireInteger(
            summary.create,
            "summary.create",
          ),

        update:
          requireInteger(
            summary.update,
            "summary.update",
          ),

        unchanged:
          requireInteger(
            summary.unchanged,
            "summary.unchanged",
          ),

        imported:
          requireInteger(
            summary.imported,
            "summary.imported",
          ),

        receiptsInserted:
          summary.receiptsInserted ===
            undefined
            ? 0
            : requireInteger(
                summary.receiptsInserted,
                "summary.receiptsInserted",
              ),
      },

      items,
    },
  };
}

export async function postVkCatalogImport(
  input: RequestInput,
  fetchImplementation:
    typeof fetch =
    fetch,
): Promise<VkImportSuccess> {
  const response =
    await fetchImplementation(
      "/api/admin/catalog-import/vk/import",
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        credentials:
          "same-origin",

        cache:
          "no-store",

        body:
          JSON.stringify({
            candidateSha256:
              input.candidateSha256,

            reviewArtifact:
              input.reviewArtifact,

            mode:
              input.mode,

            confirmApply:
              input.confirmApply,
          }),
      },
    );

  let payload:
    unknown;

  try {
    payload =
      await response.json();
  } catch {
    throw new VkImportRequestError(
      response.status,
      "invalid-json-response",
    );
  }

  if (!response.ok) {
    throw new VkImportRequestError(
      response.status,
      readErrorKind(
        payload,
      ),
    );
  }

  return parseSuccess(
    payload,
  );
}
