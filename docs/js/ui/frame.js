/**
 * Components that frame every view: the masthead, the view bar, the banners,
 * the status line and the footer.
 *
 * tickFresh() patches the "updated N ago" line in place, without a render,
 * because a full repaint every 30 seconds was a visible flash.
 */
import { STAFF, isLeague, state } from "../state.js";
import { ago } from "../util/dates.js";
import { esc } from "../util/text.js";

/**
 * The Check The Rink mark for the All teams row. Inline so it takes the
 * row's ink color in light and dark. Same drawing as /logo.svg.
 */
var HOME_LOGO =
  '<svg class="home-logo" viewBox="6 22 88 56" aria-hidden="true" focusable="false">' +
  '<defs><mask id="ctr-k" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect width="100" height="100" fill="#fff"/><path d="M19 30v40M81 30v40" stroke="#000" stroke-width="3"/><path d="M33 50l11 11 24-24" fill="none" stroke="#000" stroke-width="10" stroke-linecap="square"/></mask></defs><rect x="6" y="22" width="88" height="56" rx="22" fill="currentColor" mask="url(#ctr-k)"/>' +
  "</svg>";

/* ---- masthead ---- */

/**
 * The navy masthead for one view: kicker, team name and record chip. The
 * kicker names the competition on screen so the chip beside it cannot be
 * misread; with no "our team" set the competition becomes the headline.
 *
 * @param {Object} v - The view being shown.
 * @param {Object|null} rec - Our standings row, for the record chip.
 * @returns {string} HTML.
 */
function mastheadHtml(v, rec) {
  var cfg = state.data.config;
  var h = '<header class="masthead">';

  if (state.logoOk) {
    h += '<img class="crest" src="logo.png" alt="">';
  }

  var kicker;
  var headline;
  var busy = state.loading;

  if (cfg.teamName) {
    kicker = v.stats
      ? "Player stats"
      : v.events
        ? v.label
        : v.event
          ? v.label
          : cfg.leagueName || (busy ? "Loading" : "League tracker");
    headline = cfg.teamName;
  } else {
    kicker = busy ? "Loading" : v.stats ? "Player stats" : v.events ? v.label : "Live standings";
    headline = v.event ? v.label : cfg.leagueName || "Check The Rink";
  }

  // The staff page says so in the kicker, so nobody mistakes it for the
  // parents' page when both are open.
  if (STAFF) {
    kicker += " \u00b7 Staff";
  }

  h += '<div class="txt"><div class="eyebrow">' + esc(kicker) + "</div>";
  h += "<h1>" + esc(headline) + "</h1></div>";

  // The record is the loudest figure in the masthead: wins, losses and ties
  // big, points under it as a label.
  if (rec && rec.gp) {
    h +=
      '<div class="record"><b>' +
      rec.w +
      "-" +
      rec.l +
      "-" +
      rec.t +
      '</b><span class="eyebrow">' +
      rec.pts +
      " PTS</span></div>";
  }

  return h + "</header>";
}

/* ---- view bar ---- */

/**
 * The bar of view buttons, or "" when there is only one view to show.
 *
 * @param {Object[]} views - The bar views.
 * @param {string} curKey - Key of the active view.
 * @returns {string} HTML.
 */
function viewBarHtml(views, curKey) {
  if (views.length < 2) {
    return "";
  }

  var h = '<nav class="viewbar" aria-label="Competition">';

  views.forEach(function (v) {
    h +=
      '<button type="button" data-act="view" data-v="' +
      esc(v.key) +
      '" aria-pressed="' +
      (v.key === curKey) +
      '">' +
      esc(v.tab) +
      "</button>";
  });

  return h + "</nav>";
}

/**
 * Centers the active tab in a bar that scrolls, so the tab you are on is the
 * one you can see.
 */
function showActiveTab() {
  try {
    var b = document.querySelector('.viewbar button[aria-pressed="true"]');

    if (!b) {
      return;
    }

    var bar = b.parentNode;

    if (bar.scrollWidth <= bar.clientWidth) {
      return;
    }

    bar.scrollLeft = Math.max(0, b.offsetLeft - (bar.clientWidth - b.offsetWidth) / 2);
  } catch (e) {}
}

