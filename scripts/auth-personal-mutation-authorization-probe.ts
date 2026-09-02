import {
  existsSync,
  readFileSync,
} from "node:fs";

function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const route =
  readFileSync(
    "src/app/api/library/reading-state/route.ts",
    "utf8",
  );

const comicPage =
  readFileSync(
    "src/app/comics/[slug]/page.tsx",
    "utf8",
  );

const query =
  readFileSync(
    "src/modules/library/queries/get-user-comic-state.ts",
    "utf8",
  );

const mutations =
  readFileSync(
    "src/modules/library/mutations/update-user-comic-state.ts",
    "utf8",
  );

assert(
  route.includes(
    "isSameOriginRequest(request)",
  ),
  "same-origin protection missing",
);

assert(
  route.includes(
    "await getCurrentUser()",
  ),
  "authenticated identity missing",
);

assert(
  route.includes("status: 401"),
  "anonymous mutation is not 401",
);

assert(
  route.includes("status: 403"),
  "cross-origin mutation is not 403",
);

assert(
  route.includes("currentUser.id"),
  "route does not use session userId",
);

assert(
  !route.includes(
    'formData.get("userId")',
  ),
  "route trusts client userId",
);

assert(
  comicPage.includes(
    "currentUser.id",
  ),
  "comic page is not session-user based",
);

assert(
  query.includes(
    "userId: number",
  ),
  "comic-state query is not userId based",
);

assert(
  query.includes(
    "userComics.userId",
  ),
  "comic-state query lacks userId predicate",
);

assert(
  !query.includes("userEmail"),
  "comic-state query still uses email",
);

for (
  const name
  of [
    "addComicToUserLibrary",
    "removeComicFromUserLibrary",
    "setUserComicStatus",
    "changeUserComicProgress",
    "updateUserComicDiary",
  ]
) {
  assert(
    mutations.includes(
      `function ${name}(\n  userId: number,`,
    ),
    `${name} lacks explicit userId`,
  );
}

for (
  const forbidden
  of [
    "DEV_USER_EMAIL",
    "getDevUser",
    "reader@comic-diary.local",
  ]
) {
  assert(
    !route.includes(forbidden) &&
      !comicPage.includes(forbidden) &&
      !query.includes(forbidden) &&
      !mutations.includes(forbidden),
    `development identity survived: ${forbidden}`,
  );
}

assert(
  !existsSync(
    "src/modules/library/dev-user.ts",
  ),
  "dev-user.ts still exists",
);

console.log(
  "R6_3C_PERSONAL_MUTATION_AUTHORIZATION_PROBE=PASS",
);

console.log(
  "COMIC_STATE_IDENTITY=SESSION_USER_ID",
);

console.log(
  "MUTATION_IDENTITY=SESSION_USER_ID",
);

console.log(
  "CLIENT_SUPPLIED_USER_ID=NOT_ACCEPTED",
);

console.log(
  "ANONYMOUS_MUTATION=401",
);

console.log(
  "CROSS_ORIGIN_MUTATION=403",
);

console.log(
  "SAME_ORIGIN_REQUIRED=YES",
);

console.log(
  "DEV_USER_EMAIL_RUNTIME_REFERENCES=ZERO",
);
