/**
 * What the page knows before it fetches, and the store it fills afterwards.
 *
 * CFG is the config from config.js, the only thing a manager edits.
 * state is one plain object that every module reads and writes directly.
 * Nothing here renders: code that changes state and wants the page to follow
 * calls notify(), and app.js registers render() as the listener.
 * See ARCHITECTURE.md, "The store" and "Feature switches".
 */

/** The config from config.js in the team folder. */
var CFG = window.RINK_CONFIG || {};

/**
 * Browser storage is shared by every page on one web address, and every
 * team's folder lives on the same address. So each key this page stores
 * carries the folder's path, or two teams opened on one phone would
 * overwrite each other's saved standings.
 *
 * @param {string} name - The key's own name, such as "rinkreport.v5".
 * @returns {string} The name plus this page's folder, e.g. "rinkreport.v5:/wswings12u/".
 */
function scopedKey(name) {
  var dir = "/";

  try {
    dir = location.pathname.replace(/[^/]*$/, "") || "/";
  } catch (e) {}

  return name + ":" + dir;
}

/** localStorage key for the last good copy. Bump the version when the stored shape changes. */
var CACHE_KEY = scopedKey("rinkreport.v5");

/** localStorage key for whether this reader folded the sponsors block. */
var SPONSORS_KEY = scopedKey("rinkreport.sponsorsOpen");

/**
 * Whether this is the staff page: the team folder's staff/index.html sets
 * window.RINK_STAFF before any module runs. The staff page is where the
 * manager's own things live: the Coaches Corner cards, the sealed Coaches
 * report, the gameday post buttons and the ?check diagnostics. Anyone can
 * open it, but the report only unlocks with the staff passphrase.
 * See ARCHITECTURE.md, "The staff page".
 */
var STAFF = !!window.RINK_STAFF;

/** Whether the page was opened with ?check. Staff page only. */
var DIAG = STAFF && /[?&]check\b/.test(location.search);

/**
 * Whether the reader is looking at the manager's view of the numbers: the
 * per-player pages and the hot / warm / cold tags on the Stats tab. On with
 * ?admin on the parents' page, always on the staff page. This is tidiness,
 * not security: those come from the public stats tab either way, and the
 * flag only keeps them out of a parent's way.
 */
var ADMIN = STAFF || /[?&]admin\b/.test(location.search);

/** localStorage key for the staff passphrase, once the report has unlocked with it. */
var PASS_KEY = scopedKey("rinkreport.staffPass");

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
  "monoNumbers",
  "rating",
  "coachNotes",
  "scheduler"
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
 * Whether this is a league page: the Settings tab says "Page type: league".
 *
 * A league page has no home team. It shows the standings (one table per
 * division), the schedule and results, and on the staff page the scheduling
 * tool. Everything that assumes "our team" (the next-game card, the record
 * chip, the Ours filter, the Stats tab, the Coaches Corner cards) stays
 * off, each by its own check. See ARCHITECTURE.md, "League mode".
 *
 * @returns {boolean}
 */
function isLeague() {
  return state.data.config.pageType === "league";
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
 * data: the shaped sheet (config, teams, pools, games, stats, rinks, sponsors,
 *   slots on a league staff page).
 * problems: plain-English warnings for the manager, reset per load.
 * fetchedAt / loading / loadError: fetch status, for the status line.
 * snapshotAt: when the site's own saved copy was taken, if that is what loaded.
 * viewKey: the tab the reader chose (null lets the calendar decide).
 * filterOurs: the All / Ours switch on results. Starts on Ours: a parent
 *   opens the page to find out when their own kid plays next, and the
 *   division's other games are one tap away.
 * statsScope: "all" or "league", the switch on the Stats page.
 * player: the short name whose page is open on the Stats view (?admin), or null.
 * sponsorsOpen: whether the sponsors block is expanded (remembered per device).
 * coachCopied: true for a moment after the Coaches Corner text was copied.
 * coachSealed: the bytes of data/coaches-corner.enc (staff page), or null
 *   when there is no such file.
 * coachNotes: the report's text once it has unlocked, or null.
 * unlockError: what went wrong with the last passphrase typed, or "".
 * notesOpen: whether the Coaches report card is unfolded. Starts folded on
 *   every open; nothing is remembered.
 * diagLog / routeUsed / headerMap / routeTrouble: for ?check.
 * statsNote / rinksNote / sponsorsNote / slotsNote: why an optional tab is missing, for ?check.
 * logoOk: whether logo.png exists (probed once).
 * lastHtml: the last markup written, so a no-op poll is a no-op paint.
 * pollTimer: the pending poll.
 */
var state = {
  data: {
    config: {
      leagueName: "",
      teamName: "",
      pageType: "",
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
    sponsors: null,
    slots: null
  },
  problems: [],
  fetchedAt: null,
  loading: true,
  loadError: "",
  snapshotAt: null,
  viewKey: null,
  filterOurs: true,
  statsScope: "all",
  player: null,
  // Open by default. A reader who folds it keeps it folded on that phone only.
  sponsorsOpen: (function () {
    try {
      return localStorage.getItem(SPONSORS_KEY) !== "0";
    } catch (e) {
      return true;
    }
  })(),
  coachCopied: false,
  coachSealed: null,
  coachNotes: null,
  unlockError: "",
  notesOpen: false,
  diagLog: [],
  routeUsed: [],
  headerMap: [],
  routeTrouble: [],
  statsNote: "",
  rinksNote: "",
  sponsorsNote: "",
  slotsNote: "",
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

export { CFG, CACHE_KEY, SPONSORS_KEY, PASS_KEY, STAFF, ADMIN, DIAG, on, isLeague, offList, state, log, onChange, notify };
