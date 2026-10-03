import type { WebSearchSource } from "./types";

const MAX_NEWS_STORIES = 16;
const MAX_NEWS_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type NewsRecord = Record<string, unknown>;

export type DatedNewsStory = {
  title: string;
  url: string;
  source: string;
  snippet: string;
  details?: string;
  publishedAt: Date;
};

function text(value: unknown, limit: number) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, limit)
    : "";
}

function publicUrl(value: unknown) {
  try {
    const url = new URL(text(value, 2048));
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function parseNewsPublicationDate(value: unknown, now = new Date()) {
  const label = text(value, 80).toLowerCase();
  if (!label) return null;

  let timestamp: number | null = null;
  if (label === "just now" || label === "today") {
    timestamp = now.getTime();
  } else if (label === "yesterday") {
    timestamp = now.getTime() - 24 * 60 * 60 * 1000;
  } else {
    const relative = label.match(
      /^(\d+)\s+(minutes?|hours?|days?|weeks?)\s+ago$/i
    );
    if (relative) {
      const amount = Number(relative[1]);
      const unit = relative[2].toLowerCase();
      const unitMs = unit.startsWith("minute")
        ? 60_000
        : unit.startsWith("hour")
          ? 3_600_000
          : unit.startsWith("day")
            ? 86_400_000
            : 604_800_000;
      timestamp = now.getTime() - amount * unitMs;
    } else {
      const absolute = Date.parse(label);
      timestamp = Number.isNaN(absolute) ? null : absolute;
    }
  }

  if (
    timestamp === null ||
    timestamp > now.getTime() + 60 * 60 * 1000 ||
    timestamp < now.getTime() - MAX_NEWS_AGE_MS
  ) {
    return null;
  }
  return new Date(timestamp);
}

export function parseSerperNewsResults(response: unknown, now = new Date()) {
  const root = response && typeof response === "object"
    ? response as NewsRecord
    : {};
  const records = Array.isArray(root.news) ? root.news : [];
  const stories: DatedNewsStory[] = [];
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();

  for (const raw of records) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const record = raw as NewsRecord;
    const title = text(record.title, 240);
    const url = publicUrl(record.link);
    const publishedAt = parseNewsPublicationDate(record.date, now);
    if (!title || !url || !publishedAt) continue;
    const titleKey = title.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (seenUrls.has(url) || seenTitles.has(titleKey)) continue;
    seenUrls.add(url);
    seenTitles.add(titleKey);
    stories.push({
      title,
      url,
      source: text(record.source, 120) || new URL(url).hostname,
      snippet: text(record.snippet, 900),
      publishedAt,
    });
  }

  stories.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  return stories.slice(0, MAX_NEWS_STORIES);
}

export function buildSerperNewsGrounding(stories: DatedNewsStory[]) {
  const dateFormatter = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeZone: "Asia/Kolkata",
  });
  const sources: WebSearchSource[] = stories.map((story) => ({
    title: story.title,
    url: story.url,
    domain: new URL(story.url).hostname.replace(/^www\./i, ""),
  }));
  const answer = stories.length > 0
    ? [
        "Recent dated article results, newest first. Treat headlines and snippets as limited evidence; do not add details they do not support.",
        ...stories.map((story, index) => [
          `[${index + 1}] ${story.title}`,
          `Published: ${dateFormatter.format(story.publishedAt)} (Asia/Kolkata); Source: ${story.source}`,
          story.snippet ? `Summary from search result: ${story.snippet}` : "",
          story.details ? `Article excerpt: ${story.details}` : "",
          `URL: ${story.url}`,
        ].filter(Boolean).join("\n")),
      ].join("\n\n")
    : "No dated news articles from the last seven days were returned. Do not invent current headlines or use undated pages as recent news.";
  return { answer, sources };
}
