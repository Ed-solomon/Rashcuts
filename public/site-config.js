/*
 * Rashcuts public data connection.
 *
 * The public site has safe local defaults baked in, so it still renders when
 * the backend is unavailable. When served by the bundled Node app, this
 * same-origin endpoint refreshes prices, gallery and studio location from MySQL.
 */
window.RashcutsPublicConfig = {
  apiBaseUrl: "",
  publicEndpoint: "/api/public/site-data",
  publicCacheMs: 5 * 60 * 1000
};
