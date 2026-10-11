import type { Geo } from "@vercel/functions";
import type { ArtifactKind } from "@/components/artifact";
import { buildKhasiGptSystemPrompt } from "@/lib/ai/identity";

export type RequestHints = {
  latitude: Geo["latitude"];
  longitude: Geo["longitude"];
  city: Geo["city"];
  country: Geo["country"];
};

export const systemPrompt = ({
  modelSystemPrompt,
}: {
  requestHints: RequestHints;
  modelSystemPrompt: string | null;
}): string => {
  return buildKhasiGptSystemPrompt(modelSystemPrompt);
};

export const buildUpdatePrompt = (
  description: string,
  currentContent: string | null,
  type: ArtifactKind
) => {
  const trimmedDescription = description.trim();
  if (!currentContent || currentContent.trim().length === 0) {
    return trimmedDescription;
  }

  const mediaType =
    type === "code"
      ? "code snippet"
      : type === "sheet"
        ? "spreadsheet"
        : "document";

  return `${trimmedDescription}

Existing ${mediaType}:
${currentContent}`;
};
