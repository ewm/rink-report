/**
 * Component: schedule and results, grouped by day.
 *
 * resultsHtml(view) leads a season with the games still to come, nearest
 * first, and lists the finished ones underneath, most recent first. An event
 * reads straight forward like a schedule. The order is decided per view, not
 * per game, so it never flips halfway through a weekend. Honors
 * state.filterOurs. See ARCHITECTURE.md, "Results order".
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
  var all = orderedGames(v);
  var filt = state.filterOurs;
  var shown = filt ? all.filter(isOurs) : all;

  // Where the schedule turns into the results feed, in the list as shown.
  var splitAt = v.event ? -1 : firstPlayedIndex(shown);
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

    shown.forEach(function (g, i) {
      if (i === splitAt) {
        if (last !== null) {
          h += "</div>";
        }

        h += '<div class="listsplit">Final scores</div>';
        last = null;
      }

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
 * The games of a view in the order the card lists them.
 *
 * An event reads straight forward: you are in the rink all weekend and what
 * you want is the next thing on the sheet. A season leads with the games
 * still to come, nearest first, so the next one is always at the top of the
 * card, then the finished games underneath.
 *
 * @param {Object} v - The view.
 * @returns {Object[]} The games, in display order.
 */
function orderedGames(v) {
  var all = v.games.slice().sort(bySlot);

  if (v.event) {
    return all;
  }

  var ahead = [];
  var done = [];

  all.forEach(function (g) {
    if (played(g)) {
      done.push(g);
      return;
    }

    ahead.push(g);
  });

  // Finished games read backwards: the score people ask about is the one from
  // the game that just ended.
  done.reverse();

  return ahead.concat(done);
}

/**
 * Where the finished games start in a list already in display order. Returns
 * -1 when there is nothing to divide: no finished games, or no upcoming ones
 * sitting above them.
 *
 * @param {Object[]} games - The games, in display order.
 * @returns {number} Index of the first finished game, or -1.
 */
function firstPlayedIndex(games) {
  for (var i = 0; i < games.length; i++) {
    if (played(games[i])) {
      return i > 0 ? i : -1;
    }
  }

  return -1;
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
