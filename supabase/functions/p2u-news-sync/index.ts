// Predict2U v192 — Supabase Edge Function: p2u-news-sync
// Pulls short, attributed football headlines from enabled RSS/Atom sources.
// It prefers publisher-provided RSS media and, when missing, safely reads the
// article's Open Graph/Twitter image metadata so the News page can show the
// real story image. Full stories remain on the original publisher's website.
// Required custom secret: NEWS_SYNC_SECRET
// Built-in Supabase secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { XMLParser } from "npm:fast-xml-parser@4.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-p2u-news-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SYNC_SECRET = Deno.env.get("NEWS_SYNC_SECRET") || "";
const VERSION = "v192";
const MAX_SOURCES = 20;
const MAX_PER_SOURCE = 35;
const MAX_OG_LOOKUPS_PER_SOURCE = 14;
const OG_CONCURRENCY = 4;
const SOURCE_CONCURRENCY = 2;
const FEED_TIMEOUT_MS = 14_000;
const ARTICLE_TIMEOUT_MS = 7_000;
const MAX_ARTICLE_HTML_BYTES = 1_600_000;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: false,
  trimValues: true,
  processEntities: true,
});

type JsonRecord = Record<string, unknown>;
type Source = {
  id: number;
  name: string;
  feed_url: string;
  homepage_url?: string;
  region?: string;
  priority?: number;
  verified?: boolean;
};

type ArticleRow = JsonRecord & {
  external_id: string;
  url: string;
  image_url: string;
  canonical_key: string;
  source_verified: boolean;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function text(value: unknown, max = 500) {
  if (Array.isArray(value)) value = value[0];
  if (value && typeof value === "object") {
    const record = value as JsonRecord;
    value = record["#text"] ?? record["__cdata"] ?? record["content"] ?? "";
  }
  return String(value ?? "")
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function arrayify<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function isPrivateIpv4(host: string) {
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 ||
    parts[0] === 127 ||
    parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168);
}

function safeExternalUrl(value: unknown, base?: string) {
  try {
    const url = base ? new URL(String(value || ""), base) : new URL(String(value || ""));
    if (!/^https?:$/.test(url.protocol)) return "";
    if (url.username || url.password) return "";
    if (url.port && !["80", "443"].includes(url.port)) return "";
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || isPrivateIpv4(host)) return "";
    if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) return "";
    url.hash = "";
    return url.href;
  } catch (_) {
    return "";
  }
}

function looksLikeTracker(value: string) {
  const lower = value.toLowerCase();
  return /(?:^|[\/_\-.])(pixel|tracker|tracking|spacer|blank|favicon|avatar|badge|icon|logo|sprite|placeholder)(?:[\/_\-.]|$)/.test(lower) ||
    /(?:^|[?&])(w|width)=1(?:&|$)/.test(lower) ||
    /(?:^|[?&])(h|height)=1(?:&|$)/.test(lower);
}

function imageUrl(value: unknown, base?: string) {
  const resolved = safeExternalUrl(decodeEntities(String(value || "").trim()), base);
  if (!resolved || looksLikeTracker(resolved)) return "";
  return resolved;
}

function linkOf(item: JsonRecord) {
  const raw = item.link;
  if (typeof raw === "string") return safeExternalUrl(raw);
  for (const link of arrayify(raw as JsonRecord | JsonRecord[])) {
    const record = link as JsonRecord;
    const rel = String(record?.["@_rel"] || "alternate");
    const href = safeExternalUrl(record?.["@_href"] || record?.["#text"]);
    if (href && (rel === "alternate" || !rel)) return href;
  }
  return safeExternalUrl(item.guid) || safeExternalUrl(item.id);
}

function collectMediaCandidates(value: unknown, output: unknown[], depth = 0) {
  if (value == null || depth > 4) return;
  if (typeof value === "string") {
    output.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectMediaCandidates(entry, output, depth + 1);
    return;
  }
  if (typeof value === "object") {
    const record = value as JsonRecord;
    for (const key of ["@_url", "@_href", "url", "href", "src", "#text"]) {
      if (record[key]) output.push(record[key]);
    }
    for (const [key, nested] of Object.entries(record)) {
      if (/media|thumbnail|image|enclosure|content/i.test(key)) collectMediaCandidates(nested, output, depth + 1);
    }
  }
}

