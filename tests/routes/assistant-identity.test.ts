import { expect, test } from "@playwright/test";
import {
  buildKhasiGptSystemInstruction,
  KHASIGPT_IDENTITY_FINAL_REMINDER,
  KHASIGPT_IDENTITY_INSTRUCTION,
} from "@/lib/ai/identity";

test("the product identity stays KhasiGPT across configurable prompts", () => {
  expect(KHASIGPT_IDENTITY_INSTRUCTION).toContain("You are KhasiGPT");
  expect(KHASIGPT_IDENTITY_INSTRUCTION).toContain("Shillong, Meghalaya");
  expect(KHASIGPT_IDENTITY_INSTRUCTION).toContain("Khasi language");
  expect(KHASIGPT_IDENTITY_INSTRUCTION).toContain("Do not identify the assistant as Google AI, Gemini");
  expect(KHASIGPT_IDENTITY_INSTRUCTION).toContain("trained a foundation model from scratch");

  const instruction = buildKhasiGptSystemInstruction(
    "You are a large language model trained by Google.",
  );
  expect(instruction.startsWith(KHASIGPT_IDENTITY_INSTRUCTION)).toBe(true);
  expect(instruction.endsWith(KHASIGPT_IDENTITY_FINAL_REMINDER)).toBe(true);
});
