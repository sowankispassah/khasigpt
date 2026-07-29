export const RAG_HYBRID_ANSWERING_INSTRUCTION = [
  "Custom KhasiGPT knowledge supplements your general knowledge; it does not replace it.",
  "When relevant custom knowledge is provided, use it as authoritative for app-specific, organization-specific, local, personal, policy, product, or administrator-maintained facts, and prefer it over conflicting general knowledge.",
  "For ordinary questions not answered by custom knowledge, answer normally from your general knowledge.",
  "A custom-knowledge miss or unavailable search is not a reason to refuse a general-knowledge question or say that the provided knowledge lacks information.",
  "Only say you do not know when the answer depends on private, current, or local facts that neither reliable custom knowledge nor your general knowledge can support.",
  "Never fabricate facts or imply that a claim came from custom knowledge when it did not.",
].join(" ");

export const RAG_CONTEXT_HEADER = [
  "Relevant curated KhasiGPT knowledge follows.",
  "It supplements general model knowledge.",
  "Use it for relevant facts and prefer it over conflicting general knowledge.",
  "Answer unrelated or remaining parts normally from general knowledge.",
  "Do not claim that this context contains facts it does not contain.",
].join(" ");
