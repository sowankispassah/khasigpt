import { load } from "cheerio";

const SOURCE_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const MIN_DETAIL_MARKDOWN_LENGTH = 160;
const MAX_JSON_LD_DEPTH = 5;

const GENERIC_DETAIL_SELECTORS = [
  "main",
  "article",
  ".job-description",
  "[class*='job-description']",
  ".job-details",
  "[class*='job-details']",
  ".description",
  "[class*='description']",
  ".entry-content",
  ".node-content",
  ".field-item",
  ".content",
  ".post-content",
] as const;

const LINKEDIN_DETAIL_SELECTORS = [
  ".show-more-less-html__markup",
  ".description__text",
  ".decorated-job-posting__details",
  ".description",
  "article",
] as const;

function normalizeMultilineText(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeInlineText(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
}

function markdownTextLength(value: string) {
  return value
    .replace(/[#>*`_[\]()~|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

function joinInlineSegments(segments: string[]) {
  let output = "";
  for (const segment of segments) {
    if (!segment) {
      continue;
    }
    const needsSpace =
      output.length > 0 && !/[\s([{]$/.test(output) && !/^[\s)\].,;:!?]/.test(segment);
    output += needsSpace ? ` ${segment}` : segment;
  }
  return output;
}

function renderInlineMarkdown($: ReturnType<typeof load>, node: unknown): string {
  const current = node as { type?: string; name?: string; data?: string };
  const type = current.type ?? "";
  if (type === "text") {
    return normalizeInlineText(current.data ?? "");
  }
  if (type !== "tag") {
    return "";
  }

  const element = $(node as never);
  const tag = (current.name ?? "").toLowerCase();
  const children = element.contents().toArray().map((child) => renderInlineMarkdown($, child));
  const inner = joinInlineSegments(children).trim();

  if (tag === "br") {
    return "\n";
  }
  if (tag === "strong" || tag === "b") {
    return inner ? `**${inner}**` : "";
  }
  if (tag === "em" || tag === "i") {
    return inner ? `*${inner}*` : "";
  }
  if (tag === "a") {
    const href = element.attr("href")?.trim() ?? "";
    const label = inner || normalizeInlineText(element.text());
    if (!label) {
      return href;
    }
    return href ? `[${label}](${href})` : label;
  }

  return inner;
}

function renderListMarkdown($: ReturnType<typeof load>, root: unknown, ordered: boolean) {
  const items = $(root as never)
    .children("li")
    .toArray()
    .map((item) => {
      const content = joinInlineSegments(
        $(item)
          .contents()
          .toArray()
          .map((child) => renderInlineMarkdown($, child))
      ).trim();
      return content;
    })
    .filter(Boolean);

  if (items.length === 0) {
    return "";
  }

  return items
    .map((item, index) => (ordered ? `${index + 1}. ${item}` : `- ${item}`))
    .join("\n");
}

function renderBlockMarkdown($: ReturnType<typeof load>, node: unknown): string {
  const current = node as { type?: string; name?: string };
  const type = current.type ?? "";
  if (type === "text") {
    return normalizeInlineText((node as { data?: string }).data ?? "");
  }
  if (type !== "tag") {
    return "";
  }

  const element = $(node as never);
  const tag = (current.name ?? "").toLowerCase();

  if (tag === "ul") {
    return renderListMarkdown($, node, false);
  }
  if (tag === "ol") {
    return renderListMarkdown($, node, true);
  }

  const inline = joinInlineSegments(
    element
      .contents()
      .toArray()
      .map((child) => renderInlineMarkdown($, child))
  ).trim();

  if (!inline) {
    return "";
  }

  if (/^h[1-6]$/.test(tag)) {
    const level = Number.parseInt(tag.slice(1), 10);
    const prefix = "#".repeat(Math.max(1, Math.min(6, Number.isFinite(level) ? level : 2)));
    return `${prefix} ${inline}`;
  }

  if (tag === "blockquote") {
    return inline
      .split(/\n+/)
      .map((line) => `> ${line}`)
      .join("\n");
  }

  return inline;
}

function htmlToMarkdown(html: string) {
  const wrapped = `<div data-source-markdown-root>${html}</div>`;
  const $ = load(wrapped);
  const root = $("[data-source-markdown-root]").first();
  if (root.length === 0) {
    return "";
  }

  const blocks = root
    .contents()
    .toArray()
    .map((node) => renderBlockMarkdown($, node))
    .map((block) => normalizeMultilineText(block))
    .filter(Boolean);

  return normalizeMultilineText(blocks.join("\n\n"));
}

function toStringArray(value: unknown, depth = 0): string[] {
  if (depth > MAX_JSON_LD_DEPTH || value === null || value === undefined) {
    return [];
  }
  if (typeof value === "string") {
    const normalized = normalizeMultilineText(htmlToMarkdown(value));
    return normalized ? [normalized] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => toStringArray(entry, depth + 1));
  }
  if (typeof value !== "object") {
    return [];
  }

  const record = value as Record<string, unknown>;
  const preferredKeys = [
    "description",
    "summary",
    "responsibilities",
    "qualifications",
    "skillsDescription",
    "experienceRequirements",
    "educationRequirements",
    "jobBenefits",
  ];

  const collected: string[] = [];
  for (const key of preferredKeys) {
    if (key in record) {
      collected.push(...toStringArray(record[key], depth + 1));
    }
  }

  if (collected.length > 0) {
    return collected;
  }

  return Object.values(record).flatMap((entry) => toStringArray(entry, depth + 1));
}

function extractJsonLdMarkdown($: ReturnType<typeof load>) {
  const values: string[] = [];
  $("script[type='application/ld+json']").each((_, node) => {
    let raw = "";
    try {
      raw = $(node).text().trim();
    } catch {
      raw = "";
    }
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const candidate of candidates) {
        values.push(...toStringArray(candidate));
      }
    } catch {
      // noop
    }
  });

  const unique = Array.from(new Set(values.map((value) => normalizeMultilineText(value))))
    .filter(Boolean)
    .slice(0, 8);
  return normalizeMultilineText(unique.join("\n\n"));
}

function extractMarkdownBySelectors({
  $,
  selectors,
}: {
  $: ReturnType<typeof load>;
  selectors: readonly string[];
}) {
  let best = "";
  let bestLength = 0;
  for (const selector of selectors) {
    const element = $(selector).first();
    if (element.length === 0) {
      continue;
    }
    const markdown = htmlToMarkdown(element.html() ?? "");
    const length = markdownTextLength(markdown);
    if (length > bestLength) {
      best = markdown;
      bestLength = length;
    }
  }
  return best;
}

function chooseBestMarkdown(candidates: string[]) {
  let best = "";
  let bestLength = 0;
  for (const candidate of candidates) {
    const normalized = normalizeMultilineText(candidate);
    const length = markdownTextLength(normalized);
    if (length > bestLength) {
      best = normalized;
      bestLength = length;
    }
  }

  if (bestLength >= MIN_DETAIL_MARKDOWN_LENGTH) {
    return best;
  }
  return bestLength > 0 ? best : "";
}

function extractBestMarkdownFromHtml(html: string, selectors: readonly string[]) {
  const raw = load(html);
  const jsonLdMarkdown = extractJsonLdMarkdown(raw);

  const $ = load(html);
  $("script, style, noscript, svg, nav, footer, header, form, button").remove();
  const selectorMarkdown = extractMarkdownBySelectors({ $, selectors });
  const bodyMarkdown = htmlToMarkdown($("body").html() ?? "");

  return chooseBestMarkdown([selectorMarkdown, jsonLdMarkdown, bodyMarkdown]);
}

export function isLinkedInUrl(url: string | null) {
  if (!url) {
    return false;
  }
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === "linkedin.com" || hostname.endsWith(".linkedin.com");
  } catch {
    return false;
  }
}

export function isPdfUrl(url: string | null) {
  if (!url) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return parsed.pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return false;
  }
}

