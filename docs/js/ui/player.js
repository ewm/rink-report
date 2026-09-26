/**
 * Component: one player's page, on ?admin only.
 *
 * playerHtml(name) draws a header with the season numbers, a game-by-game
 * table, and a few season notes worked out from the games. Everything comes
 * from model/player.js; the header numbers are the sheet's own totals so the
 * page agrees with the Stats table it was opened from.
 * See ARCHITECTURE.md, "Player pages".
 */
import {
  findPlayer,
  goalieGames,
  goalieSummary,
  skaterGames,
  skaterSummary
} from "../model/player.js";
import { gaaFromLog, goalieLogFor, recordFromLog } from "../model/gamelog.js";
import { formBadge, goalieForm, skaterForm } from "../model/form.js";
import { state } from "../state.js";
import { fmtDate } from "../util/dates.js";
import { esc } from "../util/text.js";

/**
 * A stat: whole numbers plain, otherwise one decimal.
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
 * Two places: 2.86.
 *
 * @param {number|null} n
 * @returns {string}
 */
function fmtTwo(n) {
  if (n === null || n === undefined) {
    return "—";
  }

  return (Math.round(n * 100) / 100).toFixed(2);
}

/**
 * One number tile for the header strip.
 *
 * @param {string} label
 * @param {string} value - Already formatted.
 * @param {boolean} [lead] - Whether this is the tile to read first.
 * @returns {string} HTML.
 */
function tile(label, value, lead) {
  return (
    '<div class="ptile' +
    (lead ? " lead" : "") +
    '"><b>' +
    esc(value) +
    "</b><span>" +
    esc(label) +
    "</span></div>"
  );
}

/**
 * One row of the season notes.
 *
 * @param {string} label
 * @param {string} value
 * @returns {string} HTML.
 */
function note(label, value) {
  return "<div><dt>" + esc(label) + "</dt><dd>" + esc(value) + "</dd></div>";
}

/**
 * The result cell: a W/L/T tag and the score from our side, or a dash when
 * the schedule has no score for the game.
 *
 * @param {Object} line - A game line.
 * @returns {string} HTML.
 */
function resultCell(line) {
  if (!line.result) {
    return "—";
  }

  var tag = '<span class="tag ' + (line.result === "W" ? "w" : line.result === "L" ? "l" : "") + '">' + line.result + "</span>";

  if (line.gf === null || line.gf === undefined) {
    return tag;
  }

  return tag + " " + line.gf + "-" + line.ga;
}

/**
 * The opponent cell: who, then the date and where under it.
 *
 * @param {Object} line - A game line.
 * @returns {string} HTML.
 */
function opponentCell(line) {
  var where = line.home === null ? "" : line.home ? "vs " : "at ";
  var sub = fmtDate(line.date);

  if (line.event) {
    sub += " · " + line.event;
  } else if (line.unscheduled) {
    sub += " · not on the schedule";
  }

  return where + esc(line.opponent) + '<br><small class="psub">' + esc(sub) + "</small>";
}

/**
 * "2 G, 1 A vs Southtown Stars, Sun Sep 13".
 *
 * @param {Object} line - A skater game line.
 * @returns {string}
 */
function bestSkaterGame(line) {
  var parts = [];

  if (line.g) {
    parts.push(line.g + " G");
  }

  if (line.a) {
    parts.push(line.a + " A");
  }

  return parts.join(", ") + " " + (line.home === false ? "at " : "vs ") + line.opponent + ", " + fmtDate(line.date);
}

/**
 * A skater's page.
 *
 * @param {Object} p - The totals row.
 * @returns {string} HTML.
 */
function skaterPage(p) {
  var lines = skaterGames(p.name);
  var sum = skaterSummary(lines);
  var form = skaterForm()[p.name];
  var ppg = p.gp > 0 ? (p.pts || 0) / p.gp : null;
  var h = "";

  h += '<section class="card player"><div class="phead">';
  h += '<span class="pno">' + (p.no !== null ? esc(fmtNum(p.no)) : "") + "</span>";
  h += "<h2>" + esc(p.name) + "</h2>";

  if (form) {
    h += formBadge(form.level, form.points + " point" + (form.points === 1 ? "" : "s") + " in the last 5 games");
  }

  h += '<span class="eyebrow">Skater</span></div>';

  h += '<div class="ptiles">';
  h += tile("GP", fmtNum(p.gp));
  h += tile("G", fmtNum(p.g));
  h += tile("A", fmtNum(p.a));
  h += tile("Pts", fmtNum(p.pts), true);
  h += tile("PIM", fmtNum(p.pim));
  h += tile("Pts/GP", ppg === null ? "—" : fmtTwo(ppg));
  h += "</div></section>";

  h += '<section class="card"><div class="card-h"><h2>Game by game</h2><span class="eyebrow">Newest first</span></div><div class="card-b">';
  h += '<div class="tablewrap"><table class="plog"><thead><tr><th scope="col">Game</th><th scope="col">Result</th>';
  h += '<th scope="col">G</th><th scope="col">A</th><th scope="col">Pts</th><th scope="col">PIM</th></tr></thead><tbody>';

  lines
    .slice()
    .reverse()
    .forEach(function (l) {
      h +=
        "<tr" +
        (l.pts > 0 ? ' class="scored"' : "") +
        "><td>" +
        opponentCell(l) +
        "</td><td>" +
        resultCell(l) +
        "</td><td>" +
        fmtNum(l.g) +
        "</td><td>" +
        fmtNum(l.a) +
        '</td><td class="pts">' +
        fmtNum(l.pts) +
        "</td><td>" +
        fmtNum(l.pim) +
        "</td></tr>";
    });

  h += "</tbody></table></div>";
  h +=
    '<p class="foot">A skater only gets a log row when they score or take a penalty, so a game with zeros is either a quiet night or a game missed. ' +
    "The log does not say which. Season GP comes from the sheet.</p>";
  h += "</div></section>";

  h += '<section class="card"><div class="card-h"><h2>Season notes</h2></div><div class="card-b"><dl class="pnotes">';
  h += note("Best game", sum.best ? bestSkaterGame(sum.best) : "No points yet");
  h += note("Games with a point", sum.withPoint + " of " + lines.length);
  h += note("Multi-point games", String(sum.multiPoint));
  h += note("Point streak", sum.streak ? sum.streak + " game" + (sum.streak === 1 ? "" : "s") + " and counting" : "None right now");

  if (sum.league.games) {
    h += note(
      "League play",
      sum.league.g + " G, " + sum.league.a + " A, " + sum.league.pts + " Pts in " + sum.league.games + " game" + (sum.league.games === 1 ? "" : "s")
    );
  }

  h += "</dl></div></section>";

  return h;
}

