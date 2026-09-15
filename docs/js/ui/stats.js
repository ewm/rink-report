/**
 * Component: the Stats page.
 *
 * statsHtml() renders the skater table (points, goals, number) and the
 * goalie table from state.data.stats. The sheet does the adding; the one
 * thing figured here is GAA, from the sheet's own GA and minutes and the
 * league's game length. See ARCHITECTURE.md, "Stats".
 */
import { gaaFromLog, goalieLogFor } from "../model/gamelog.js";
import { state } from "../state.js";
import { esc } from "../util/text.js";

/**
 * A stat for the table: whole numbers plain, otherwise one decimal (a
 * minute-and-a-half minor prints as 1.5).
 *
 * @param {number|null} n
 * @returns {string}
 */
function fmtNum(n) {
  if (n === null || n === undefined) {
    return "—";
  }

  return Math.round(n) === n ? String(n) : String(Math.round(n * 10) / 10);
}

/**
 * Goals against average, two places: 2.86.
 *
 * @param {number|null} n
 * @returns {string}
 */
function fmtGaa(n) {
  if (n === null || n === undefined) {
    return "—";
  }

  return (Math.round(n * 100) / 100).toFixed(2);
}

/**
 * A goalie's GAA: goals against per full game, not per 60 minutes.
 *
 * Sixty is the pro number and it is wrong for a youth game. Three 15 minute
 * periods is a 45 minute game, so a goalie who gives up two in a full game
 * reads 2.00, which is what a parent expects.
 *
 * The game log is used when it is there, because it knows which game each
 * appearance was and therefore how long that game ran. Without a log the
 * season totals are figured against the league's own length, which is right
 * until a tournament plays shorter periods.
 *
 * @param {Object} g - A goalie row.
 * @returns {number|null} GAA, or null when it cannot be figured.
 */
function gaaFor(g) {
  var logged = gaaFromLog(goalieLogFor(g.name));

  if (logged !== null) {
    return logged;
  }

  var full = state.data.config.gameMinutes;

  if (g.min > 0 && g.ga !== null && g.ga !== undefined && full > 0) {
    return (g.ga * full) / g.min;
  }

  return g.gaa === undefined ? null : g.gaa;
}

/**
 * Whether any game on the schedule sets its own period length.
 *
 * Only then is it worth telling a reader that the number under the table is
 * not the only one in play.
 *
 * @returns {boolean}
 */
function mixedLengths() {
  var games = state.data.games || [];

  for (var i = 0; i < games.length; i++) {
    if (games[i].mins && games[i].mins !== state.data.config.gameMinutes) {
      return true;
    }
  }

  return false;
}

/**
 * The Skaters and In net cards, or "" when there are no stats.
 *
 * @returns {string} HTML.
 */
function statsHtml() {
  var s = state.data.stats;
  var h = "";
  var gp = 0;
  var i;

  if (!s) {
    return "";
  }

  for (i = 0; i < s.skaters.length; i++) {
    if (s.skaters[i].gp > gp) {
      gp = s.skaters[i].gp;
    }
  }

  var through = gp ? "Through " + gp + " game" + (gp === 1 ? "" : "s") : "Season";

  if (s.skaters.length) {
    h +=
      '<section class="card skaters"><div class="card-h"><h2>Skaters</h2><span class="eyebrow">' +
      esc(through) +
      '</span></div><div class="card-b">';
    h +=
      '<div class="tablewrap"><table><thead><tr><th scope="col">Player</th><th scope="col">GP</th>' +
      '<th scope="col">G</th><th scope="col">A</th><th scope="col">Pts</th><th scope="col">PIM</th></tr></thead><tbody>';

    s.skaters.forEach(function (p) {
      h +=
        '<tr><td><span class="rank">' +
        (p.no !== null ? esc(fmtNum(p.no)) : "") +
        "</span>" +
        esc(p.name) +
        "</td>" +
        "<td>" +
        fmtNum(p.gp) +
        "</td><td>" +
        fmtNum(p.g) +
        "</td><td>" +
        fmtNum(p.a) +
        '</td><td class="pts">' +
        fmtNum(p.pts) +
        "</td><td>" +
        fmtNum(p.pim) +
        "</td></tr>";
    });

    h += "</tbody></table></div>";
    h += '<p class="foot">Sorted by points, then goals. PIM counts each 1:30 minor as 1.5.</p>';
    h += "</div></section>";
  }

  if (s.goalies.length) {
    h +=
      '<section class="card"><div class="card-h"><h2>In net</h2><span class="eyebrow">' +
      esc(through) +
      '</span></div><div class="card-b">';
    h +=
      '<div class="tablewrap"><table><thead><tr><th scope="col">Goalie</th><th scope="col">GP</th><th scope="col">Min</th>' +
      '<th scope="col">GA</th><th scope="col">GAA</th><th scope="col">SO</th><th scope="col">W</th><th scope="col">L</th></tr></thead><tbody>';

    // Saves and save percentage are left out on purpose: most youth scoresheets never record
    // shots. See ARCHITECTURE.md, "Stats".
    s.goalies.forEach(function (g) {
      h +=
        '<tr><td><span class="rank">' +
        (g.no !== null ? esc(fmtNum(g.no)) : "") +
        "</span>" +
        esc(g.name) +
        "</td>" +
        "<td>" +
        fmtNum(g.gp) +
        "</td><td>" +
        fmtNum(g.min) +
        "</td><td>" +
        fmtNum(g.ga) +
        '</td><td class="pts">' +
        fmtGaa(gaaFor(g)) +
        "</td><td>" +
        fmtNum(g.so) +
        "</td><td>" +
        fmtNum(g.w) +
        "</td><td>" +
        fmtNum(g.l) +
        "</td></tr>";
    });

    h += "</tbody></table></div>";
    h +=
      '<p class="foot">GAA is goals against per full game of ' +
      fmtNum(state.data.config.gameMinutes) +
      " minutes" +
      (mixedLengths() ? ", and of whatever the Schedule tab says for an event that runs a different clock" : "") +
      '. Saves are not listed because most scoresheets do not record shots.</p>';
    h += "</div></section>";
  }

  return h;
}

export { statsHtml };
