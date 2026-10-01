import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  buildKhasiGptSystemInstruction,
  buildKhasiGptSystemPrompt,
  KHASIGPT_GENERAL_SYSTEM_PROMPT,
  KHASIGPT_IDENTITY_FINAL_REMINDER,
  KHASIGPT_IDENTITY_INSTRUCTION,
  KHASIGPT_RESPONSE_LANGUAGE_INSTRUCTION,
} from "@/lib/ai/identity";

test("the product identity stays KhasiGPT across configurable prompts", () => {
  expect(KHASIGPT_IDENTITY_INSTRUCTION).toContain("You are KhasiGPT");
  expect(KHASIGPT_IDENTITY_INSTRUCTION).toContain("Shillong, Meghalaya");
  expect(KHASIGPT_IDENTITY_INSTRUCTION).toContain("Khasi language");
  expect(KHASIGPT_IDENTITY_INSTRUCTION).toContain("Do not identify the assistant as Google AI, Gemini");
  expect(KHASIGPT_IDENTITY_INSTRUCTION).toContain("trained a foundation model from scratch");
  expect(KHASIGPT_IDENTITY_FINAL_REMINDER).toContain(
    "Return only information the user explicitly requested",
  );
  expect(KHASIGPT_IDENTITY_FINAL_REMINDER).toContain(
    "This rule applies regardless of source",
  );
  expect(KHASIGPT_IDENTITY_FINAL_REMINDER).toContain(
    "Do not infer or answer additional questions",
  );
  expect(KHASIGPT_IDENTITY_INSTRUCTION).toContain(
    "Do not introduce, identify, describe, or promote KhasiGPT",
  );
  expect(KHASIGPT_IDENTITY_FINAL_REMINDER).toContain(
    "Never begin with a self-introduction",
  );
  expect(KHASIGPT_IDENTITY_FINAL_REMINDER).toContain(
    "Nga long ka KhasiGPT",
  );

  const instruction = buildKhasiGptSystemInstruction(
    "You are a large language model trained by Google.",
  );
  expect(instruction.startsWith(KHASIGPT_IDENTITY_INSTRUCTION)).toBe(true);
  expect(instruction.endsWith(KHASIGPT_IDENTITY_FINAL_REMINDER)).toBe(true);
});

test("reply-language priority survives model-specific and selected-language prompts", () => {
  const custom = "Always answer in English, regardless of the user's language.";
  const base = buildKhasiGptSystemPrompt(custom);
  expect(base.indexOf(KHASIGPT_RESPONSE_LANGUAGE_INSTRUCTION)).toBeGreaterThan(base.indexOf(custom));
  const full = buildKhasiGptSystemInstruction(custom);
  expect(full.endsWith(KHASIGPT_RESPONSE_LANGUAGE_INSTRUCTION)).toBe(true);
  expect(KHASIGPT_GENERAL_SYSTEM_PROMPT.endsWith(KHASIGPT_RESPONSE_LANGUAGE_INSTRUCTION)).toBe(true);
});

test("every jobs response path applies the same language policy after selected-language instructions", async () => {
  const route = await readFile(path.join(process.cwd(), "app/(chat)/api/chat/route.ts"), "utf8");
  for (const name of ["metaConversationSystemPrompt", "listingSummarySystemPrompt", "followUpSystemPrompt"]) {
    const start = route.indexOf(`const ${name} = [`);
    const end = route.indexOf('].join("\\n")', start);
    const prompt = route.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(prompt.indexOf("KHASIGPT_RESPONSE_LANGUAGE_INSTRUCTION")).toBeGreaterThan(prompt.indexOf('selectedLanguageSystemPrompt ?? ""'));
    expect(prompt).not.toContain("Always answer in the user's selected language");
  }
});

test("shows the hardcoded general prompt as read-only alongside model pricing", async () => {
  const adminSettingsPath = path.join(
    process.cwd(),
    "app/(admin)/admin/pricing/page.tsx",
  );
  const adminSettings = await readFile(adminSettingsPath, "utf8");

  expect(KHASIGPT_GENERAL_SYSTEM_PROMPT).toContain(
    KHASIGPT_IDENTITY_INSTRUCTION,
  );
  expect(KHASIGPT_GENERAL_SYSTEM_PROMPT).toContain(
    KHASIGPT_IDENTITY_FINAL_REMINDER,
  );
  expect(adminSettings).toContain("KHASIGPT_GENERAL_SYSTEM_PROMPT");
  expect(adminSettings).toContain('id="general-system-prompt"');
  expect(adminSettings).toContain("readOnly");
  expect(adminSettings).toContain("admin.models.general_prompt.title");
  const modelForm = await readFile(path.join(process.cwd(), "app/(admin)/admin/pricing/model-configuration-forms.tsx"), "utf8");
  expect(modelForm).toContain("admin.models.model_prompt.title");
});
