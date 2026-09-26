/**
 * Component: the Stats page.
 *
 * statsHtml() renders the skater table (points, goals, number) and the
 * goalie table, either from the sheet's own season totals or, when the
 * League switch is on, from the game log restricted to league play. The sheet
 * does the adding; the two things figured here are GAA, from the sheet's own
 * GA and minutes and the league's game length, and the W-L-T record, which
 * needs the log because the sheet counts no ties. On ?admin each name also
 * gets a hot, warm or cold emoji from model/form.js. See ARCHITECTURE.md,
 * "Stats" and "Hot and cold".
 */
import {
  canSplitByScope,
  gaaFromLog,
  goalieLogFor,
  leagueGoalies,
  leagueSkaters,
  recordFromLog
} from "../model/gamelog.js";
import { formBadge, goalieForm, skaterForm } from "../model/form.js";
import { ADMIN, state } from "../state.js";
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
 * A goalie's record: wins-losses-ties.
 *
 * Ties are why this is not two columns off the sheet. The totals table
 * counts wins and losses, so a game that ended level is missing from both,
 * and the log is the only place that says it happened. A goalie with log
 * rows is counted from those, whichever scope is on screen.
 *
 * Without a log the sheet's own wins and losses are printed as they stand,
 * with no tie count at all unless the tab carries a T column of its own. A
 * zero there would be a claim the tab cannot make.
 *
 * @param {Object} g - A goalie row.
 * @param {boolean} league - Whether the row was already summed from the log.
 * @returns {string} "3-1-1", or "—" when the sheet carries no record.
 */
