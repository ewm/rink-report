/**
 * The entry point: boot, the load loop, the poll, the cache, and input.
 *
 * Boot: paint from cache, fetch every tab, shape, render, poll. Input is one
 * delegated click handler (data-act attributes) and the visibility change
 * that refetches when a phone comes back.
 * See ARCHITECTURE.md, "Module map" and "Polling".
 */
import { CFG, CACHE_KEY, on, state, log, onChange, notify } from "./state.js";
import { render } from "./render.js";
import { getCSV } from "./sheet/routes.js";
import { shapeSettings } from "./shape/settings.js";
import { shapeTeams } from "./shape/teams.js";
import { shapeGames } from "./shape/games.js";
import { shapeStats } from "./shape/stats.js";
import { shapeRinks } from "./shape/rinks.js";
import { shapeSponsors } from "./shape/sponsors.js";
import { played } from "./model/game.js";
import { tickFresh } from "./ui/frame.js";
import { ago, timeKey, todayISO } from "./util/dates.js";
import { bare, norm } from "./util/text.js";

onChange(render);

/**
 * The three tabs the page works without. Each names the feature switch that
 * decides whether it is fetched, the shaper, and the state field for its note.
 */
var OPTIONAL_TABS = [
  { which: "stats", feature: "stats", shape: shapeStats, note: "statsNote" },
  { which: "rinks", feature: "directions", shape: shapeRinks, note: "rinksNote" },
  { which: "sponsors", feature: "sponsors", shape: shapeSponsors, note: "sponsorsNote" }
];

/**
 * Reads an optional tab. Resolves to null when the tab is switched off, not
 * configured, or fails to read; the page carries on without it.
 *
 * @param {{which: string, feature: string, note: string}} tab
 * @returns {Promise<string[][]|null>}
 */
function optionalRead(tab) {
  var configured = (CFG.tabs && CFG.tabs[tab.which]) || (CFG.gids && CFG.gids[tab.which]);

  if (!on(tab.feature) || !configured) {
    return Promise.resolve(null);
  }

  return getCSV(tab.which).catch(function (e) {
    state[tab.note] = e && e.message ? e.message : "could not be read";
    log("  " + tab.which + ": giving up, the tab is optional");

    return null;
  });
}

/**
 * Snaps the Settings tab's "Our team" onto the Teams list the same way
 * schedule names are snapped (case, spacing, aliases), and warns when it
 * still matches nothing. Every "ours" feature compares names exactly.
 *
 * @param {Object} cfg - The shaped settings.
 * @param {{list: string[], alias: Object}} tm - The shaped teams.
 */
function snapTeamName(cfg, tm) {
  if (!cfg.teamName || !tm.list.length) {
    return;
  }

  var known = bare();

  for (var i = 0; i < tm.list.length; i++) {
    known[norm(tm.list[i])] = tm.list[i];
  }

  for (var k in tm.alias) {
    if (Object.prototype.hasOwnProperty.call(tm.alias, k) && !known[k]) {
      known[k] = tm.alias[k];
    }
  }

  var hit = known[norm(cfg.teamName)];

  if (hit) {
    cfg.teamName = hit;
  } else {
    state.problems.push(
      'Our team is "' +
        cfg.teamName +
        '" on the Settings tab, but no team on the Teams tab is spelled that way. ' +
        "The record chip, the Ours switch and the W/L tags need the exact name."
    );
  }
}

/**
 * Fetches every tab, shapes the result into state.data, renders, and arms
 * the next poll. A schedule that comes back empty keeps the last good copy.
 */
function load() {
  state.loading = true;
  state.loadError = "";
  state.problems = [];
  state.routeUsed = [];
  state.headerMap = [];
  state.routeTrouble = [];
  state.statsNote = "";
  state.rinksNote = "";
  state.sponsorsNote = "";

  // A page that already has content keeps it while the refetch runs.
  if (!state.data.games.length) {
    render();
  } else {
    tickFresh();
  }

  var reads = [getCSV("settings"), getCSV("teams"), getCSV("schedule")].concat(
    OPTIONAL_TABS.map(optionalRead)
  );

  Promise.all(reads)
    .then(function (res) {
      var cfg = shapeSettings(res[0]);
      var tm = shapeTeams(res[1]);
      var prev = state.data;
      var next = {
        config: cfg,
        teams: tm.list,
        pools: tm.pools,
        mhr: tm.mhr,
        games: [],
        stats: null,
        rinks: null,
        sponsors: null
      };

      snapTeamName(cfg, tm);

      state.data = next; // shapeGames reads state.data.config
      next.games = shapeGames(res[2], tm.list, tm.alias);

      // A null read keeps the last good copy; a tab read but empty is dropped.
      OPTIONAL_TABS.forEach(function (tab, i) {
        var rows = res[3 + i];

        if (rows) {
          next[tab.which] = tab.shape(rows);
        } else if (rows === null && prev[tab.which]) {
          next[tab.which] = prev[tab.which];
          log("  " + tab.which + ": keeping the previous copy");
        }
      });

      if (!next.games.length && prev.games.length) {
        state.data = prev;
        state.problems.push(
          "The Schedule tab came back empty, so the last good copy is still showing."
        );
      }

      if (state.routeTrouble.length) {
        state.problems.push(
          "The tab IDs in index.html belong to a different sheet, so the page is falling back to the slower reader. " +
            "That fallback is what blanks headers. Open each tab in the sheet, copy the number after gid= in the address bar, and paste it into the gids line in index.html."
        );
      }

      return noteSnapshot();
    })
    .then(function () {
      state.fetchedAt = Date.now();
      state.loading = false;

      saveCache();
      render();
      schedulePoll();
    })
    .catch(function (e) {
      state.loading = false;
      state.loadError = e && e.message ? e.message : "Unknown error";
      log("FAILED: " + state.loadError);
      render();
      schedulePoll();
    });
}

