import { config as loadEnv } from "dotenv";
import { getMessageByErrorCode } from "@/lib/errors";
import {
  JOBS_FEATURE_FLAG_KEY,
  SITE_PRELAUNCH_INVITE_ONLY_SETTING_KEY,
  SITE_PUBLIC_LAUNCHED_SETTING_KEY,
  SITE_UNDER_MAINTENANCE_SETTING_KEY,
} from "@/lib/constants";
import { generateUUID } from "@/lib/utils";
import postgres from "postgres";
import { expect, test } from "../fixtures";
import { TEST_PROMPTS } from "../prompts/routes";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

const postgresUrl = process.env.POSTGRES_URL;
if (!postgresUrl) {
  throw new Error("POSTGRES_URL is required for chat route tests");
}

const sql = postgres(postgresUrl, {
  max: 1,
});

const chatIdsCreatedByAda: string[] = [];
const createdJobIds: string[] = [];
const previousSettings = new Map<string, unknown>();
const hadSettings = new Set<string>();
const overriddenSettings = new Map<string, unknown>([
  [JOBS_FEATURE_FLAG_KEY, "enabled"],
  [SITE_PUBLIC_LAUNCHED_SETTING_KEY, true],
  [SITE_UNDER_MAINTENANCE_SETTING_KEY, false],
  [SITE_PRELAUNCH_INVITE_ONLY_SETTING_KEY, false],
]);

// Helper function to normalize stream data for comparison
function normalizeStreamData(lines: string[]): string[] {
  return lines.map((line) => {
    if (line.startsWith("data: ")) {
      try {
        const data = JSON.parse(line.slice(6)); // Remove 'data: ' prefix
        if (data.id) {
          // Replace dynamic id with a static one for comparison
          return `data: ${JSON.stringify({ ...data, id: "STATIC_ID" })}`;
        }
        return line;
      } catch {
        return line; // Return as-is if it's not valid JSON
      }
    }
    return line;
  });
}

function createUserMessage(text: string) {
  return {
    id: generateUUID(),
    role: "user" as const,
    parts: [
      {
        type: "text" as const,
        text,
      },
    ],
    createdAt: new Date().toISOString(),
  };
}

async function createJobPostingFixture(title: string) {
  const id = generateUUID();
  const sourceUrl = `manual://playwright/jobs/${id}`;
  const description = [
    `${title} recruitment notice for route testing.`,
    "Eligibility includes graduate-level knowledge and document verification.",
    "The notice includes duty details, compensation, and application guidance.",
    "Use this fixture only for validating jobs chat behavior in automated tests.",
  ].join(" ");

  await sql`
    insert into public.jobs (
      id,
      title,
      company,
      location,
      description,
      status,
      source_url,
      source,
      scraped_at,
      created_at
    ) values (
      ${id},
      ${title},
      ${"Playwright Hiring Board"},
      ${"Shillong"},
      ${description},
      ${"active"},
      ${sourceUrl},
      ${"playwright"},
      now(),
      now()
    )
  `;
  createdJobIds.push(id);

  return id;
}

async function getPersistedChat(chatId: string) {
  const rows = await sql<{ id: string; title: string; mode: string }[]>`
    select id, title, mode
    from "Chat"
    where id = ${chatId}
    limit 1
  `;

  return rows[0] ?? null;
}

