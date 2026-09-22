/**
 * render(): one innerHTML write, composed from components.
 *
 * Every component is a pure function of the store: (view, data) -> HTML
 * string. render() decides which components a view needs, joins them, and
 * skips the DOM write entirely when nothing changed since last time.
 */
import { DIAG, on, state } from "./state.js";
import { buildViews, currentView, leagueView, barKeyFor, teamsInView } from "./model/views.js";
import { rulesFor, standings } from "./model/standings.js";
import { nextGameHtml } from "./ui/nextgame.js";
import { standingsHtml } from "./ui/standings.js";
import { resultsHtml } from "./ui/results.js";
import { eventsHtml, crumbHtml } from "./ui/events.js";
import { statsHtml } from "./ui/stats.js";
import { sponsorsHtml } from "./ui/sponsors.js";
import {
  mastheadHtml,
  viewBarHtml,
  showActiveTab,
  skeleton,
  problemsHtml,
  errorBannerHtml,
  statusHtml,
  footHtml
} from "./ui/frame.js";
import { diagHtml } from "./ui/diagnostics.js";

/**
 * Names the browser tab, the bookmark and the home-screen shortcut after the
 * team, from the Settings tab, instead of the generic "Rink Report".
 *
 * @param {string} teamName
 */
function setTitle(teamName) {
  var title = teamName ? teamName + " | The One Timer" : "Rink Report";

  if (document.title !== title) {
    document.title = title;
  }
}

/**
 * Composes the page for the current view and writes it once. Identical
 * markup to the last write is skipped.
 */
function render() {
  if (DIAG) {
    document.getElementById("app").innerHTML = diagHtml();
    return;
  }

  var cfg = state.data.config;
  var h = "";

  setTitle(cfg.teamName);
  var views = buildViews();
  var v = currentView();

  // The Stats and Events tabs have no games of their own, so the record chip
  // keeps showing the league record rather than going blank.
  var rv = v.stats || v.events ? leagueView(views) : v;
  var rules = rulesFor(rv);
  var st = standings(rv.games, teamsInView(rv), rv.event, rules);
  var rec = null;
  var i;

  for (i = 0; i < st.length; i++) {
    if (st[i].team === cfg.teamName) {
      rec = st[i];
    }
  }

  h += mastheadHtml(v, rec);
  h += errorBannerHtml();

  if (state.loading && !state.data.games.length && !state.loadError) {
    h += skeleton();
  } else {
    if (on("nextGame")) {
      h += nextGameHtml();
    }

    // Sponsors sit under the next game and above the tabs, where they get seen.
    if (on("sponsors")) {
      h += sponsorsHtml();
    }

    h += viewBarHtml(views, barKeyFor(views, v));

    if (v.stats) {
      h += statsHtml();
    } else if (v.events) {
      h += eventsHtml(views);
    } else {
      // An event opened from the list has no button of its own, so show a crumb.
      if (v.event && barKeyFor(views, v) === "events") {
        h += crumbHtml(v);
      }

      h += standingsHtml(v, st, rules);
      h += resultsHtml(v);
    }
  }

  h += statusHtml();
  h += problemsHtml();
  h += footHtml();

  // A quiet poll produces identical markup; rewriting it only costs a repaint.
  if (h === state.lastHtml) {
    return;
  }

  state.lastHtml = h;
  document.getElementById("app").innerHTML = h;
  showActiveTab();
}

export { render };
