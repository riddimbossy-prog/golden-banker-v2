/* Predict2U v181 static fallback configuration.
   Live settings are loaded from Supabase by site-controls.js after v181 setup.
   Never place passwords, tokens or API keys here. */
window.P2U_ADMIN_CONFIG = Object.freeze({
  version: "v181",
  updatedAt: "",
  board: { published: true, message: "Today’s board is being prepared. Please check back shortly." },
  announcement: { enabled: false, tone: "info", message: "", linkLabel: "", linkUrl: "", expiresAt: "" },
  featured: { engines: [], leagues: [] },
  community: { hiddenIds: [], verifiedIds: [] },
  operations: {
    repository: "https://github.com/riddimbossy-prog/golden-banker-v2",
    qualityWorkflow: "https://github.com/riddimbossy-prog/golden-banker-v2/actions/workflows/site-quality.yml",
    liveScoresWorkflow: "https://github.com/riddimbossy-prog/golden-banker-v2/actions/workflows/live-scores.yml"
  }
});
