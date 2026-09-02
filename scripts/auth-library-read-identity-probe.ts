import {
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

const home =
  readFileSync(
    "src/app/page.tsx",
    "utf8",
  );

const library =
  readFileSync(
    "src/app/library/page.tsx",
    "utf8",
  );

const query =
  readFileSync(
    "src/modules/library/queries/get-user-library.ts",
    "utf8",
  );

const comicPage =
  readFileSync(
    "src/app/comics/[slug]/page.tsx",
    "utf8",
  );

const mutations =
  readFileSync(
    "src/modules/library/mutations/update-user-comic-state.ts",
    "utf8",
  );

assert(
  query.includes(
    "userId: number",
  ),
  "getUserLibrary is not user-id based",
);

assert(
  !query.includes(
    "userEmail",
  ),
  "getUserLibrary still accepts email identity",
);

assert(
  query.includes(
    "userComics.userId",
  ),
  "getUserLibrary does not filter by user id",
);

assert(
  home.includes(
    "getCurrentUser",
  ),
  "Home does not resolve current user",
);

assert(
  !home.includes(
    "DEV_USER_EMAIL",
  ),
  "Home still depends on DEV_USER_EMAIL",
);

assert(
  home.includes(
    "currentUser.id",
  ),
  "Home does not use current user id",
);

assert(
  library.includes(
    "getCurrentUser",
  ),
  "Library does not resolve current user",
);

assert(
  library.includes(
    '"/login?next=/library"',
  ),
  "Anonymous library redirect missing",
);

assert(
  library.includes(
    "currentUser.id",
  ),
  "Library does not use current user id",
);

assert(
  !library.includes(
    "DEV_USER_EMAIL",
  ),
  "Library still depends on DEV_USER_EMAIL",
);

/*
 * Intentional R6.3B boundary:
 *
 * comic detail and mutation service stay together
 * on their old identity contract until R6.3C.
 */
assert(
  comicPage.includes(
    "DEV_USER_EMAIL",
  ),
  "Comic detail migrated prematurely",
);

assert(
  mutations.includes(
    "DEV_USER_EMAIL",
  ),
  "Mutation service migrated prematurely",
);

console.log(
  "R6_3B_LIBRARY_READ_IDENTITY_PROBE=PASS",
);

console.log(
  "GET_USER_LIBRARY_IDENTITY=USER_ID",
);

console.log(
  "HOME_PERSONAL_STATE=CURRENT_SESSION_USER",
);

console.log(
  "ANONYMOUS_HOME=PUBLIC_WITH_EMPTY_PERSONAL_STATE",
);

console.log(
  "LIBRARY_IDENTITY=CURRENT_SESSION_USER",
);

console.log(
  "ANONYMOUS_LIBRARY=LOGIN_REDIRECT",
);

console.log(
  "EMAIL_IDENTITY_QUERY=REMOVED",
);

console.log(
  "COMIC_DETAIL_IDENTITY=DEFERRED_TO_R6_3C",
);

console.log(
  "MUTATION_IDENTITY=DEFERRED_TO_R6_3C",
);
