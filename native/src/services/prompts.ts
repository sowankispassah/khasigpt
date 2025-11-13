import { http } from "@/services/http";

export type SuggestedPromptsResponse = {
  prompts: string[];
};

export async function fetchSuggestedPrompts() {
  return http<SuggestedPromptsResponse>("/api/prompts");
}