/* ---- banners, status, footer ---- */

/**
 * The placeholder card shown before the first load.
 *
 * @returns {string} HTML.
 */
function skeleton() {
  var h = '<section class="card"><div class="card-b">';

  for (var i = 0; i < 5; i++) {
    h += '<div class="skel" style="margin:10px 0;width:' + (60 + ((i * 13) % 35)) + '%"></div>';
  }

  return h + "</div></section>";
}

/**
 * The "Updated N ago" wording for the status line.
 *
 * @returns {string}
 */
function freshText() {
  return state.fetchedAt
    ? "Updated " + ago(state.fetchedAt)
    : state.loading
      ? "Loading…"
      : "Not loaded";
}

/** Re-words the status line in place instead of repainting the page. */
function tickFresh() {
  var el = document.getElementById("rr-fresh");

  if (el) {
    el.textContent = freshText();
  }
}

/**
 * The bar of manager warnings, or "" when there are none. Shows six: later
 * warnings are the ones nobody has noticed yet.
 *
 * @returns {string} HTML.
 */
function problemsHtml() {
  var p = state.problems;

  if (!p.length) {
    return "";
  }

  return (
    '<div class="banner"><b>Things to fix on the sheet</b><ul>' +
    p
      .slice(0, 6)
      .map(function (x) {
        return "<li>" + esc(x) + "</li>";
      })
      .join("") +
    "</ul>" +
    (p.length > 6
      ? "and " + (p.length - 6) + " more" + (STAFF ? ' — <a href="' + checkHref() + '">Setup check</a> lists them all' : "")
      : "") +
    "</div>"
  );
}

/**
 * The banner shown when the last fetch failed, or when the page is showing
 * the site's own saved copy because Google could not be reached, or "".
 *
 * @returns {string} HTML.
 */
function errorBannerHtml() {
  if (state.loadError) {
    return (
      '<div class="banner"><b>Can’t reach the schedule right now.</b> ' +
      esc(state.loadError) +
      (state.fetchedAt ? " Showing what was here as of " + esc(ago(state.fetchedAt)) + "." : "") +
      "</div>"
    );
  }

  if (state.snapshotAt !== null) {
    var when = state.snapshotAt ? " from " + esc(new Date(state.snapshotAt).toLocaleString()) : "";

    return (
      '<div class="banner"><b>Google Sheets can’t be reached right now.</b> Showing the saved copy' +
      when +
      ". Scores entered since then are not in it yet.</div>"
    );
  }

  return "";
}

/**
 * The status line: freshness and the Refresh button.
 *
 * @returns {string} HTML.
 */
function statusHtml() {
  return (
    '<div class="status"><span id="rr-fresh">' +
    esc(freshText()) +
    '</span><button type="button" data-act="refresh">Refresh</button></div>'
  );
}

/**
 * The housekeeping line at the foot of the page.
 *
 * @returns {string} HTML.
 */
function footHtml() {
  var h = "";

  // On Check The Rink every team page sits in a folder under the landing
  // page. theme.js sets CHECK_THE_RINK_HOME once ../teams.js has loaded.
  if (window.CHECK_THE_RINK_HOME) {
    h += '<a class="home" href="../"><span aria-hidden="true">&larr;</span>' + HOME_LOGO + " All teams</a>";
  }

  h +=
    '<p class="foot">Scores are entered by the ' +
    (isLeague() ? "league" : "team") +
    " after each game.";

  // The setup check is a staff thing; the parents' page has no link to it.
  if (STAFF) {
    h += '<br><a href="' + checkHref() + '">Setup check</a>';
  }

  return h + "<br>&copy; 2026 Minted Moose LLC. All rights reserved.</p>";
}

/**
 * The address of this page's setup check. Spelled out from the path
 * because the staff page carries a <base> tag, which would send a bare
 * "?check" to the parents' page instead.
 *
 * @returns {string}
 */
function checkHref() {
  return location.pathname + "?check";
}

export {
  mastheadHtml,
  viewBarHtml,
  showActiveTab,
  skeleton,
  tickFresh,
  problemsHtml,
  errorBannerHtml,
  statusHtml,
  footHtml
};
