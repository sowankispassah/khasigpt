import "server-only";

import { load } from "cheerio";
import type { DatedNewsStory } from "./news-results";
import { fetchPublicResource } from "./public-fetch";

const MAX_ARTICLE_FETCHES = 10;
const ARTICLE_TIMEOUT_MS = 3500;
const ARTICLE_MAX_BYTES = 1_000_000;
const MAX_EXCERPT_CHARS = 1800;

async function fetchArticleExcerpt(url: string) {
  try {
    const result = await fetchPublicResource({
      acceptedContentTypes: ["text/html", "application/xhtml+xml"],
      maxBytes: ARTICLE_MAX_BYTES,
      timeoutMs: ARTICLE_TIMEOUT_MS,
      url,
    });
    if (!result) return null;

    const $ = load(new TextDecoder().decode(result.body));
    $("script, style, nav, footer, aside, form, .advertisement, .related-posts").remove();
    const paragraphs = $("article p")
      .toArray()
      .map((element) => $(element).text().replace(/\s+/g, " ").trim())
      .filter((paragraph) => paragraph.length >= 45);
    if (paragraphs.length < 2) return null;
    return paragraphs.join(" ").slice(0, MAX_EXCERPT_CHARS);
  } catch {
    return null;
  }
}

export async function enrichNewsStories(stories: DatedNewsStory[]) {
  const enriched = await Promise.all(
    stories.slice(0, MAX_ARTICLE_FETCHES).map(async (story) => ({
      ...story,
      details: await fetchArticleExcerpt(story.url),
    }))
  );
  return [
    ...enriched.map(({ details, ...story }) => ({
      ...story,
      ...(details ? { details } : {}),
    })),
    ...stories.slice(MAX_ARTICLE_FETCHES),
  ];
}
