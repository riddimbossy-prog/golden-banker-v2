// Predict2U v189 — Supabase Edge Function: p2u-push-dispatch
// Required secrets:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT,
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PUSH_DISPATCH_SECRET
// Deploy with JWT verification enabled. Admin JWTs or x-p2u-push-secret may invoke it.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-p2u-push-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:predict2u@gmail.com";
const DISPATCH_SECRET = Deno.env.get("PUSH_DISPATCH_SECRET") || "";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type JsonRecord = Record<string, unknown>;
type PushJob = {
  id: number;
  category: string;
  title: string;
  body: string;
  url: string;
  audience: JsonRecord;
  payload: JsonRecord;
};

type Preference = {
  user_id: string;
  enabled?: boolean;
  board_updates?: boolean;
  match_status?: boolean;
  favorite_leagues?: boolean;
  favorite_engines?: boolean;
  community_wins?: boolean;
  followed_users?: boolean;
  announcements?: boolean;
  football_news?: boolean;
  transfer_news?: boolean;
  verified_only?: boolean;
  quiet_enabled?: boolean;
  quiet_start?: string;
  quiet_end?: string;
  timezone_offset_minutes?: number;
  favorite_league_names?: string[];
  favorite_engine_names?: string[];
  followed_user_ids?: string[];
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function parseClock(value: unknown, fallback: number) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
  if (!match) return fallback;
  return Math.max(0, Math.min(1439, Number(match[1]) * 60 + Number(match[2])));
}

function isQuiet(pref: Preference) {
  if (!pref.quiet_enabled) return false;
  const now = new Date();
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const offset = Number(pref.timezone_offset_minutes || 0);
  const localMinutes = ((utcMinutes - offset) % 1440 + 1440) % 1440;
  const start = parseClock(pref.quiet_start, 22 * 60);
  const end = parseClock(pref.quiet_end, 7 * 60);
  return start === end ? true : start < end
    ? localMinutes >= start && localMinutes < end
    : localMinutes >= start || localMinutes < end;
}

function categoryEnabled(category: string, pref: Preference) {
  if (pref.enabled === false) return false;
  if (category === "board") return pref.board_updates !== false;
  if (category === "match") return pref.match_status !== false;
  if (category === "community") return pref.community_wins !== false;
  if (category === "announcement") return pref.announcements !== false;
  if (category === "news") return true;
  return true;
}

function audienceAllows(job: PushJob, pref: Preference, userId: string) {
  const audience = (job.audience || {}) as JsonRecord;
  const type = normalize(audience.type || "all");
  if (type === "all" || type === "community") return true;
  if (type === "users") {
    const ids = Array.isArray(audience.user_ids) ? audience.user_ids.map(String) : [];
    return ids.includes(userId);
  }
  if (type === "favorite_match") {
    const league = normalize(audience.league);
    const engines = Array.isArray(audience.engines) ? audience.engines.map(normalize) : [];
    const leagues = new Set((pref.favorite_league_names || []).map(normalize));
    const favoriteEngines = new Set((pref.favorite_engine_names || []).map(normalize));
    const leagueHit = pref.favorite_leagues !== false && league && leagues.has(league);
    const engineHit = pref.favorite_engines !== false && engines.some((engine) => favoriteEngines.has(engine));
    return Boolean(leagueHit || engineHit);
  }
  if (type === "followed_user") {
    if (pref.followed_users === false) return false;
    const author = String(audience.author_user_id || "");
    return Boolean(author && (pref.followed_user_ids || []).includes(author));
  }
  return true;
}

async function authorize(req: Request) {
  const secret = req.headers.get("x-p2u-push-secret") || "";
  if (DISPATCH_SECRET && secret && secret === DISPATCH_SECRET) return { mode: "secret" };

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return null;
  const { data: role } = await admin
    .from("p2u_admin_roles")
    .select("role,active")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!role?.active || !["owner", "admin"].includes(role.role)) return null;
  return { mode: "admin", userId: userData.user.id, role: role.role };
}

