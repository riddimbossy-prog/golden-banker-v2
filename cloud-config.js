/* Predict2U v181 public cloud configuration.
   The publishable key is intentionally public and protected by Supabase RLS.
   Never place a service-role key in browser code. */
window.P2U_CLOUD_CONFIG = Object.freeze({
  version: "v181",
  enabled: !/^(localhost|127\.0\.0\.1)$/i.test(location.hostname),
  url: "https://tjbkkhirnwfensqzuvzn.supabase.co",
  publishableKey: "sb_publishable_wjdYr-Px9FmMob7WfEswJQ_wj4cuNkd",
  stateTable: "p2u_cloud_state",
  followsTable: "p2u_follows",
  deletionTable: "p2u_account_deletion_requests",
  adminRolesTable: "p2u_admin_roles",
  siteSettingsTable: "p2u_site_settings",
  moderationTable: "p2u_community_moderation",
  auditTable: "p2u_admin_audit_log"
});
