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

export const codePrompt = `
Return a single Python script that runs as-is, prints its result, uses only the standard library, and omits extra narration.
`;

export const sheetPrompt = `
Respond with CSV only: first row headers, following rows data. No prose, no code fences.
`;

export const updateDocumentPrompt = (
  currentContent: string | null,
  type: ArtifactKind
) => {
  const mediaType =
    type === "code"
      ? "code snippet"
      : type === "sheet"
        ? "spreadsheet"
        : "document";

  return `Update the following ${mediaType} according to the request. Return only the revised content.

${currentContent ?? ""}`;
};
