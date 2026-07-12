// Predict2U v189 — Supabase Edge Function: p2u-news-sync
// Pulls short, attributed football headlines from enabled RSS/Atom sources.
// Required custom secret: NEWS_SYNC_SECRET
// Built-in Supabase secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Deploy with JWT verification enabled. GitHub Actions may invoke it using the
// service-role JWT plus x-p2u-news-secret.

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
const VERSION = "v189";
const MAX_SOURCES = 20;
const MAX_PER_SOURCE = 35;

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
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function arrayify<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function validHttpUrl(value: unknown) {
  try {
    const url = new URL(String(value || ""));
    return /^https?:$/.test(url.protocol) ? url.href : "";
  } catch (_) {
    return "";
  }
}

function linkOf(item: JsonRecord) {
  const raw = item.link;
  if (typeof raw === "string") return validHttpUrl(raw);
  for (const link of arrayify(raw as JsonRecord | JsonRecord[])) {
    const record = link as JsonRecord;
    const rel = String(record?.["@_rel"] || "alternate");
    const href = validHttpUrl(record?.["@_href"] || record?.["#text"]);
    if (href && (rel === "alternate" || !rel)) return href;
  }
  return validHttpUrl(item.guid) || validHttpUrl(item.id);
}

function imageOf(item: JsonRecord, summaryHtml: unknown) {
  const candidates: unknown[] = [
    (item.enclosure as JsonRecord)?.["@_url"],
    (item["media:content"] as JsonRecord)?.["@_url"],
    (item["media:thumbnail"] as JsonRecord)?.["@_url"],
    (item["media:group"] as JsonRecord)?.["media:content"],
  ];
  for (const value of candidates) {
    if (Array.isArray(value)) {
      for (const x of value) {
        const url = validHttpUrl((x as JsonRecord)?.["@_url"] || x);
        if (url) return url;
      }
    } else {
      const url = validHttpUrl((value as JsonRecord)?.["@_url"] || value);
      if (url) return url;
    }
  }
  const html = String(summaryHtml || "");
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match ? validHttpUrl(match[1]) : "";
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
  const timer = setTimeout(() => controller.abort(), 14000);
  try {
    const response = await fetch(source.feed_url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Predict2U-NewsBot/1.0 (+https://predict2u.com/news.html)",
        "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5",
      },
    });
    if (!response.ok) throw new Error(`Feed returned HTTP ${response.status}`);
    const body = await response.text();
    if (body.length > 5_000_000) throw new Error("Feed response is too large");
    const parsed = parser.parse(body) as JsonRecord;
    const items = feedItems(parsed).slice(0, MAX_PER_SOURCE);
    const rows: JsonRecord[] = [];
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
        title,
        summary,
        url,
        image_url: imageOf(item, summaryRaw),
        category: flags.category,
        region: text(source.region || "Global", 60),
        breaking: flags.breaking,
        push_eligible: flags.push_eligible,
        published: true,
        published_at: dateOf(item),
        updated_at: new Date().toISOString(),
      });
    }

    let inserted = 0;
    if (rows.length) {
      const { data, error } = await admin
        .from("p2u_news_articles")
        .upsert(rows, { onConflict: "external_id", ignoreDuplicates: true })
        .select("id");
      if (error) throw error;
      inserted = data?.length || 0;
    }
    await admin.from("p2u_news_sources").update({
      last_success_at: new Date().toISOString(),
      last_error: "",
      updated_at: new Date().toISOString(),
    }).eq("id", source.id);
    return { source: source.name, found: items.length, inserted, ok: true };
  } catch (error) {
    const message = String((error as Error)?.message || error).slice(0, 500);
    await admin.from("p2u_news_sources").update({
      last_error: message,
      updated_at: new Date().toISOString(),
    }).eq("id", source.id);
    return { source: source.name, found: 0, inserted: 0, ok: false, error: message };
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
  // Service-role JWTs do not resolve to an auth user. Accept only when the
  // custom sync secret also matched above, so this branch remains false.
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
      .select("id,name,feed_url,homepage_url,region,priority")
      .eq("enabled", true)
      .order("priority", { ascending: true })
      .limit(sourceLimit);
    if (error) throw error;
    const results = [];
    for (const source of (sources || []) as Source[]) results.push(await syncSource(source));
    const inserted = results.reduce((sum, row) => sum + Number(row.inserted || 0), 0);
    return jsonResponse({ ok: true, version: VERSION, sources: results.length, inserted, results });
  } catch (error) {
    return jsonResponse({ error: String((error as Error)?.message || error) }, 500);
  }
});
