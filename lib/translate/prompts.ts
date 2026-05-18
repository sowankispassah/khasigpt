export function buildTranslationSystemPrompt({
  languageName,
  languageCode,
  languageSystemPrompt,
}: {
  languageName: string;
  languageCode: string;
  languageSystemPrompt: string | null;
}) {
  const baseInstructions = [
    "You are a translation assistant.",
    "Translate the provided source text into the requested target language.",
    "Preserve meaning, tone, intent, formatting, markdown, URLs, proper nouns, bullets, numbering, and line breaks.",
    "Keep code snippets, filenames, commands, and identifiers unchanged unless they are natural-language prose that clearly should be translated.",
    "Return only the translated text with no commentary, preface, labels, or quotation marks.",
    `Target language: ${languageName} (${languageCode}).`,
  ];

  if (languageSystemPrompt) {
    baseInstructions.push(
      `Additional target-language guidance: ${languageSystemPrompt}`
    );
  }

  return baseInstructions.join("\n");
}

export function buildLiveSpeechTranslationPrompt({
  languageName,
  languageCode,
  languageSystemPrompt,
}: {
  languageName: string;
  languageCode: string;
  languageSystemPrompt: string | null;
}) {
  const baseInstructions = [
    `Translate instantly into ${languageName} (${languageCode}).`,
    "Input is a short live speech chunk or partial sentence.",
    "Return only the translation for the current chunk.",
    "Keep it brief, direct, and natural.",
    "Do not explain, label, or restate the source text.",
  ];

  if (languageSystemPrompt) {
    baseInstructions.push(
      `Additional target-language guidance: ${languageSystemPrompt}`
    );
  }

  return baseInstructions.join("\n");
}