function firstSrcsetUrl(value: string, base?: string) {
  const choices = value.split(",").map((part) => part.trim().split(/\s+/)[0]).filter(Boolean);
  for (let index = choices.length - 1; index >= 0; index -= 1) {
    const resolved = imageUrl(choices[index], base);
    if (resolved) return resolved;
  }
  return "";
}

function imageFromHtmlFragment(htmlValue: unknown, base?: string) {
  const html = String(htmlValue || "");
  const srcset = html.match(/<img[^>]+(?:srcset|data-srcset)=["']([^"']+)["']/i);
  if (srcset) {
    const candidate = firstSrcsetUrl(srcset[1], base);
    if (candidate) return candidate;
  }
  const src = html.match(/<img[^>]+(?:src|data-src|data-lazy-src|data-original)=["']([^"']+)["']/i);
  return src ? imageUrl(src[1], base) : "";
}

function imageOfFeed(item: JsonRecord, summaryHtml: unknown, articleUrl: string) {
  const candidates: unknown[] = [];
  for (const key of ["enclosure", "media:content", "media:thumbnail", "media:group", "image", "itunes:image", "thumbnail"]) {
    collectMediaCandidates(item[key], candidates);
  }
  const links = arrayify(item.link as JsonRecord | JsonRecord[]);
  for (const link of links) {
    const record = link as JsonRecord;
    const rel = String(record?.["@_rel"] || "").toLowerCase();
    const type = String(record?.["@_type"] || "").toLowerCase();
    if (rel === "enclosure" || type.startsWith("image/")) candidates.push(record?.["@_href"] || record?.["@_url"]);
  }
  for (const candidate of candidates) {
    const url = imageUrl((candidate as JsonRecord)?.["@_url"] || candidate, articleUrl);
    if (url) return url;
  }
  return imageFromHtmlFragment(summaryHtml, articleUrl);
}

function parseTagAttributes(tag: string) {
  const attrs: Record<string, string> = {};
  const expression = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match: RegExpExecArray | null;
  while ((match = expression.exec(tag))) attrs[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  return attrs;
}

async function readLimitedText(response: Response, maxBytes: number) {
  if (!response.body) return (await response.text()).slice(0, maxBytes);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let output = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        const allowed = Math.max(0, value.byteLength - (total - maxBytes));
        output += decoder.decode(value.slice(0, allowed), { stream: true });
        break;
      }
      output += decoder.decode(value, { stream: true });
    }
    output += decoder.decode();
    return output;
  } finally {
    try { await reader.cancel(); } catch (_) {}
  }
}

