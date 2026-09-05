/* Config and constants.

   RINK_CONFIG is set inline in index.html — that is the only place a manager
   edits. Everything else in js/ reads it from here. */
var CFG = window.RINK_CONFIG || {};
var CACHE_KEY = "rinkreport.v4";   // bump when the stored shape changes (v3: player stats, v4: rinks)
var DIAG = /[?&]check\b/.test(location.search);
export { CFG, CACHE_KEY, DIAG };