export function extractLinkedInJobId(url: string) {
  try {
    const parsed = new URL(url);
    const queryId = parsed.searchParams.get("currentJobId")?.trim() ?? "";
    if (/^\d+$/.test(queryId)) {
      return queryId;
    }

    const pathname = parsed.pathname;
    const match = pathname.match(/\/jobs\/view\/(?:[^/?#]*-)?(\d+)(?:\/|$)/i);
    if (match?.[1]) {
      return match[1];
    }
  } catch {
    // noop
  }
  return null;
}

export function extractLinkedInDetailMarkdownFromHtml(html: string) {
  return extractBestMarkdownFromHtml(html, LINKEDIN_DETAIL_SELECTORS);
}

export function extractGenericDetailMarkdownFromHtml(html: string) {
  return extractBestMarkdownFromHtml(html, GENERIC_DETAIL_SELECTORS);
}

export function extractSourceDetailMarkdownFromHtml({
  html,
  sourceUrl,
}: {
  html: string;
  sourceUrl: string;
}) {
  if (isLinkedInUrl(sourceUrl)) {
    return extractLinkedInDetailMarkdownFromHtml(html);
  }
  return extractGenericDetailMarkdownFromHtml(html);
}

async function fetchHtml(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId =
    timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": SOURCE_USER_AGENT,
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (!response.ok) {
      return null;
    }
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("text/html")) {
      return null;
    }
    return await response.text();
  } catch {
    return null;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export async function fetchLinkedInDetailMarkdown(
  sourceUrl: string,
  { timeoutMs = 30_000 }: { timeoutMs?: number } = {}
) {
  const jobId = extractLinkedInJobId(sourceUrl);
  if (jobId) {
    const detailUrl = `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`;
    const detailHtml = await fetchHtml(detailUrl, timeoutMs);
    const detailMarkdown = detailHtml ? extractLinkedInDetailMarkdownFromHtml(detailHtml) : "";
    if (detailMarkdown) {
      return detailMarkdown;
    }
  }

  const sourceHtml = await fetchHtml(sourceUrl, timeoutMs);
  const sourceMarkdown = sourceHtml ? extractLinkedInDetailMarkdownFromHtml(sourceHtml) : "";
  return sourceMarkdown || null;
}

export async function fetchSourceDetailMarkdown(
  sourceUrl: string,
  { timeoutMs = 30_000 }: { timeoutMs?: number } = {}
) {
  if (isPdfUrl(sourceUrl)) {
    return null;
  }
  if (isLinkedInUrl(sourceUrl)) {
    return fetchLinkedInDetailMarkdown(sourceUrl, { timeoutMs });
  }

  const sourceHtml = await fetchHtml(sourceUrl, timeoutMs);
  if (!sourceHtml) {
    return null;
  }
  const sourceMarkdown = extractGenericDetailMarkdownFromHtml(sourceHtml);
  return sourceMarkdown || null;
}