async function fetchRecipients() {
  const [{ data: subscriptions, error: subError }, { data: preferences, error: prefError }] = await Promise.all([
    admin.from("p2u_push_subscriptions")
      .select("id,user_id,endpoint,p256dh,auth,enabled,failure_count")
      .eq("enabled", true)
      .limit(10000),
    admin.from("p2u_push_preferences").select("*").limit(10000),
  ]);
  if (subError) throw subError;
  if (prefError) throw prefError;
  const prefMap = new Map<string, Preference>();
  for (const pref of preferences || []) prefMap.set(pref.user_id, pref as Preference);
  return { subscriptions: subscriptions || [], prefMap };
}

async function deliverJob(job: PushJob) {
  const { subscriptions, prefMap } = await fetchRecipients();
  let sent = 0, failed = 0, skipped = 0;
  const logRows: JsonRecord[] = [];

  const payload = JSON.stringify({
    version: "v189",
    id: `push-job-${job.id}`,
    category: job.category,
    title: job.title,
    body: job.body,
    url: job.url || "index.html",
    icon: "icon-192.png",
    badge: "favicon-48x48.png",
    createdAt: Date.now(),
    data: job.payload || {},
  });

  for (const sub of subscriptions) {
    const pref = prefMap.get(sub.user_id) || { user_id: sub.user_id };
    const newsType = normalize((job.payload || {}).news_type || "news");
    const newsAllowed = job.category !== "news" || (newsType === "transfer" ? pref.transfer_news !== false : pref.football_news !== false);
    const allowed = categoryEnabled(job.category, pref)
      && newsAllowed
      && !isQuiet(pref)
      && audienceAllows(job, pref, sub.user_id)
      && !(job.category === "community" && pref.verified_only && !(job.payload as JsonRecord)?.verified);

    if (!allowed) {
      skipped++;
      logRows.push({ job_id: job.id, subscription_id: sub.id, user_id: sub.user_id, status: "skipped", error: "Preference or audience filter" });
      continue;
    }

    try {
      await webpush.sendNotification({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      }, payload, { TTL: 60 * 60 * 12, urgency: (job.category === "match" || job.category === "news") ? "high" : "normal" });
      sent++;
      logRows.push({ job_id: job.id, subscription_id: sub.id, user_id: sub.user_id, status: "sent" });
      await admin.from("p2u_push_subscriptions").update({ failure_count: 0, last_error: "", last_seen_at: new Date().toISOString() }).eq("id", sub.id);
    } catch (error) {
      failed++;
      const statusCode = Number((error as { statusCode?: number })?.statusCode || 0) || null;
      const message = String((error as Error)?.message || error).slice(0, 500);
      logRows.push({ job_id: job.id, subscription_id: sub.id, user_id: sub.user_id, status: "failed", response_code: statusCode, error: message });
      const expired = statusCode === 404 || statusCode === 410;
      await admin.from("p2u_push_subscriptions").update({
        enabled: expired ? false : true,
        failure_count: Number(sub.failure_count || 0) + 1,
        last_error: message,
        updated_at: new Date().toISOString(),
      }).eq("id", sub.id);
    }
  }

  for (let i = 0; i < logRows.length; i += 500) {
    const batch = logRows.slice(i, i + 500);
    if (batch.length) await admin.from("p2u_push_delivery_log").insert(batch);
  }

  const finalStatus = failed > 0 && sent === 0 ? "failed" : "completed";
  await admin.rpc("p2u_finish_push_job", {
    p_job_id: job.id,
    p_status: finalStatus,
    p_sent: sent,
    p_failed: failed,
    p_skipped: skipped,
    p_error: finalStatus === "failed" ? "No notifications were delivered." : "",
  });
  return { jobId: job.id, sent, failed, skipped, status: finalStatus };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "POST required" }, 405);
  if (!SUPABASE_URL || !SERVICE_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return jsonResponse({ error: "Push function secrets are not configured." }, 503);
  }

  const authorized = await authorize(req);
  if (!authorized) return jsonResponse({ error: "Admin authorization or dispatch secret required." }, 401);

  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(Number(body?.limit || 10), 50));
    const { data: jobs, error } = await admin.rpc("p2u_claim_push_jobs", { p_limit: limit });
    if (error) throw error;
    const results = [];
    for (const job of (jobs || []) as PushJob[]) results.push(await deliverJob(job));
    return jsonResponse({ ok: true, version: "v189", claimed: results.length, results });
  } catch (error) {
    return jsonResponse({ error: String((error as Error)?.message || error) }, 500);
  }
});