/**
 * When any tab came from the site's own saved copy (Google unreachable),
 * reads the copy's timestamp so the page can say how old it is.
 *
 * @returns {Promise}
 */
function noteSnapshot() {
  state.snapshotAt = null;

  var used = state.routeUsed.some(function (r) {
    return /=site snapshot$/.test(r);
  });

  if (!used) {
    return Promise.resolve();
  }

  return fetch("data/updated.txt", { cache: "no-store" })
    .then(function (r) {
      return r.ok ? r.text() : "";
    })
    .then(function (t) {
      var ts = Date.parse(t.trim());

      state.snapshotAt = isNaN(ts) ? 0 : ts;
    })
    .catch(function () {
      state.snapshotAt = 0;
    });
}

/* ---- cache: the last good copy, so the page paints before the fetch ---- */

/** Saves state.data and the fetch time to localStorage. */
function saveCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: state.fetchedAt, data: state.data }));
  } catch (e) {}
}

/**
 * Restores the last good copy, if this phone has one.
 *
 * @returns {boolean} Whether anything was restored.
 */
function loadCache() {
  try {
    var raw = localStorage.getItem(CACHE_KEY);

    if (!raw) {
      return false;
    }

    var o = JSON.parse(raw);

    if (!o || !o.data) {
      return false;
    }

    state.data = o.data;
    state.data.pools = state.data.pools || {};
    state.fetchedAt = o.at || null;
    log("rendered from local cache saved " + ago(state.fetchedAt));

    return true;
  } catch (e) {
    return false;
  }
}

/* ---- poll: fast during a game, slow otherwise, never while hidden ---- */

/**
 * Whether a game is being played right now: today, not yet scored, and
 * within 20 minutes before face-off to 200 minutes after. A game with no
 * face-off time counts as on all day.
 *
 * @returns {boolean}
 */
function gameOnNow() {
  var today = todayISO();
  var d = new Date();
  var mins = d.getHours() * 60 + d.getMinutes();

  for (var i = 0; i < state.data.games.length; i++) {
    var g = state.data.games[i];

    if (g.date !== today || played(g)) {
      continue;
    }

    var start = timeKey(g.time);

    if (start === 9999 || (mins >= start - 20 && mins <= start + 200)) {
      return true;
    }
  }

  return false;
}

/**
 * Milliseconds until the next poll: refreshSeconds during a game, eight
 * times that otherwise, with +/- 25% jitter so phones never line up.
 *
 * @returns {number}
 */
function pollDelay() {
  var fast = Math.max(60, CFG.refreshSeconds || 120) * 1000;
  var base = gameOnNow() ? fast : fast * 8;

  return Math.round(base * (0.75 + Math.random() * 0.5));
}

/** Arms the next poll. A hidden tab re-arms without fetching. */
function schedulePoll() {
  if (state.pollTimer) {
    clearTimeout(state.pollTimer);
  }

  state.pollTimer = setTimeout(function () {
    if (document.hidden) {
      schedulePoll();
      return;
    }

    load();
  }, pollDelay());
}

/* ---- input ---- */

/** One delegated click handler: every button carries a data-act attribute. */
document.addEventListener("click", function (e) {
  var el = e.target.closest ? e.target.closest("[data-act]") : null;

  if (!el) {
    return;
  }

  var a = el.getAttribute("data-act");

  if (a === "filter") {
    state.filterOurs = el.getAttribute("data-v") === "ours";
    render();
  }

  if (a === "statsscope") {
    state.statsScope = el.getAttribute("data-v");
    render();
  }

  if (a === "view") {
    state.viewKey = el.getAttribute("data-v");
    render();

    try {
      window.scrollTo(0, 0);
    } catch (err) {}
  }

  if (a === "sponsors") {
    state.sponsorsOpen = !state.sponsorsOpen;

    try {
      localStorage.setItem("rinkreport.sponsorsOpen", state.sponsorsOpen ? "1" : "0");
    } catch (err) {}

    render();
  }

  if (a === "refresh") {
    load();
  }
});

/** A phone coming back after more than one refresh interval refetches at once. */
document.addEventListener("visibilitychange", function () {
  var fast = Math.max(60, CFG.refreshSeconds || 120) * 1000;

  if (!document.hidden && state.fetchedAt && Date.now() - state.fetchedAt > fast) {
    load();
  }
});

/** Keeps the "updated N ago" line honest. */
setInterval(function () {
  if (!document.hidden) {
    tickFresh();
  }
}, 30000);

/**
 * Probes the optional logo.png once at start-up, rather than on every render,
 * so the masthead text never shifts sideways.
 */
(function probeCrest() {
  try {
    var img = new Image();

    img.onload = function () {
      if (img.naturalWidth > 0) {
        state.logoOk = true;
        notify();
      }
    };

    img.onerror = function () {
      state.logoOk = false;
    };

    img.src = "logo.png";
  } catch (e) {
    state.logoOk = false;
  }
})();

loadCache();
render();
load();

// Exported for the test suite only.
export { gameOnNow, pollDelay };
