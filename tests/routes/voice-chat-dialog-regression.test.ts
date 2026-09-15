import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const repoRoot = process.cwd();

async function readWorkspaceFile(relativePath: string) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

test.describe("voice chat dialog regressions", () => {
  test("web voice chat closes quietly when an ended session has no transcript", async () => {
    const source = await readWorkspaceFile("components/multimodal-input.tsx");
    const saveStart = source.indexOf("const saveVoiceConversation");
    const finishStart = source.indexOf("const finishVoiceChat", saveStart);
    const saveBlock = source.slice(saveStart, finishStart);

    expect(saveStart).toBeGreaterThanOrEqual(0);
    expect(finishStart).toBeGreaterThan(saveStart);
    expect(saveBlock).toContain("if (pairs.length === 0)");
    expect(saveBlock).toContain("return;");
    expect(saveBlock).not.toContain("voice.chat.empty_result");
    expect(source).toContain("voiceSessionIdRef.current += 1");
    expect(source).toContain(
      "if (voiceSessionIdRef.current !== voiceSessionId)"
    );
  });

  test("web voice dialog copy is inline editable", async () => {
    const source = await readWorkspaceFile("components/multimodal-input.tsx");

    expect(source).toContain(
      "translationKey={voiceStatusTranslation.key}"
    );
    expect(source).toContain('translationKey="voice.chat.cancel"');
    expect(source).toContain('translationKey="voice.chat.retry"');
    expect(source).toContain('translationKey="voice.chat.saving"');
    expect(source).toContain('translationKey="voice.chat.end"');
  });

  test("native voice dialog guards ending and exposes editable copy", async () => {
    const source = await readWorkspaceFile(
      "native/src/screens/ChatScreen.tsx"
    );

    expect(source).toContain("const [isVoiceEnding, setIsVoiceEnding]");
    expect(source).toContain("voiceSessionIdRef.current += 1");
    expect(source).toContain(
      "if (voiceSessionIdRef.current !== voiceSessionId)"
    );
    expect(source).toContain(
      "translationKey={voiceStatusTranslation.key}"
    );
    expect(source).toContain('translationKey="voice.chat.title"');
    expect(source).toContain('translationKey="voice.chat.cancel"');
    expect(source).toContain('translationKey="voice.chat.saving"');
    expect(source).toContain('translationKey="voice.chat.end"');
  });
});