/**
 * A goalie's page.
 *
 * @param {Object} g - The totals row.
 * @returns {string} HTML.
 */
function goaliePage(g) {
  var lines = goalieGames(g.name);
  var sum = goalieSummary(lines);
  var logRows = goalieLogFor(g.name);
  var rec = logRows.length ? recordFromLog(logRows) : null;
  var gaa = gaaFromLog(logRows);
  var form = goalieForm(g.name);
  var h = "";

  if (gaa === null && g.min > 0 && g.ga !== null && g.ga !== undefined) {
    gaa = (g.ga * state.data.config.gameMinutes) / g.min;
  }

  h += '<section class="card player"><div class="phead">';
  h += '<span class="pno">' + (g.no !== null ? esc(fmtNum(g.no)) : "") + "</span>";
  h += "<h2>" + esc(g.name) + "</h2>";

  if (form) {
    h += formBadge(form.level, fmtTwo(form.recent) + " GAA in the last 3 games, " + fmtTwo(form.season) + " for the season");
  }

  h += '<span class="eyebrow">Goalie</span></div>';

  h += '<div class="ptiles">';
  h += tile("GP", fmtNum(g.gp));
  h += tile("Min", fmtNum(g.min));
  h += tile("GA", fmtNum(g.ga));
  h += tile("GAA", fmtTwo(gaa), true);
  h += tile("SO", fmtNum(g.so));
  h += tile("Record", rec ? rec.w + "-" + rec.l + "-" + rec.t : fmtNum(g.w || 0) + "-" + fmtNum(g.l || 0));
  h += "</div></section>";

  h += '<section class="card"><div class="card-h"><h2>Game by game</h2><span class="eyebrow">Newest first</span></div><div class="card-b">';
  h += '<div class="tablewrap"><table class="plog"><thead><tr><th scope="col">Game</th><th scope="col">Result</th>';
  h += '<th scope="col">Min</th><th scope="col">GA</th></tr></thead><tbody>';

  lines
    .slice()
    .reverse()
    .forEach(function (l) {
      h +=
        "<tr><td>" +
        opponentCell(l) +
        "</td><td>" +
        resultCell(l) +
        "</td><td>" +
        fmtNum(l.min) +
        '</td><td class="pts">' +
        fmtNum(l.goalsAgainst) +
        (l.so ? ' <span class="tag w">SO</span>' : "") +
        "</td></tr>";
    });

  h += "</tbody></table></div>";
  h +=
    '<p class="foot">GAA is goals against per full game of ' +
    fmtNum(state.data.config.gameMinutes) +
    " minutes. Saves are not listed because most scoresheets do not record shots.</p>";
  h += "</div></section>";

  h += '<section class="card"><div class="card-h"><h2>Season notes</h2></div><div class="card-b"><dl class="pnotes">';
  h += note(
    "Best game",
    sum.best
      ? sum.best.goalsAgainst + " against in " + sum.best.min + " min " + (sum.best.home === false ? "at " : "vs ") + sum.best.opponent + ", " + fmtDate(sum.best.date)
      : "No games yet"
  );
  h += note("Shutouts", String(sum.so));

  if (sum.league.games) {
    h += note(
      "League play",
      sum.league.w + "-" + sum.league.l + "-" + sum.league.t + ", " + sum.league.ga + " GA in " + sum.league.games + " game" + (sum.league.games === 1 ? "" : "s")
    );
  }

  h += "</dl></div></section>";

  return h;
}

/**
 * The crumb back to the Stats table.
 *
 * @returns {string} HTML.
 */
function crumb() {
  return (
    '<div class="crumb"><button type="button" data-act="player" data-v="">&larr; Player stats</button>' +
    '<span class="evdates">Only on ?admin</span></div>'
  );
}

/**
 * The page for one player, or "" when the name is not in the stats.
 *
 * @param {string} name - The short name.
 * @returns {string} HTML.
 */
function playerHtml(name) {
  var found = findPlayer(name);

  if (!found) {
    return "";
  }

  return crumb() + (found.kind === "goalie" ? goaliePage(found.row) : skaterPage(found.row));
}

export { playerHtml };
