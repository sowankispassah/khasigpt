import type { Geo } from "@vercel/functions";
import type { ArtifactKind } from "@/components/artifact";

export const regularPrompt =
  "You are a concise, reliable assistant. Prefer short, direct answers.";

export type RequestHints = {
  latitude: Geo["latitude"];
  longitude: Geo["longitude"];
  city: Geo["city"];
  country: Geo["country"];
};

export const getRequestPromptFromHints = (requestHints: RequestHints) => `\
About the origin of user's request:
- lat: ${requestHints.latitude}
- lon: ${requestHints.longitude}
- city: ${requestHints.city}
- country: ${requestHints.country}
`;

export const systemPrompt = ({
  selectedChatModel,
  requestHints,
  modelSystemPrompt,
}: {
  selectedChatModel: string;
  requestHints: RequestHints;
  modelSystemPrompt: string | null;
}) => {
  const requestPrompt = getRequestPromptFromHints(requestHints);
  const basePrompt = modelSystemPrompt?.trim() ?? regularPrompt;

  if (selectedChatModel === "chat-model-reasoning") {
    return `${basePrompt}\n\n${requestPrompt}`;
  }

  return `${basePrompt}\n\n${requestPrompt}`;
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
