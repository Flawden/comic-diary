import {
  normalizeOwnDisplayNameInput,
} from "../src/modules/auth/display-name";

function assert(
  condition: boolean,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(
      message,
    );
  }
}

const trimmed =
  normalizeOwnDisplayNameInput(
    "  Даниил  ",
  );

assert(
  trimmed.ok &&
    trimmed.displayName ===
      "Даниил",
  "display name must trim surrounding whitespace",
);

const cleared =
  normalizeOwnDisplayNameInput(
    "   ",
  );

assert(
  cleared.ok &&
    cleared.displayName ===
      null,
  "whitespace-only display name must clear the optional field",
);

const controlCharacter =
  normalizeOwnDisplayNameInput(
    "Имя\nДва",
  );

assert(
  !controlCharacter.ok &&
    controlCharacter.kind ===
      "invalid_display_name",
  "control characters must be rejected",
);

const maxAscii =
  normalizeOwnDisplayNameInput(
    "A".repeat(
      120,
    ),
  );

assert(
  maxAscii.ok,
  "120-character display name must be accepted",
);

const tooLongAscii =
  normalizeOwnDisplayNameInput(
    "A".repeat(
      121,
    ),
  );

assert(
  !tooLongAscii.ok,
  "121-character display name must be rejected",
);

const maxEmoji =
  normalizeOwnDisplayNameInput(
    "😀".repeat(
      120,
    ),
  );

assert(
  maxEmoji.ok,
  "length limit must count Unicode code points rather than UTF-16 units",
);

console.log(
  "R8_1A_DISPLAY_NAME_NORMALIZATION=PASS",
);

console.log(
  "R8_1A_ACCOUNT_PROFILE_CONTRACT_PROBE=PASS",
);
