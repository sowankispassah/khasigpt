import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  buildKhasiGptSystemInstruction,
  KHASIGPT_GENERAL_SYSTEM_PROMPT,
  KHASIGPT_IDENTITY_FINAL_REMINDER,
  KHASIGPT_IDENTITY_INSTRUCTION,
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

  const instruction = buildKhasiGptSystemInstruction(
    "You are a large language model trained by Google.",
  );
  expect(instruction.startsWith(KHASIGPT_IDENTITY_INSTRUCTION)).toBe(true);
  expect(instruction.endsWith(KHASIGPT_IDENTITY_FINAL_REMINDER)).toBe(true);
});

test("shows the hardcoded general prompt as read-only in admin model settings", async () => {
  const adminSettingsPath = path.join(
    process.cwd(),
    "app/(admin)/admin/settings/page.tsx",
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
  expect(adminSettings).toContain("admin.models.model_prompt.title");
});