test.describe
  .serial("/api/chat", () => {
    test.beforeAll(async () => {
      const existingSettingRows = await sql<{ key: string; value: unknown }[]>`
        select "key", "value"
        from "AppSetting"
        where "key" in ${sql([...overriddenSettings.keys()])}
      `;

      for (const setting of existingSettingRows) {
        hadSettings.add(setting.key);
        previousSettings.set(setting.key, setting.value);
      }

      for (const [key, value] of overriddenSettings) {
        await sql`
          insert into "AppSetting" ("key", "value", "updatedAt")
          values (
            ${key},
            ${JSON.stringify(value)}::jsonb,
            now()
          )
          on conflict ("key")
          do update set
            "value" = excluded."value",
            "updatedAt" = excluded."updatedAt"
        `;
      }

      // Middleware caches site-launch state briefly in development.
      await new Promise((resolve) => setTimeout(resolve, 1500));
    });

    test.afterAll(async () => {
      if (createdJobIds.length > 0) {
        await sql`
          delete from public.jobs
          where id in ${sql(createdJobIds)}
        `;
      }

      for (const [key, value] of overriddenSettings) {
        if (hadSettings.has(key)) {
          await sql`
            update "AppSetting"
            set
              "value" = ${JSON.stringify(previousSettings.get(key))}::jsonb,
              "updatedAt" = now()
            where "key" = ${key}
          `;
        } else {
          await sql`
            delete from "AppSetting"
            where "key" = ${key}
          `;
        }
      }

      await sql.end({ timeout: 5 });
    });

    test("Ada cannot invoke a chat generation with empty request body", async ({
      adaContext,
    }) => {
      const response = await adaContext.request.post("/api/chat", {
        data: JSON.stringify({}),
      });
      expect(response.status()).toBe(400);

      const { code, message } = await response.json();
      expect(code).toEqual("bad_request:api");
      expect(message).toEqual(getMessageByErrorCode("bad_request:api"));
    });

    test("Ada can invoke chat generation", async ({ adaContext }) => {
      const chatId = generateUUID();

      const response = await adaContext.request.post("/api/chat", {
        data: {
          id: chatId,
          message: TEST_PROMPTS.SKY.MESSAGE,
          selectedChatModel: "chat-model",
          selectedVisibilityType: "private",
        },
      });
      expect(response.status()).toBe(200);

      const text = await response.text();
      const lines = text.split("\n");

      const [_, ...rest] = lines;
      const actualNormalized = normalizeStreamData(rest.filter(Boolean));
      const expectedNormalized = normalizeStreamData(
        TEST_PROMPTS.SKY.OUTPUT_STREAM
      );

      expect(actualNormalized).toEqual(expectedNormalized);

      chatIdsCreatedByAda.push(chatId);
    });

    test("Ada creates a jobs chat with a contextual title", async ({
      adaContext,
    }) => {
      const chatId = generateUUID();
      const prompt = "Explain the eligibility rules for fisheries inspector jobs";

      const response = await adaContext.request.post("/api/chat", {
        data: {
          id: chatId,
          message: createUserMessage(prompt),
          chatMode: "jobs",
          selectedChatModel: "chat-model",
          selectedVisibilityType: "private",
        },
      });

      expect(response.status()).toBe(200);
      await response.text();

      const chat = await getPersistedChat(chatId);
      expect(chat).not.toBeNull();
      expect(chat?.mode).toBe("jobs");
      expect(chat?.title).not.toBe("Job Chat");
      expect(chat?.title.toLowerCase()).toContain("eligibility");
    });

    test("Ada creates a jobs chat with jobPostingId using the prompt for title", async ({
      adaContext,
    }) => {
      const chatId = generateUUID();
      const jobPostingId = await createJobPostingFixture(
        "River Safety Inspector"
      );
      const prompt = "Does this role allow lateral transfers after probation";

      const response = await adaContext.request.post("/api/chat", {
        data: {
          id: chatId,
          message: createUserMessage(prompt),
          chatMode: "jobs",
          jobPostingId,
          selectedChatModel: "chat-model",
          selectedVisibilityType: "private",
        },
      });

      expect(response.status()).toBe(200);
      await response.text();

      const chat = await getPersistedChat(chatId);
      expect(chat).not.toBeNull();
      expect(chat?.mode).toBe("jobs");
      expect(chat?.title).not.toBe("Job Chat");
      expect(chat?.title.toLowerCase()).toContain("lateral");
    });

    test("Ada keeps normal chat title behavior for default mode", async ({
      adaContext,
    }) => {
      const chatId = generateUUID();
      const prompt = "Need a silicon valley essay outline with startup history";

      const response = await adaContext.request.post("/api/chat", {
        data: {
          id: chatId,
          message: createUserMessage(prompt),
          selectedChatModel: "chat-model",
          selectedVisibilityType: "private",
        },
      });

      expect(response.status()).toBe(200);
      await response.text();

      const chat = await getPersistedChat(chatId);
      expect(chat).not.toBeNull();
      expect(chat?.mode).toBe("default");
      expect(chat?.title.toLowerCase()).toContain("silicon");
    });

    test("Babbage cannot append message to Ada's chat", async ({
      babbageContext,
    }) => {
      const [chatId] = chatIdsCreatedByAda;

      const response = await babbageContext.request.post("/api/chat", {
        data: {
          id: chatId,
          message: TEST_PROMPTS.GRASS.MESSAGE,
          selectedChatModel: "chat-model",
          selectedVisibilityType: "private",
        },
      });
      expect(response.status()).toBe(403);

      const { code, message } = await response.json();
      expect(code).toEqual("forbidden:chat");
      expect(message).toEqual(getMessageByErrorCode("forbidden:chat"));
    });

    test("Babbage cannot delete Ada's chat", async ({ babbageContext }) => {
      const [chatId] = chatIdsCreatedByAda;

      const response = await babbageContext.request.delete(
        `/api/chat?id=${chatId}`
      );
      expect(response.status()).toBe(403);

      const { code, message } = await response.json();
      expect(code).toEqual("forbidden:chat");
      expect(message).toEqual(getMessageByErrorCode("forbidden:chat"));
    });

    test("Ada can delete her own chat", async ({ adaContext }) => {
      const [chatId] = chatIdsCreatedByAda;

      const response = await adaContext.request.delete(
        `/api/chat?id=${chatId}`
      );
      expect(response.status()).toBe(200);

      const deletedChat = await response.json();
      expect(deletedChat).toMatchObject({ id: chatId });
    });

    test("Ada cannot resume stream of chat that does not exist", async ({
      adaContext,
    }) => {
      const response = await adaContext.request.get(
        `/api/chat/${generateUUID()}/stream`
      );
      expect(response.status()).toBe(404);
    });

    test("Ada can resume chat generation", async ({ adaContext }) => {
      const chatId = generateUUID();

      const firstRequest = adaContext.request.post("/api/chat", {
        data: {
          id: chatId,
          message: {
            id: generateUUID(),
            role: "user",
            content: "Help me write an essay about Silcon Valley",
            parts: [
              {
                type: "text",
                text: "Help me write an essay about Silicon Valley",
              },
            ],
            createdAt: new Date().toISOString(),
          },
          selectedChatModel: "chat-model",
          selectedVisibilityType: "private",
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const secondRequest = adaContext.request.get(
        `/api/chat/${chatId}/stream`
      );

      const [firstResponse, secondResponse] = await Promise.all([
        firstRequest,
        secondRequest,
      ]);

      const [firstStatusCode, secondStatusCode] = await Promise.all([
        firstResponse.status(),
        secondResponse.status(),
      ]);

      expect(firstStatusCode).toBe(200);
      expect(secondStatusCode).toBe(200);

      const [firstResponseBody, secondResponseBody] = await Promise.all([
        await firstResponse.body(),
        await secondResponse.body(),
      ]);

      expect(firstResponseBody.toString()).toEqual(
        secondResponseBody.toString()
      );
    });

    test("Ada can resume chat generation that has ended during request", async ({
      adaContext,
    }) => {
      const chatId = generateUUID();

      const firstRequest = await adaContext.request.post("/api/chat", {
        data: {
          id: chatId,
          message: {
            id: generateUUID(),
            role: "user",
            content: "Help me write an essay about Silcon Valley",
            parts: [
              {
                type: "text",
                text: "Help me write an essay about Silicon Valley",
              },
            ],
            createdAt: new Date().toISOString(),
          },
          selectedChatModel: "chat-model",
          selectedVisibilityType: "private",
        },
      });

      const secondRequest = adaContext.request.get(
        `/api/chat/${chatId}/stream`
      );

      const [firstResponse, secondResponse] = await Promise.all([
        firstRequest,
        secondRequest,
      ]);

      const [firstStatusCode, secondStatusCode] = await Promise.all([
        firstResponse.status(),
        secondResponse.status(),
      ]);

      expect(firstStatusCode).toBe(200);
      expect(secondStatusCode).toBe(200);

      const [, secondResponseContent] = await Promise.all([
        firstResponse.text(),
        secondResponse.text(),
      ]);

      expect(secondResponseContent).toContain("appendMessage");
    });

    test("Ada cannot resume chat generation that has ended", async ({
      adaContext,
    }) => {
      const chatId = generateUUID();

      const firstResponse = await adaContext.request.post("/api/chat", {
        data: {
          id: chatId,
          message: {
            id: generateUUID(),
            role: "user",
            content: "Help me write an essay about Silcon Valley",
            parts: [
              {
                type: "text",
                text: "Help me write an essay about Silicon Valley",
              },
            ],
            createdAt: new Date().toISOString(),
          },
          selectedChatModel: "chat-model",
          selectedVisibilityType: "private",
        },
      });

      const firstStatusCode = firstResponse.status();
      expect(firstStatusCode).toBe(200);

      await firstResponse.text();
      await new Promise((resolve) => setTimeout(resolve, 15 * 1000));
      await new Promise((resolve) => setTimeout(resolve, 15_000));
      const secondResponse = await adaContext.request.get(
        `/api/chat/${chatId}/stream`
      );

      const secondStatusCode = secondResponse.status();
      expect(secondStatusCode).toBe(200);

      const secondResponseContent = await secondResponse.text();
      expect(secondResponseContent).toEqual("");
    });

    test("Babbage cannot resume a private chat generation that belongs to Ada", async ({
      adaContext,
      babbageContext,
    }) => {
      const chatId = generateUUID();

      const firstRequest = adaContext.request.post("/api/chat", {
        data: {
          id: chatId,
          message: {
            id: generateUUID(),
            role: "user",
            content: "Help me write an essay about Silcon Valley",
            parts: [
              {
                type: "text",
                text: "Help me write an essay about Silicon Valley",
              },
            ],
            createdAt: new Date().toISOString(),
          },
          selectedChatModel: "chat-model",
          selectedVisibilityType: "private",
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const secondRequest = babbageContext.request.get(
        `/api/chat/${chatId}/stream`
      );

      const [firstResponse, secondResponse] = await Promise.all([
        firstRequest,
        secondRequest,
      ]);

      const [firstStatusCode, secondStatusCode] = await Promise.all([
        firstResponse.status(),
        secondResponse.status(),
      ]);

      expect(firstStatusCode).toBe(200);
      expect(secondStatusCode).toBe(403);
    });

    test("Babbage can resume a public chat generation that belongs to Ada", async ({
      adaContext,
      babbageContext,
    }) => {
      test.fixme();
      const chatId = generateUUID();

      const firstRequest = adaContext.request.post("/api/chat", {
        data: {
          id: chatId,
          message: {
            id: generateUUID(),
            role: "user",
            content: "Help me write an essay about Silicon Valley",
            parts: [
              {
                type: "text",
                text: "Help me write an essay about Silicon Valley",
              },
            ],
            createdAt: new Date().toISOString(),
          },
          selectedChatModel: "chat-model",
          selectedVisibilityType: "public",
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 10 * 1000));

      const secondRequest = babbageContext.request.get(
        `/api/chat/${chatId}/stream`
      );

      const [firstResponse, secondResponse] = await Promise.all([
        firstRequest,
        secondRequest,
      ]);

      const [firstStatusCode, secondStatusCode] = await Promise.all([
        firstResponse.status(),
        secondResponse.status(),
      ]);

      expect(firstStatusCode).toBe(200);
      expect(secondStatusCode).toBe(200);

      const [firstResponseContent, secondResponseContent] = await Promise.all([
        firstResponse.text(),
        secondResponse.text(),
      ]);

      expect(firstResponseContent).toEqual(secondResponseContent);
    });
  });
