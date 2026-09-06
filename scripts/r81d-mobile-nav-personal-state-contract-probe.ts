import {
  readFileSync,
} from "node:fs";

function assertIncludes(
  source: string,
  expected: string,
  message: string,
) {
  if (!source.includes(expected)) {
    throw new Error(message);
  }
}

const appNav = readFileSync(
  "src/shared/components/AppNav.tsx",
  "utf8",
);

const homePage = readFileSync(
  "src/app/page.tsx",
  "utf8",
);

const comicCard = readFileSync(
  "src/modules/comics/components/ComicCard.tsx",
  "utf8",
);

assertIncludes(
  appNav,
  "usePathname",
  "navigation must expose active-route state",
);

assertIncludes(
  appNav,
  "grid-cols-3",
  "mobile navigation must use a bounded three-item grid",
);

assertIncludes(
  appNav,
  'href: "/account"',
  "navigation must expose the account/profile route",
);

assertIncludes(
  appNav,
  "aria-current",
  "active navigation item must expose aria-current",
);

assertIncludes(
  homePage,
  "libraryByComicId",
  "home must reuse the already-loaded personal library",
);

assertIncludes(
  homePage,
  "personalState={",
  "catalog cards must receive personal state when available",
);

assertIncludes(
  comicCard,
  "ComicCardPersonalState",
  "catalog card personal-state contract is missing",
);

assertIncludes(
  comicCard,
  "Мой прогресс",
  "catalog card progress affordance is missing",
);

for (const label of [
  "Хочу прочитать",
  "Читаю",
  "Прочитано",
  "Отложено",
]) {
  assertIncludes(
    comicCard,
    label,
    `catalog personal-state label missing: ${label}`,
  );
}

console.log(
  "R8_1D_MOBILE_NAV_CONTRACT=PASS",
);

console.log(
  "R8_1D_PERSONAL_CATALOG_STATE_CONTRACT=PASS",
);

console.log(
  "R8_1D_MOBILE_NAV_PERSONAL_STATE_CONTRACT_PROBE=PASS",
);
