import type { Tool } from "@google/genai";

export const RAG_LIVE_TOOL_NAME = "search_custom_knowledge";

export const RAG_LIVE_TOOL = {
  functionDeclarations: [
    {
      name: RAG_LIVE_TOOL_NAME,
      description:
        "Search KhasiGPT's curated custom knowledge. Use this before answering questions about KhasiGPT, local Khasi or Pnar facts, policies, people, organizations, products, or other facts that may be stored by an administrator.",
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
  "When a factual question may relate to KhasiGPT custom knowledge, call search_custom_knowledge before answering. Use relevant returned knowledge, but do not invent facts when the tool reports no match.";
