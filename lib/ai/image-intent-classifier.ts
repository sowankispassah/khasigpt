import "server-only";

import { classifyToolIntent } from "@/lib/ai/tool-intent-classifier";
import type {
  ImageIntent,
  ImageIntentInput,
} from "@/lib/image-intent";

export async function classifyImageIntent(
  input: ImageIntentInput
): Promise<ImageIntent> {
  return (await classifyToolIntent(input)).intent;
}
