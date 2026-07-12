/* Predict2U v186 public cloud configuration.
   The publishable key is intentionally public and protected by Supabase RLS.
   Never place a service-role key in browser code. */
window.P2U_CLOUD_CONFIG = Object.freeze({
  version: "v189",
  enabled: !/^(localhost|127\.0\.0\.1)$/i.test(location.hostname),
  url: "https://tjbkkhirnwfensqzuvzn.supabase.co",
  publishableKey: "sb_publishable_wjdYr-Px9FmMob7WfEswJQ_wj4cuNkd",
  stateTable: "p2u_cloud_state",
  followsTable: "p2u_follows",
  deletionTable: "p2u_account_deletion_requests",
  adminRolesTable: "p2u_admin_roles",
  siteSettingsTable: "p2u_site_settings",
  moderationTable: "p2u_community_moderation",
  auditTable: "p2u_admin_audit_log",
  pushConfigTable: "p2u_push_public_config",
  pushSubscriptionsTable: "p2u_push_subscriptions",
  pushPreferencesTable: "p2u_push_preferences",
  pushJobsTable: "p2u_push_jobs",
  pushDeliveryTable: "p2u_push_delivery_log",
  pushFunction: "p2u-push-dispatch",
  analyticsEventsTable: "p2u_analytics_events",
  analyticsIngestFunction: "p2u_ingest_analytics_events",
  analyticsOverviewFunction: "p2u_admin_analytics_overview",
  newsArticlesTable: "p2u_news_articles",
  newsCommentsTable: "p2u_news_comments",
  newsSourcesTable: "p2u_news_sources",
  newsSyncFunction: "p2u-news-sync",
});
