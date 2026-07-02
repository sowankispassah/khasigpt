import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const repoRoot = process.cwd();

async function readWorkspaceFile(relativePath: string) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

test.describe("native live voice resilience guardrails", () => {
  test("completed Gemini voice turns are saved before the voice modal is closed", async () => {
    const source = await readWorkspaceFile("native/src/screens/ChatScreen.tsx");

    expect(source).toContain("savedVoicePairKeysRef");
    expect(source).toContain("savingVoicePairKeysRef");
    expect(source).toContain("queueVoiceConversationSave");
    expect(source).toContain("upsertChatHistoryItem");
    expect(source).toContain("upsertLocalHistoryItem(savedHistoryItem)");
    expect(source).toContain("onCompletedTurn: (turn) =>");
    expect(source).toContain("const targetChatId = currentChatIdRef.current;");
    expect(source).toContain("queueVoiceConversationSave(turn.messages, targetChatId");
  });

  test("Gemini live turn completion emits a persisted turn snapshot", async () => {
    const source = await readWorkspaceFile("native/src/lib/gemini-live-voice.ts");
    const turnCompleteStart = source.indexOf("if (serverContent.turnComplete)");
    const stoppedInputStart = source.indexOf("if (hasStoppedInput)", turnCompleteStart);

    expect(turnCompleteStart).toBeGreaterThanOrEqual(0);
    expect(stoppedInputStart).toBeGreaterThan(turnCompleteStart);

    const turnCompleteBlock = source.slice(turnCompleteStart, stoppedInputStart);
    expect(source).toContain("onCompletedTurn?:");
    expect(turnCompleteBlock).toContain("onCompletedTurn?.({");
    expect(turnCompleteBlock).toContain(
      "messages: messages.map((message) => ({ ...message }))"
    );
  });

  test("mobile voice transcript persistence is not rolled back by usage accounting", async () => {
    const source = await readWorkspaceFile(
      "app/api/mobile/chat/voice-turn/route.ts"
    );
    const usageStart = source.indexOf("let usageRecorded = true;");
    const responseStart = source.indexOf("return Response.json", usageStart);

    expect(usageStart).toBeGreaterThanOrEqual(0);
    expect(responseStart).toBeGreaterThan(usageStart);

    const usageBlock = source.slice(usageStart, responseStart);
    expect(usageBlock).toContain("recordTokenUsage");
    expect(usageBlock).toContain("usageRecorded = false");
    expect(usageBlock).toContain("usageError =");
    expect(usageBlock).not.toContain("return voicePersistenceUnavailable");
    expect(usageBlock).not.toContain("return Response.json");
    expect(source).toContain("chat: {");
    expect(source).toContain("usageRecorded,");
  });

  test("Android playback ignores late Gemini audio writes after cleanup", async () => {
    const source = await readWorkspaceFile(
      "native/android/app/src/main/java/com/khasigpt/mobile/GeminiVoiceAudioModule.kt"
    );
    const playChunkStart = source.indexOf("fun playPcmChunk");
    const stopPlaybackStart = source.indexOf("fun stopPlayback", playChunkStart);

    expect(playChunkStart).toBeGreaterThanOrEqual(0);
    expect(stopPlaybackStart).toBeGreaterThan(playChunkStart);

    const playChunkBlock = source.slice(playChunkStart, stopPlaybackStart);
    expect(source).toContain("private val playbackLock");
    expect(source).toContain("private var playbackSessionId");
    expect(source).toContain("import java.util.concurrent.RejectedExecutionException");
    expect(playChunkBlock).toContain("synchronized(playbackLock)");
    expect(playChunkBlock).toContain("playbackSessionId == sessionId");
    expect(playChunkBlock).toContain("catch (_: Exception)");
    expect(playChunkBlock).toContain("RejectedExecutionException");
    expect(source).toContain("executor?.shutdownNow()");
  });
});
