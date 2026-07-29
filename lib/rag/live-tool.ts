import type { Tool } from "@google/genai";
import { RAG_HYBRID_ANSWERING_INSTRUCTION } from "@/lib/rag/answering";

export const RAG_LIVE_TOOL_NAME = "search_custom_knowledge";

export const RAG_LIVE_TOOL = {
  functionDeclarations: [
    {
      name: RAG_LIVE_TOOL_NAME,
      description:
        "Search KhasiGPT's curated custom knowledge for relevant supplemental facts. A no-match result means continue with normal general knowledge when the question can be answered without private or administrator-maintained facts.",
      parameters: {
        type: "OBJECT",
        properties: {
          query: {
            type: "STRING",
            description:
              "The user's factual question, preserving important Khasi, Pnar, or English wording.",
          },
        },
        required: ["query"],
      },
    },
  ],
} as unknown as Tool;

export const RAG_LIVE_SYSTEM_INSTRUCTION =
  [
    "When a factual question may relate to KhasiGPT custom knowledge, call search_custom_knowledge before answering.",
    RAG_HYBRID_ANSWERING_INSTRUCTION,
    "If the tool returns answerMode general_knowledge, answer the question normally from general knowledge when possible.",
    "Do not mention the search, tool, RAG, or provided knowledge unless the user explicitly asks about it.",
  ].join(" ");
