import "server-only";

import { revalidatePath, revalidateTag } from "next/cache";

type AdminInvalidationPath = {
  path: string;
  type?: "layout" | "page";
};

type AdminInvalidationInput = {
  paths?: AdminInvalidationPath[];
  source: string;
  tags?: string[];
};

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter((value) => value.length > 0)));
}

export function invalidateAdminMutation({
  paths = [],
  source,
  tags = [],
}: AdminInvalidationInput) {
  const uniqueTags = uniqueValues(tags);
  const uniquePaths = Array.from(
    new Map(
      paths
        .filter((entry) => entry.path.length > 0)
        .map((entry) => [`${entry.path}:${entry.type ?? "page"}`, entry])
    ).values()
  );

  console.info("[admin/invalidation]", {
    paths: uniquePaths,
    source,
    tags: uniqueTags,
  });

  for (const tag of uniqueTags) {
    revalidateTag(tag, "max");
  }

  for (const entry of uniquePaths) {
    if (entry.type) {
      revalidatePath(entry.path, entry.type);
    } else {
      revalidatePath(entry.path);
    }
  }
}

