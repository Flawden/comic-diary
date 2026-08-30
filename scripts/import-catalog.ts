import "dotenv/config";

import { importCatalog } from "../src/catalog/import-catalog";

importCatalog()
  .then((result) => {
    console.log(
      "Catalog import completed.",
    );
    console.log(
      `Categories: ${result.categories}`,
    );
    console.log(
      `Comics: ${result.comics}`,
    );
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
