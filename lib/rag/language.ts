const KHASI_WORDS = new Set([
  "bad", "ba", "ban", "bat", "balei", "bha", "dei", "don", "ha", "hynrei",
  "ia", "jong", "ka", "kam", "kane", "ki", "khasi", "khublei", "kum",
  "kumno", "lah", "long", "ma", "na", "ne", "ngi", "phi", "pyn", "shibun",
  "u",
]);

const PNAR_WORDS = new Set([
  "chwa", "da", "em", "ham", "heh", "jowai", "ka", "ki", "mi", "moo",
  "narwan", "pnar", "toh", "u",
]);

function tokenizeLanguageSample(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}
export function detectQueryLanguage(text: string): string {
  const tokens = tokenizeLanguageSample(text);
  if (!tokens.length) {
    return "und";
  }

  const khasiScore = tokens.reduce(
    (score, token) => score + (KHASI_WORDS.has(token) ? 1 : 0),
    0,
  );
  const pnarScore = tokens.reduce(
    (score, token) => score + (PNAR_WORDS.has(token) ? 1 : 0),
    0,
  );

  if (pnarScore >= 2 && pnarScore > khasiScore) {
    return "pna";
  }
  if (khasiScore >= 2 || tokens.includes("khasi")) {
    return "kha";
  }
  return tokens.every((token) => /^[a-z0-9]+$/i.test(token)) ? "en" : "mul";
}
