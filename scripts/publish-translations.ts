import "dotenv/config";

process.env.SKIP_TRANSLATION_CACHE ??= "1";

async function main() {
  const { publishAllTranslations } = await import("../lib/i18n/dictionary");
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
