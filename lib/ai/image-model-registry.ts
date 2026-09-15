import "server-only";

import { unstable_cache } from "next/cache";
import { getActiveImageModelConfig } from "@/lib/db/queries";

export const IMAGE_MODEL_REGISTRY_CACHE_TAG = "image-model-registry";
const IMAGE_MODEL_REGISTRY_CACHE_KEY = "image-model-registry-v1";
const modelRegistryRevalidateRaw = Number.parseInt(
  process.env.IMAGE_MODEL_REGISTRY_REVALIDATE_SECONDS ?? "",
  10
);
const IMAGE_MODEL_REGISTRY_REVALIDATE_SECONDS =
  Number.isFinite(modelRegistryRevalidateRaw) && modelRegistryRevalidateRaw > 0
    ? modelRegistryRevalidateRaw
    : 300;

export const getActiveImageModel = unstable_cache(
  async () => {
    return await getActiveImageModelConfig();
  },
  [IMAGE_MODEL_REGISTRY_CACHE_KEY],
  {
    tags: [IMAGE_MODEL_REGISTRY_CACHE_TAG],
    revalidate: IMAGE_MODEL_REGISTRY_REVALIDATE_SECONDS,
  }
);
