/**
 * Reading one tab of the Google Sheet.
 *
 * Routes, best first: the raw export by gid (never re-types a column), the
 * gviz tab-name reader (does), then the site's own saved copy in data/ for
 * when Google cannot be reached at all. Three tries per route with backoff,
 * and a 15-second limit on each try so a stalled connection cannot hang the
 * page. Returns parsed rows.
 * See ARCHITECTURE.md, "Why two read routes" and "The saved copy".
 */
import { CFG, log, state } from "../state.js";
import { parseCSV } from "../util/csv.js";

/** Milliseconds a single try may take before it counts as failed. */
var TRY_LIMIT = 15000;

/** Delay before each try of a route, in ms; the length is the try count. */
var BACKOFF = [0, 500, 1500];

/** Tabs the page works fine without. */
var OPTIONAL = ["stats", "rinks", "sponsors"];

/**
 * Every way of reading one tab, best first.
 *
 * @param {string} which - Tab role: "settings", "teams", "schedule", ...
 * @returns {{how: string, url: string}[]}
 */
function routesFor(which) {
  var id = encodeURIComponent(CFG.sheetId || "");
  var out = [];
  var gid = (CFG.gids || {})[which];

  if (gid) {
    out.push({
      how: "raw export",
      url:
        "https://docs.google.com/spreadsheets/d/" +
        id +
        "/export?format=csv&gid=" +
        encodeURIComponent(gid)
    });
  }

  var tab = (CFG.tabs || {})[which] || which;

  out.push({
    how: "tab name",
    url:
      "https://docs.google.com/spreadsheets/d/" +
      id +
      "/gviz/tq?tqx=out:csv&headers=0&sheet=" +
      encodeURIComponent(tab)
  });

  out.push({ how: "site snapshot", url: "data/" + which + ".csv" });

  return out;
}

/**
 * One cache-busted fetch of a URL, limited to TRY_LIMIT. Rejects on a
 * non-2xx status or when the body is HTML (an unshared sheet answers with a
 * sign-in page).
 *
 * @param {string} url
 * @returns {Promise<string>} The body text.
 */
function once(url) {
  var u = url + (url.indexOf("?") === -1 ? "?" : "&") + "_=" + Date.now();
  var ctl = typeof AbortController === "function" ? new AbortController() : null;
  var timer = ctl
    ? setTimeout(function () {
        ctl.abort();
      }, TRY_LIMIT)
    : null;

  return fetch(u, { cache: "no-store", credentials: "omit", signal: ctl ? ctl.signal : undefined })
    .then(function (r) {
      if (!r.ok) {
        throw new Error("HTTP " + r.status);
      }

      return r.text();
    })
    .then(function (t) {
      if (/^\s*</.test(t)) {
        throw new Error("got a web page, not data — the sheet may not be shared publicly");
      }

      return t;
    })
    .catch(function (e) {
      if (e && e.name === "AbortError") {
        throw new Error("no answer after " + TRY_LIMIT / 1000 + " seconds");
      }

      throw e;
    })
    .finally(function () {
      if (timer) {
        clearTimeout(timer);
      }
    });
}

/**
 * A promise that resolves after a delay.
 *
 * @param {number} ms
 * @returns {Promise}
 */
function wait(ms) {
  return new Promise(function (res) {
    setTimeout(res, ms);
  });
}

/**
 * Reads one tab, trying each route up to BACKOFF.length times before the
 * next. Giving up on the raw export for a required tab marks
 * state.routeTrouble, because that is what a wrong gid looks like.
 *
 * @param {string} which - Tab role.
 * @returns {Promise<string[][]>} Parsed rows; rejects with the last error.
 */
function getCSV(which) {
  var routes = routesFor(which);
  var ri = 0;
  var ai = 0;
  var lastErr = null;

  /**
   * Tries the current route once, then moves on to the next try or route.
   *
   * @returns {Promise<string[][]>}
   */
  function attempt() {
    if (ri >= routes.length) {
      throw lastErr || new Error("no route succeeded");
    }

    var route = routes[ri];

    return wait(BACKOFF[ai])
      .then(function () {
        return once(route.url);
      })
      .then(function (t) {
        log(
          "  " +
            which +
            " ok via " +
            route.how +
            (ai ? " (try " + (ai + 1) + ")" : "") +
            ", " +
            t.length +
            " bytes"
        );
        state.routeUsed.push(which + "=" + route.how);

        return parseCSV(t);
      })
      .catch(function (e) {
        lastErr = new Error(which + " — " + route.how + ": " + (e && e.message ? e.message : e));
        log(
          "  " +
            which +
            " failed via " +
            route.how +
            " try " +
            (ai + 1) +
            ": " +
            (e && e.message ? e.message : e)
        );

        ai++;

        if (ai >= BACKOFF.length) {
          // An optional tab may simply not exist yet, so its export failing
          // says nothing about whether the other tab IDs are right.
          if (route.how === "raw export" && OPTIONAL.indexOf(which) === -1) {
            state.routeTrouble.push(which);
          }

          ai = 0;
          ri++;
        }

        return attempt();
      });
  }

  log("fetch " + which + " (" + routes.length + " route" + (routes.length === 1 ? "" : "s") + ")");

  return Promise.resolve().then(attempt);
}

export { getCSV };
