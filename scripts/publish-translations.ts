import "dotenv/config";

import Module from "node:module";

function patchServerRuntimeImports() {
  const moduleWithLoad = Module as typeof Module & {
    _load?: (request: string, parent: unknown, isMain: boolean) => unknown;
  };
  const originalLoad = moduleWithLoad._load;

  if (!originalLoad) {
    return;
  }

  moduleWithLoad._load = function patchedLoad(
    request: string,
    parent: unknown,
    isMain: boolean
  ) {
    if (request === "server-only") {
      return {};
    }

    if (request === "next/cache") {
      return {
        revalidateTag: () => undefined,
        unstable_cache: (callback: unknown) => callback,
      };
    }

    return originalLoad.call(this, request, parent, isMain);
  };
}

process.env.SKIP_TRANSLATION_CACHE ??= "1";

async function main() {
  patchServerRuntimeImports();
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
