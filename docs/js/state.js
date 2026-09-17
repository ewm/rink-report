/**
 * What the page knows before it fetches, and the store it fills afterwards.
 *
 * CFG is the config block from index.html, the only thing a manager edits.
 * state is one plain object that every module reads and writes directly.
 * Nothing here renders: code that changes state and wants the page to follow
 * calls notify(), and app.js registers render() as the listener.
 * See ARCHITECTURE.md, "The store" and "Feature switches".
 */

/** The config block from index.html. */
var CFG = window.RINK_CONFIG || {};

/** localStorage key for the last good copy. Bump it when the stored shape changes. */
var CACHE_KEY = "rinkreport.v5";

/** Whether the page was opened with ?check. */
var DIAG = /[?&]check\b/.test(location.search);

/** Every feature switch the page knows, in the order index.html lists them. */
var FEATURES = [
  "nextGame",
  "sponsors",
  "stats",
  "events",
  "preseason",
  "directions",
  "calendar",
  "seasonCalendar",
  "mhrLinks",
  "monoNumbers"
];

/**
 * Whether a feature is switched on. Only the value `false` turns one off; a
 * missing key, or any other value, counts as on.
 *
 * @param {string} name - A key from FEATURES, such as "stats".
 * @returns {boolean}
 */
function on(name) {
  var block = CFG.features;

  if (!block || !Object.prototype.hasOwnProperty.call(block, name)) {
    return true;
  }

  return block[name] !== false;
}

/**
 * The switches that are off, for the ?check page.
 *
 * @returns {string[]}
 */
function offList() {
  return FEATURES.filter(function (name) {
    return !on(name);
  });
}

/**
 * Everything the page knows.
 *
 * data: the shaped sheet (config, teams, pools, games, stats, rinks, sponsors).
 * problems: plain-English warnings for the manager, reset per load.
 * fetchedAt / loading / loadError: fetch status, for the status line.
 * snapshotAt: when the site's own saved copy was taken, if that is what loaded.
 * viewKey: the tab the reader chose (null lets the calendar decide).
 * filterOurs: the All / Ours switch on results. Starts on Ours: a parent
 *   opens the page to find out when their own kid plays next, and the
 *   division's other games are one tap away.
 * statsScope: "all" or "league", the switch on the Stats page.
 * sponsorsOpen: whether the sponsors block is expanded (remembered per device).
 * diagLog / routeUsed / headerMap / routeTrouble: for ?check.
 * statsNote / rinksNote / sponsorsNote: why an optional tab is missing, for ?check.
 * logoOk: whether logo.png exists (probed once).
 * lastHtml: the last markup written, so a no-op poll is a no-op paint.
 * pollTimer: the pending poll.
 */
var state = {
  data: {
    config: {
      leagueName: "",
      teamName: "",
      mode: "season",
      ptsWin: 2,
      ptsTie: 1,
      ptsLoss: 0,
      gameMinutes: 45
    },
    teams: [],
    pools: {},
    mhr: {},
    games: [],
    stats: null,
    rinks: null,
    sponsors: null
  },
  problems: [],
  fetchedAt: null,
  loading: true,
  loadError: "",
  snapshotAt: null,
  viewKey: null,
  filterOurs: true,
  statsScope: "all",
  // Open by default. A reader who folds it keeps it folded on that phone only.
  sponsorsOpen: (function () {
    try {
      return localStorage.getItem("rinkreport.sponsorsOpen") !== "0";
    } catch (e) {
      return true;
    }
  })(),
  diagLog: [],
  routeUsed: [],
  headerMap: [],
  routeTrouble: [],
  statsNote: "",
  rinksNote: "",
  sponsorsNote: "",
  logoOk: false,
  lastHtml: null,
  pollTimer: null
};

/**
 * Appends a line to the ?check log.
 *
 * @param {string} m
 */
function log(m) {
  state.diagLog.push(m);
}

/** Functions to call when the page should re-render. */
var listeners = [];

/**
 * Registers a change listener.
 *
 * @param {Function} fn
 */
function onChange(fn) {
  listeners.push(fn);
}

/** Calls every registered listener. */
function notify() {
  for (var i = 0; i < listeners.length; i++) {
    listeners[i]();
  }
}

export { CFG, CACHE_KEY, DIAG, on, offList, state, log, onChange, notify };