function imageFromArticleHtml(html: string, articleUrl: string) {
  const preferredKeys = [
    "og:image:secure_url",
    "og:image:url",
    "og:image",
    "twitter:image:src",
    "twitter:image",
    "thumbnailurl",
    "image",
  ];
  const found = new Map<string, string[]>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const attrs = parseTagAttributes(tag);
    const key = String(attrs.property || attrs.name || attrs.itemprop || "").toLowerCase();
    const content = attrs.content || attrs.value || "";
    if (!key || !content) continue;
    if (!found.has(key)) found.set(key, []);
    found.get(key)?.push(content);
  }
  for (const key of preferredKeys) {
    for (const candidate of found.get(key) || []) {
      const resolved = imageUrl(candidate, articleUrl);
      if (resolved) return resolved;
    }
  }
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    const attrs = parseTagAttributes(tag);
    if (String(attrs.rel || "").toLowerCase().split(/\s+/).includes("image_src")) {
      const resolved = imageUrl(attrs.href, articleUrl);
      if (resolved) return resolved;
    }
  }
  const jsonLdImage = html.match(/"(?:thumbnailUrl|contentUrl|image)"\s*:\s*(?:\[\s*)?"([^"\\]*(?:\\.[^"\\]*)*)"/i);
  if (jsonLdImage) {
    try {
      const decoded = JSON.parse(`"${jsonLdImage[1]}"`);
      const resolved = imageUrl(decoded, articleUrl);
      if (resolved) return resolved;
    } catch (_) {}
  }
  return "";
}

async function imageFromArticlePage(articleUrl: string) {
  const safeUrl = safeExternalUrl(articleUrl);
  if (!safeUrl) return "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ARTICLE_TIMEOUT_MS);
  try {
    const response = await fetch(safeUrl, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Predict2U-NewsBot/1.1 (+https://predict2u.com/news.html)",
        "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.2",
        "Accept-Language": "en-GB,en;q=0.8",
      },
    });
    if (!response.ok) return "";
    if (!safeExternalUrl(response.url || safeUrl)) return "";
    const type = String(response.headers.get("content-type") || "").toLowerCase();
    if (type && !type.includes("text/html") && !type.includes("application/xhtml+xml")) return "";
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_ARTICLE_HTML_BYTES) return "";
    const html = await readLimitedText(response, MAX_ARTICLE_HTML_BYTES);
    return imageFromArticleHtml(html, response.url || safeUrl);
  } catch (_) {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

async function mapWithConcurrency<T>(items: T[], limit: number, worker: (item: T, index: number) => Promise<void>) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

function dateOf(item: JsonRecord) {
  const raw = item.pubDate || item.published || item.updated || item["dc:date"] || item.date;
  const date = new Date(String(raw || ""));
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function classify(title: string, summary: string) {
  const hay = `${title} ${summary}`.toLowerCase();
  const transfer = /\b(transfer|sign(?:s|ed|ing)?|joins?|deal|bid|loan|medical|contract|release clause|free agent|agrees? terms|move to)\b/.test(hay);
  const breaking = /\b(breaking|confirmed|official|urgent|sacked|resigns?|suspended|banned|injury blow|out of the world cup)\b/.test(hay);
  return { category: transfer ? "transfer" : "news", breaking, push_eligible: transfer || breaking };
}

function canonicalKey(title: string) {
  return title.toLowerCase()
    .replace(/\b(the|a|an|to|for|of|in|on|at|with|and|or|from|after|before|latest|breaking|official|confirmed|report)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 14)
    .join(" ")
    .slice(0, 180);
}

async function digest(value: string) {
  const data = new TextEncoder().encode(value);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return [...hash].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function feedItems(xml: JsonRecord) {
  const rss = xml.rss as JsonRecord | undefined;
  const channel = rss?.channel as JsonRecord | undefined;
  if (channel?.item) return arrayify(channel.item as JsonRecord | JsonRecord[]);
  const feed = xml.feed as JsonRecord | undefined;
  if (feed?.entry) return arrayify(feed.entry as JsonRecord | JsonRecord[]);
  const rdf = xml["rdf:RDF"] as JsonRecord | undefined;
  if (rdf?.item) return arrayify(rdf.item as JsonRecord | JsonRecord[]);
  return [];
}

async function syncSource(source: Source) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
  try {
    const response = await fetch(source.feed_url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Predict2U-NewsBot/1.1 (+https://predict2u.com/news.html)",
        "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5",
      },
    });
    if (!response.ok) throw new Error(`Feed returned HTTP ${response.status}`);
    const body = await response.text();
    if (body.length > 5_000_000) throw new Error("Feed response is too large");
    const parsed = parser.parse(body) as JsonRecord;
    const items = feedItems(parsed).slice(0, MAX_PER_SOURCE);
    const rows: ArticleRow[] = [];

    for (const item of items) {
      const title = text(item.title, 260);
      const summaryRaw = item.description || item.summary || item.content || item["content:encoded"] || "";
      const summary = text(summaryRaw, 360);
      const url = linkOf(item);
      if (!title || !url) continue;
      const external = text(item.guid || item.id || url, 1000);
      const flags = classify(title, summary);
      let domain = "";
      try { domain = new URL(url).hostname.replace(/^www\./, ""); } catch (_) {}
      rows.push({
        external_id: await digest(`${source.id}|${external || url}`),
        source_id: source.id,
        source_name: text(source.name, 120),
        source_domain: domain,
        source_verified: Boolean(source.verified),
        canonical_key: canonicalKey(title),
        title,
        summary,
        url,
        image_url: imageOfFeed(item, summaryRaw, url),
        category: flags.category,
        region: text(source.region || "Global", 60),
        breaking: flags.breaking,
        push_eligible: flags.push_eligible,
        published: true,
        published_at: dateOf(item),
        updated_at: new Date().toISOString(),
      });
    }

    const existing = new Map<string, string>();
    if (rows.length) {
      const ids = rows.map((row) => row.external_id);
      const { data: current, error: currentError } = await admin
        .from("p2u_news_articles")
        .select("external_id,image_url")
        .in("external_id", ids);
      if (currentError) throw currentError;
      for (const row of current || []) existing.set(String(row.external_id), String(row.image_url || ""));
    }

    const enrichmentTargets = rows
      .filter((row) => !row.image_url && !existing.get(row.external_id))
      .slice(0, MAX_OG_LOOKUPS_PER_SOURCE);
    let enrichedImages = 0;
    await mapWithConcurrency(enrichmentTargets, OG_CONCURRENCY, async (row) => {
      const resolved = await imageFromArticlePage(row.url);
      if (resolved) {
        row.image_url = resolved;
        enrichedImages += 1;
      }
    });

    for (const row of rows) {
      if (!row.image_url) row.image_url = existing.get(row.external_id) || "";
    }

    const inserted = rows.filter((row) => !existing.has(row.external_id)).length;
    let processed = 0;
    if (rows.length) {
      const { data, error } = await admin
        .from("p2u_news_articles")
        .upsert(rows, { onConflict: "external_id", ignoreDuplicates: false })
        .select("id");
      if (error) throw error;
      processed = data?.length || 0;
    }

    await admin.from("p2u_news_sources").update({
      last_success_at: new Date().toISOString(),
      last_error: "",
      updated_at: new Date().toISOString(),
    }).eq("id", source.id);

    return {
      source: source.name,
      found: items.length,
      processed,
      inserted,
      with_images: rows.filter((row) => Boolean(row.image_url)).length,
      enriched_images: enrichedImages,
      ok: true,
    };
  } catch (error) {
    const message = String((error as Error)?.message || error).slice(0, 500);
    await admin.from("p2u_news_sources").update({
      last_error: message,
      updated_at: new Date().toISOString(),
    }).eq("id", source.id);
    return { source: source.name, found: 0, processed: 0, inserted: 0, with_images: 0, enriched_images: 0, ok: false, error: message };
  } finally {
    clearTimeout(timer);
  }
}

async function authorize(req: Request) {
  const secret = req.headers.get("x-p2u-news-secret") || "";
  if (SYNC_SECRET && secret && secret === SYNC_SECRET) return true;
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  const { data, error } = await admin.auth.getUser(token);
  if (!error && data.user) {
    const { data: role } = await admin.from("p2u_admin_roles").select("role,active").eq("user_id", data.user.id).maybeSingle();
    return Boolean(role?.active && ["owner", "admin"].includes(role.role));
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "POST required" }, 405);
  if (!SUPABASE_URL || !SERVICE_KEY || !SYNC_SECRET) return jsonResponse({ error: "News sync secrets are not configured." }, 503);
  if (!(await authorize(req))) return jsonResponse({ error: "Admin authorization or news sync secret required." }, 401);

  try {
    const body = await req.json().catch(() => ({}));
    const sourceLimit = Math.max(1, Math.min(Number(body?.sourceLimit || MAX_SOURCES), MAX_SOURCES));
    const { data: sources, error } = await admin
      .from("p2u_news_sources")
      .select("id,name,feed_url,homepage_url,region,priority,verified")
      .eq("enabled", true)
      .order("priority", { ascending: true })
      .limit(sourceLimit);
    if (error) throw error;

    const sourceRows = (sources || []) as Source[];
    const results: Awaited<ReturnType<typeof syncSource>>[] = new Array(sourceRows.length);
    let sourceCursor = 0;
    await Promise.all(Array.from({ length: Math.min(SOURCE_CONCURRENCY, sourceRows.length) }, async () => {
      while (true) {
        const index = sourceCursor++;
        if (index >= sourceRows.length) return;
        results[index] = await syncSource(sourceRows[index]);
      }
    }));
    const inserted = results.reduce((sum, row) => sum + Number(row.inserted || 0), 0);
    const processed = results.reduce((sum, row) => sum + Number(row.processed || 0), 0);
    const withImages = results.reduce((sum, row) => sum + Number(row.with_images || 0), 0);
    const enrichedImages = results.reduce((sum, row) => sum + Number(row.enriched_images || 0), 0);
    return jsonResponse({ ok: true, version: VERSION, sources: results.length, processed, inserted, with_images: withImages, enriched_images: enrichedImages, results });
  } catch (error) {
    return jsonResponse({ error: String((error as Error)?.message || error) }, 500);
  }
});
