/**
 * Загрузка страницы по URL и извлечение текста (без рендеринга JS).
 * Поддержка извлечения вложенных ссылок с той же площадки.
 */

import * as cheerio from "cheerio";

const FETCH_TIMEOUT_MS = 15000;
const MAX_HTML_BYTES = 2 * 1024 * 1024; // 2 MB

export async function fetchAndExtractText(url: string): Promise<{ title: string; text: string }> {
  const out = await fetchAndExtractTextWithLinks(url);
  return { title: out.title, text: out.text };
}

/**
 * Извлекает ссылки со страницы: тот же origin и тот же раздел (path prefix).
 * Например, для https://rulebook.centralbank.ae/en/rulebook/all-licensed-financial-institutions
 * подойдут все ссылки с путём /en/rulebook/...
 */
function getSameSiteLinks(html: string, baseUrl: string, maxLinks: number): string[] {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }
  const pathPrefix = base.pathname.replace(/\/[^/]*$/, "/");
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const result: string[] = [];

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")?.trim();
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("javascript:")) return;
    try {
      const absolute = new URL(href, baseUrl);
      if (absolute.origin !== base.origin) return;
      if (absolute.pathname === base.pathname) return;
      if (!absolute.pathname.startsWith(pathPrefix)) return;
      const key = absolute.origin + absolute.pathname;
      if (seen.has(key)) return;
      seen.add(key);
      result.push(absolute.href);
    } catch {
      // ignore invalid URLs
    }
  });

  return result.slice(0, maxLinks);
}

const MAX_NESTED_LINKS = 25;

export type FetchResultWithLinks = {
  title: string;
  text: string;
  /** Вложенные ссылки с той же площадки (тот же origin и путь) */
  nestedLinks: string[];
};

export async function fetchAndExtractTextWithLinks(url: string): Promise<FetchResultWithLinks> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  const res = await fetch(url, {
    signal: controller.signal,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; my_treds/1.0; +https://github.com/my-treds)",
    },
  });
  clearTimeout(timeout);

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${url}`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) {
    throw new Error("Страница не в формате HTML");
  }

  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_HTML_BYTES) {
    throw new Error("Страница слишком большая");
  }

  const html = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  const $ = cheerio.load(html);

  $("script, style, nav, footer, aside, [role='navigation']").remove();
  const title = $("title").text().trim() || url;
  const body = $("body").length ? $("body") : $.root();
  let text = body.text();
  text = text
    .replace(/\s+/g, " ")
    .replace(/\n\s*\n/g, "\n\n")
    .trim();

  if (!text || text.length < 50) {
    throw new Error("Не удалось извлечь достаточно текста со страницы");
  }

  const nestedLinks = getSameSiteLinks(html, url, MAX_NESTED_LINKS);
  return { title, text, nestedLinks };
}
