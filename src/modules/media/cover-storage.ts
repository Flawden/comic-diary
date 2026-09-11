import {
  mkdir,
  writeFile,
} from "node:fs/promises";

import path from "node:path";

import {
  randomUUID,
} from "node:crypto";

export const MAX_COVER_BYTES =
  6 * 1024 * 1024;

export const MAX_COVER_REQUEST_BYTES =
  7 * 1024 * 1024;

const COVER_FILENAME_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/;

type CoverFormat = {
  extension:
    | "jpg"
    | "png"
    | "webp";

  contentType:
    | "image/jpeg"
    | "image/png"
    | "image/webp";
};

function mediaRoot() {
  const configured =
    process.env.MEDIA_ROOT?.trim();

  if (configured) {
    return path.resolve(
      configured,
    );
  }

  return path.join(
    process.cwd(),
    ".media",
  );
}

export function coverDirectory() {
  return path.join(
    mediaRoot(),
    "covers",
  );
}

export function isCoverFilename(
  filename: string,
) {
  return COVER_FILENAME_PATTERN.test(
    filename,
  );
}

export function coverFilePath(
  filename: string,
) {
  if (
    !isCoverFilename(
      filename,
    )
  ) {
    throw new Error(
      "Invalid cover filename",
    );
  }

  return path.join(
    coverDirectory(),
    filename,
  );
}

export function coverContentType(
  filename: string,
) {
  if (
    filename.endsWith(
      ".jpg",
    )
  ) {
    return "image/jpeg";
  }

  if (
    filename.endsWith(
      ".png",
    )
  ) {
    return "image/png";
  }

  if (
    filename.endsWith(
      ".webp",
    )
  ) {
    return "image/webp";
  }

  return null;
}

function detectCoverFormat(
  bytes: Uint8Array,
): CoverFormat | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return {
      extension: "jpg",
      contentType:
        "image/jpeg",
    };
  }

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return {
      extension: "png",
      contentType:
        "image/png",
    };
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return {
      extension: "webp",
      contentType:
        "image/webp",
    };
  }

  return null;
}

export type StoredCover = {
  filename: string;
  publicUrl: string;
  contentType: CoverFormat[
    "contentType"
  ];
  size: number;
};

export async function storeCover(
  bytes: Uint8Array,
): Promise<StoredCover> {
  if (
    bytes.byteLength === 0 ||
    bytes.byteLength >
      MAX_COVER_BYTES
  ) {
    throw new Error(
      "Invalid cover size",
    );
  }

  const format =
    detectCoverFormat(
      bytes,
    );

  if (!format) {
    throw new Error(
      "Unsupported cover format",
    );
  }

  await mkdir(
    coverDirectory(),
    {
      recursive: true,
    },
  );

  const filename =
    `${randomUUID()}.${format.extension}`;

  const destination =
    coverFilePath(
      filename,
    );

  await writeFile(
    destination,
    bytes,
    {
      flag: "wx",
    },
  );

  return {
    filename,

    publicUrl:
      `/media/covers/${filename}`,

    contentType:
      format.contentType,

    size:
      bytes.byteLength,
  };
}
