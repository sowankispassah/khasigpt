const ACKNOWLEDGEMENT_ONLY =
  /^(?:nice|very nice|so nice|great|very good|good|awesome|amazing|perfect|beautiful|cool|excellent|lovely|wonderful|fantastic|brilliant|impressive|nice (?:one|work|job|image|picture|photo|portrait|result)|great (?:work|job|image|picture|photo|portrait|result)|good (?:work|job|image|picture|photo|portrait|result)|looks (?:nice|great|good|awesome|amazing|perfect|beautiful)|i (?:like|love) (?:it|this)|love (?:it|this)|that s exactly what i wanted|thanks|thanks a lot|thanks so much|thanks that s exactly what i wanted|thank you|thank you so much|thank you that s exactly what i wanted|khublei|khublei shibun|bha|bha shibun|sngewtynnad|sngewtynnad shibun)$/i;

const THANKS_ONLY =
  /^(?:thanks|thanks a lot|thanks so much|thanks that s exactly what i wanted|thank you|thank you so much|thank you that s exactly what i wanted|khublei|khublei shibun)$/i;

const INTERNAL_IMAGE_TOOL_SIGNAL =
  /dalle\.text2im|["']action_name["']\s*:\s*["']image_generation["']|<tool(?:_call)?[^>]*>[^<]*(?:dalle|image_generation)/i;

export const INTERNAL_TOOL_RESPONSE_FALLBACK =
  "I couldn’t complete that request. Please try again.";

function normalizeShortTurn(text: string) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isConversationalAcknowledgement(text: string) {
  const normalized = normalizeShortTurn(text);
  return normalized.length > 0 && ACKNOWLEDGEMENT_ONLY.test(normalized);
}

export function getConversationalAcknowledgementReply(text: string) {
  const normalized = normalizeShortTurn(text);
  if (!ACKNOWLEDGEMENT_ONLY.test(normalized)) {
    return null;
  }
  if (/^khublei(?: shibun)?$/i.test(normalized)) {
    return "Khublei!";
  }
  return THANKS_ONLY.test(normalized)
    ? "You’re welcome!"
    : "Glad you like it!";
}

export function isInternalImageToolPayload(text: string) {
  return INTERNAL_IMAGE_TOOL_SIGNAL.test(text.trim());
}

export function sanitizeAssistantDisplayText(
  text: string,
  replacement = INTERNAL_TOOL_RESPONSE_FALLBACK
) {
  return isInternalImageToolPayload(text) ? replacement : text;
}
