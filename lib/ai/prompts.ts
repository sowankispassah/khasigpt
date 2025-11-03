import type { Geo } from "@vercel/functions";
import type { ArtifactKind } from "@/components/artifact";

export type RequestHints = {
  latitude: Geo["latitude"];
  longitude: Geo["longitude"];
  city: Geo["city"];
  country: Geo["country"];
};

export const systemPrompt = ({
  selectedChatModel,
  requestHints,
  modelSystemPrompt,
}: {
  selectedChatModel: string;
  requestHints: RequestHints;
  modelSystemPrompt: string | null;
}): string | null => {
  const trimmedPrompt = modelSystemPrompt?.trim();
  return trimmedPrompt && trimmedPrompt.length > 0 ? trimmedPrompt : null;
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