function recordFor(g, league) {
  if (league) {
    return g.w + "-" + g.l + "-" + g.t;
  }

  var rows = goalieLogFor(g.name);

  if (rows.length) {
    var rec = recordFromLog(rows);

    return rec.w + "-" + rec.l + "-" + rec.t;
  }

  var missing = function (n) {
    return n === null || n === undefined;
  };

  if (missing(g.w) && missing(g.l)) {
    return "—";
  }

  var out = fmtNum(g.w || 0) + "-" + fmtNum(g.l || 0);

  return missing(g.t) ? out : out + "-" + fmtNum(g.t);
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
 * The League / All games switch, or "" when the sheet cannot answer it.
 *
 * It takes a game log with at least one league game in it. Without that
 * there is nothing to filter and the switch would be a button that does
 * nothing.
 *
 * @returns {string} HTML.
 */
function scopeSeg() {
  if (!canSplitByScope()) {
    return "";
  }

  var lg = state.statsScope === "league";

  return (
    '<span class="seg"><button type="button" data-act="statsscope" data-v="league" aria-pressed="' +
    lg +
    '">League</button>' +
    '<button type="button" data-act="statsscope" data-v="all" aria-pressed="' +
    !lg +
    '">All games</button></span>'
  );
}

/**
 * The hot, warm or cold emoji for a skater, on ?admin only.
 *
 * @param {Object} form - From skaterForm(), keyed by short name.
 * @param {string} name - The skater's short name.
 * @returns {string} HTML, or "".
 */
function skaterBadge(form, name) {
  var f = form[name];

  if (!f) {
    return "";
  }

  var why = f.points + " point" + (f.points === 1 ? "" : "s") + " in the last 5 games";

  return " " + formBadge(f.level, why);
}

/**
 * The hot, warm or cold emoji for a goalie, on ?admin only.
 *
 * @param {string} name - The goalie's short name.
 * @returns {string} HTML, or "".
 */
function goalieBadge(name) {
  if (!ADMIN) {
    return "";
  }

  var f = goalieForm(name);

  if (!f) {
    return "";
  }

  var why = fmtGaa(f.recent) + " GAA in the last 3 games, " + fmtGaa(f.season) + " for the season";

  return " " + formBadge(f.level, why);
}

/**
 * A player's name, as a button that opens their page on ?admin and plain
 * text otherwise.
 *
 * @param {string} name - The short name.
 * @returns {string} HTML.
 */
function nameCell(name) {
  if (!ADMIN) {
    return esc(name);
  }

  return '<button type="button" class="pname" data-act="player" data-v="' + esc(name) + '">' + esc(name) + "</button>";
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

  // League play is figured from the game log; everything else is the sheet's
  // own totals, which is what a manager sees in the spreadsheet.
  var seg = scopeSeg();
  var league = seg !== "" && state.statsScope === "league";
  var skaters = league ? leagueSkaters() : s.skaters;
  var goalies = league ? leagueGoalies() : s.goalies;

  if (league) {
    skaters.sort(function (x, y) {
      if ((y.pts || 0) !== (x.pts || 0)) {
        return (y.pts || 0) - (x.pts || 0);
      }

      if ((y.g || 0) !== (x.g || 0)) {
        return (y.g || 0) - (x.g || 0);
      }

      return (x.no || 999) - (y.no || 999);
    });

    goalies.sort(function (x, y) {
      if ((y.gp || 0) !== (x.gp || 0)) {
        return (y.gp || 0) - (x.gp || 0);
      }

      return (x.no || 999) - (y.no || 999);
    });
  }

  for (i = 0; i < skaters.length; i++) {
    if (skaters[i].gp > gp) {
      gp = skaters[i].gp;
    }
  }

  // With the switch on screen the header is already carrying two things, so
  // the game count drops the word "through" rather than crowding a phone.
  var through = gp ? (seg ? "" : "Through ") + gp + " game" + (gp === 1 ? "" : "s") : "Season";

  // Hot, warm and cold are the manager's read on who is on a run. They look
  // at the last five games whichever scope is on screen.
  var form = ADMIN ? skaterForm() : {};
  var showForm = Object.keys(form).length > 0;

  if (skaters.length) {
    h +=
      '<section class="card skaters"><div class="card-h"><h2>Skaters</h2><span class="eyebrow">' +
      esc(through) +
      "</span>" +
      seg +
      '</div><div class="card-b">';
    h +=
      '<div class="tablewrap"><table><thead><tr><th scope="col">Player</th><th scope="col">GP</th>' +
      '<th scope="col">G</th><th scope="col">A</th><th scope="col">Pts</th><th scope="col">PIM</th></tr></thead><tbody>';

    skaters.forEach(function (p) {
      h +=
        '<tr><td><span class="rank">' +
        (p.no !== null ? esc(fmtNum(p.no)) : "") +
        "</span>" +
        nameCell(p.name) +
        skaterBadge(form, p.name) +
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
    h +=
      '<p class="foot">' +
      (league ? "League play only, from the game log. " : "") +
      "Sorted by points, then goals. PIM counts each 1:30 minor as 1.5." +
      (league ? " GP is the team's league games, so a missed game is not taken off." : "") +
      "</p>";

    if (showForm) {
      h +=
        '<p class="foot formkey">\uD83D\uDD25 5 or more points in the last 5 games, \u2600\uFE0F 2 to 4, \uD83E\uDDCA 0 or 1. ' +
        "The log does not say who missed a game, so a kid who sat out counts as 0. Only on ?admin.</p>";
    }

    h += "</div></section>";
  }

  if (goalies.length) {
    h +=
      '<section class="card"><div class="card-h"><h2>In net</h2><span class="eyebrow">' +
      esc(through) +
      "</span>" +
      seg +
      '</div><div class="card-b">';
    h +=
      '<div class="tablewrap"><table><thead><tr><th scope="col">Goalie</th><th scope="col">GP</th><th scope="col">Min</th>' +
      '<th scope="col">GA</th><th scope="col">GAA</th><th scope="col">SO</th><th scope="col">Record</th></tr></thead><tbody>';

    // Saves and save percentage are left out on purpose: most youth scoresheets never record
    // shots. See ARCHITECTURE.md, "Stats".
    goalies.forEach(function (g) {
      h +=
        '<tr><td><span class="rank">' +
        (g.no !== null ? esc(fmtNum(g.no)) : "") +
        "</span>" +
        nameCell(g.name) +
        goalieBadge(g.name) +
        "</td>" +
        "<td>" +
        fmtNum(g.gp) +
        "</td><td>" +
        fmtNum(g.min) +
        "</td><td>" +
        fmtNum(g.ga) +
        '</td><td class="pts">' +
        fmtGaa(league ? g.gaa : gaaFor(g)) +
        "</td><td>" +
        fmtNum(g.so) +
        "</td><td>" +
        esc(recordFor(g, league)) +
        "</td></tr>";
    });

    h += "</tbody></table></div>";
    h +=
      '<p class="foot">' +
      (league ? "League play only, from the game log. " : "") +
      'GAA is goals against per full game of ' +
      fmtNum(state.data.config.gameMinutes) +
      " minutes" +
      (mixedLengths() ? ", and of whatever the Schedule tab says for an event that runs a different clock" : "") +
      '. Record is wins-losses-ties. Saves are not listed because most scoresheets do not record shots.</p>';

    var goalieForms = ADMIN && goalies.some(function (g) {
      return goalieForm(g.name) !== null;
    });

    if (goalieForms) {
      h +=
        '<p class="foot formkey">\uD83D\uDD25 \u2600\uFE0F \uD83E\uDDCA compare GAA over a goalie\'s last 3 games to their season GAA. ' +
        "A full goal a game better is hot, a full goal worse is cold. A goalie needs 4 or more games to get one. Only on ?admin.</p>";
    }
    h += "</div></section>";
  }

  return h;
}

export { statsHtml };
