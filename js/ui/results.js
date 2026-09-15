/**
 * Component: schedule and results, grouped by day.
 *
 * resultsHtml(view) lists league play newest first once a score is in; an
 * event reads forward like a schedule. The order is decided per view, not per
 * game, so it never flips halfway through a weekend. Honors state.filterOurs.
 * See ARCHITECTURE.md, "Results order".
 */
import { bySlot, isBracket, isExhibition, isOurs, played } from "../model/game.js";
import { directionsFor, icsUrl, ourSeasonGames } from "../model/links.js";
import { on, state } from "../state.js";
import { fmtDate } from "../util/dates.js";
import { esc } from "../util/text.js";

/**
 * The schedule and results card for a view, with the All/Ours filter and
 * the season calendar link.
 *
 * @param {Object} v - The view.
 * @returns {string} HTML.
 */
function resultsHtml(v) {
  var all = v.games.slice().sort(bySlot);

  // A season is a schedule until its first score is in, then a results feed.
  if (!v.event && all.some(played)) {
    all.reverse();
  }

  var filt = state.filterOurs;
  var shown = filt ? all.filter(isOurs) : all;
  var h = '<section class="card"><div class="card-h"><h2>Schedule &amp; results</h2>';

  h +=
    '<span class="seg"><button type="button" data-act="filter" data-v="all" aria-pressed="' +
    !filt +
    '">All</button>' +
    '<button type="button" data-act="filter" data-v="ours" aria-pressed="' +
    filt +
    '">Ours</button></span>';
  h += '</div><div class="card-b">';

  if (!shown.length) {
    h += '<p class="empty">Nothing here yet.</p>';
  } else {
    var last = null;

    shown.forEach(function (g) {
      if (g.date !== last) {
        if (last !== null) {
          h += "</div>";
        }

        h += '<div class="daygroup"><div class="dayhead">' + esc(fmtDate(g.date)) + "</div>";
        last = g.date;
      }

      h += gameRow(g);
    });

    h += "</div>";

    // Every game we still have to get to, as one calendar file built in the browser.
    var mine = on("seasonCalendar") ? ourSeasonGames() : [];

    if (mine.length) {
      h +=
        '<p class="foot"><a class="seasoncal" href="' +
        esc(icsUrl(mine)) +
        '" download="' +
        esc(fileNameFor()) +
        '">Add our remaining ' +
        mine.length +
        " game" +
        (mine.length === 1 ? "" : "s") +
        " to your calendar</a> (.ics, opens in Apple, Google or Outlook)</p>";
    }
  }

  return h + "</div></section>";
}

/**
 * File name for the season calendar download, from the team name.
 *
 * @returns {string}
 */
function fileNameFor() {
  var t = state.data.config.teamName || "schedule";

  return t.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-schedule.ics";
}

/**
 * One game row: both sides with scores, then the result tag, time, rink and
 * any bracket or scrimmage tag.
 *
 * @param {Object} g - The game.
 * @returns {string} HTML.
 */
function gameRow(g) {
  var us = state.data.config.teamName;
  var done = played(g);
  var aName = g.away || "TBD";
  var hName = g.home || "TBD";
  var h = '<div class="game"><div class="teams">';

  h +=
    '<div class="side' +
    (done && g.as < g.hs ? " lost" : "") +
    (us && g.away === us ? " ours" : "") +
    '"><span class="nm">' +
    esc(aName) +
    '</span><span class="sc">' +
    (done ? g.as : "") +
    "</span></div>";
  h +=
    '<div class="side' +
    (done && g.hs < g.as ? " lost" : "") +
    (us && g.home === us ? " ours" : "") +
    '"><span class="nm">' +
    esc(hName) +
    '</span><span class="sc">' +
    (done ? g.hs : "") +
    "</span></div>";
  h += '</div><div class="meta">';

  // Time and rink stay on the row after a score goes in; finished games still get asked about.
  if (done) {
    if (us && isOurs(g)) {
      var o = g.home === us ? g.hs : g.as;
      var t = g.home === us ? g.as : g.hs;

      h +=
        '<span class="tag ' +
        (o > t ? "w" : o < t ? "l" : "") +
        '">' +
        (o > t ? "W" : o < t ? "L" : "T") +
        "</span>";
    } else {
      h += '<span class="tag">FINAL</span>';
    }

    h += "<br>";
  }

  h += '<span class="tm">' + esc(g.time || "TBD") + "</span>";

  // The rink name is the directions link when the Rinks tab knows its address.
  if (g.rink) {
    var dir = done || !on("directions") ? "" : directionsFor(g);

    h +=
      "<br>" +
      (dir
        ? '<a class="rinklink" href="' +
          esc(dir) +
          '" target="_blank" rel="noopener">' +
          esc(g.rink) +
          "</a>"
        : esc(g.rink));
  }

  // Tag uncounted games in the manager's own wording, so a win that did not move the record
  // explains itself.
  if (isBracket(g)) {
    h += '<br><span class="tag">BRACKET</span>';
  } else if (isExhibition(g)) {
    h += '<br><span class="tag">' + esc(String(g.type).toUpperCase()) + "</span>";
  }

  return h + "</div></div>";
}

export { resultsHtml };
