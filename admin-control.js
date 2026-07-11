/* Predict2U v181 compatibility notice.
   The browser-only PIN console was retired. admin.html now loads backend-admin.js,
   which uses Supabase Auth, RLS and protected RPC functions. */
(function(){
  'use strict';
  window.P2ULegacyAdmin={retired:true,replacement:'backend-admin.js',version:'v181'};
})();
