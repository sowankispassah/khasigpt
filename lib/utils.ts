import type {
  CoreAssistantMessage,
  CoreToolMessage,
  UIMessage,
  UIMessagePart,
} from 'ai';
import { type ClassValue, clsx } from 'clsx';
import { formatISO } from 'date-fns';
import { twMerge } from 'tailwind-merge';
import type { DBMessage, Document } from '@/lib/db/schema';
import { ChatSDKError, type ErrorCode } from './errors';
import type { ChatMessage, ChatTools, CustomUIDataTypes } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function extractErrorPayload(body: any): { code: ErrorCode; details?: string } {
  if (body && typeof body === "object") {
    const code =
      typeof body.code === "string" ? (body.code as ErrorCode) : "bad_request:api";
    const details =
      typeof body.details === "string"
        ? body.details
        : typeof body.cause === "string"
          ? body.cause
          : undefined;

    return { code, details };
  }

  return { code: "bad_request:api" as ErrorCode };
}

export const fetcher = async (url: string) => {
  const response = await fetch(url);

  if (!response.ok) {
    let body: any = null;
    try {
      body = await response.json();
    } catch {
      // ignore
    }
    const { code, details } = extractErrorPayload(body);
    throw new ChatSDKError(code, details);
  }

  return response.json();
};

export async function fetchWithErrorHandlers(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  try {
    const response = await fetch(input, init);

    if (!response.ok) {
      let body: any = null;
      try {
        body = await response.json();
      } catch {
        // ignore
      }
      const { code, details } = extractErrorPayload(body);
      throw new ChatSDKError(code, details);
    }

    return response;
  } catch (error: unknown) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new ChatSDKError('offline:chat');
    }

    throw error;
  }
}

export function getLocalStorage(key: string) {
  if (typeof window !== 'undefined') {
    return JSON.parse(localStorage.getItem(key) || '[]');
  }
  return [];
}

export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

type ResponseMessageWithoutId = CoreToolMessage | CoreAssistantMessage;
type ResponseMessage = ResponseMessageWithoutId & { id: string };

export function getMostRecentUserMessage(messages: UIMessage[]) {
  const userMessages = messages.filter((message) => message.role === 'user');
  return userMessages.at(-1);
}

export function getDocumentTimestampByIndex(
  documents: Document[],
  index: number,
) {
  if (!documents) { return new Date(); }
  if (index > documents.length) { return new Date(); }

  return documents[index].createdAt;
}

export function getTrailingMessageId({
  messages,
}: {
  messages: ResponseMessage[];
}): string | null {
  const trailingMessage = messages.at(-1);

  if (!trailingMessage) { return null; }

  return trailingMessage.id;
}

function decodeHtmlEntities(value: string) {
  const decodeOnce = (input: string) => {
    let decoded = input;

    decoded = decoded
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/gi, "'");

    decoded = decoded.replace(/&#(\d+);/g, (match, code) => {
      const parsed = Number(code);
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 0x10ffff) {
        return match;
      }
      try {
        return String.fromCodePoint(parsed);
      } catch {
        return match;
      }
    });

    decoded = decoded.replace(/&#x([0-9a-f]+);/gi, (match, hex) => {
      const parsed = Number.parseInt(hex, 16);
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 0x10ffff) {
        return match;
      }
      try {
        return String.fromCodePoint(parsed);
      } catch {
        return match;
      }
    });

    return decoded;
  };

  let current = value;
  for (let i = 0; i < 2; i += 1) {
    const next = decodeOnce(current);
    if (next === current) {
      break;
    }
    current = next;
  }

  return current;
}

export function sanitizeText(text: string) {
  const withoutMarkers = text.replaceAll("<has_function_call>", "");
  // React already escapes string children; keep content readable and decode
  // any legacy HTML entity encoding (e.g. &amp;#39;, &amp;lt;).
  return decodeHtmlEntities(withoutMarkers);
}

export function convertToUIMessages(messages: DBMessage[]): ChatMessage[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role as 'user' | 'assistant' | 'system',
    parts: message.parts as UIMessagePart<CustomUIDataTypes, ChatTools>[],
    metadata: {
      createdAt: formatISO(message.createdAt),
    },
  }));
}

export function getTextFromMessage(message: ChatMessage): string {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('');
}
