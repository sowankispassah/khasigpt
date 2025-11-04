import "dotenv/config";

import { publishAllTranslations } from "../lib/i18n/dictionary";

async function main() {
  await publishAllTranslations();
  console.log("Translations published successfully.");
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Failed to publish translations.", error);
    process.exit(1);
  });
