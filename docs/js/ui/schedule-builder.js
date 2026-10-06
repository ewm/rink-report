/**
 * Component: the Scheduling tool card, on a league staff page only.
 *
 * One button builds the season from the Teams tab and the Ice slots tab
 * (model/schedule-builder.js). The card then shows what was placed, what
 * could not be and why, each team's share, and a Copy button that hands
 * back the Schedule rows for one paste into the sheet. Nothing is written
 * anywhere: the commissioner pastes, the page re-reads the sheet.
 * See ARCHITECTURE.md, "The scheduling tool".
 */
import { isExhibition, played } from "../model/game.js";
import { state } from "../state.js";
import { fmtDate } from "../util/dates.js";
import { esc } from "../util/text.js";

/**
 * "1 game" / "3 games".
 *
 * @param {number} n
 * @returns {string}
 */
function games(n) {
  return n + (n === 1 ? " game" : " games");
}

/**
 * The Schedule tab's Date column letter, from the header map ?check
 * prints ("Date = column B"), or "B" when the sheet has not been read.
 *
 * @returns {string}
 */
function dateColumn() {
  var i;

  for (i = 0; i < state.headerMap.length; i++) {
    var m = /^Date = column ([A-Z]+)/.exec(state.headerMap[i]);

    if (m) {
      return m[1];
    }
  }

  return "B";
}

/**
 * The league rows already on the Schedule tab (no event), with their sheet
 * row numbers, so the paste instruction can say which rows to replace.
 *
 * @returns {{rows: number[], played: number}}
 */
function leagueRowsOnSheet() {
  var rows = [];
  var done = 0;

  state.data.games.forEach(function (g) {
    if (g.event || isExhibition(g)) {
      return;
    }

    rows.push(+g.id.slice(1) + 1);

    if (played(g)) {
      done++;
    }
  });

  rows.sort(function (a, b) {
    return a - b;
  });

  return { rows: rows, played: done };
}

/**
 * Where the copy goes: a fresh sheet takes it at the first empty Date
 * cell; a sheet with league rows has them replaced, and the sentence names
 * the rows when they sit together.
 *
 * @param {Object} r - The build.
 * @returns {string}
 */
function pasteWhere(r) {
  var col = dateColumn();
  var on = leagueRowsOnSheet();

  if (!on.rows.length) {
    return "Then click the first empty Date cell on the Schedule tab (column " + col + ") and paste.";
  }

  var first = on.rows[0];
  var last = on.rows[on.rows.length - 1];
  var together = last - first + 1 === on.rows.length;
  var what =
    "The copy is the whole league: " +
    (r.kept.length ? games(r.kept.length) + " already played, with their scores, plus " : "") +
    games(r.placed.length) +
    (r.kept.length ? " still to play." : ".");

  if (together) {
    return (
      what +
      " On the Schedule tab select rows " +
      first +
      " to " +
      last +
      " (the " +
      games(on.rows.length) +
      " of league play), delete them, click cell " +
      col +
      first +
      " and paste. Event rows are not touched."
    );
  }

  return (
    what +
    " The league rows on the Schedule tab are mixed in with event rows, so clear the league rows by hand first, then click the first empty Date cell (column " +
    col +
    ") and paste."
  );
}

/**
 * The per-team table.
 *
 * @param {Object[]} rows - perTeam from the build.
 * @returns {string} HTML.
 */
function teamTable(rows) {
  var want = state.built.gamesPerTeam;
  var h =
    '<div class="tablewrap"><table class="share"><thead><tr><th scope="col">Team</th><th scope="col">GP</th>' +
    '<th scope="col">H</th><th scope="col">A</th><th scope="col">Longest gap</th><th scope="col">Busiest week</th></tr></thead><tbody>';

  rows.forEach(function (r) {
    h +=
      "<tr" +
      (r.games < want ? ' class="short"' : "") +
      "><td>" +
      esc(r.team) +
      "</td><td>" +
      r.games +
      "</td><td>" +
      r.home +
      "</td><td>" +
      r.away +
      "</td><td>" +
      (r.longestGap ? r.longestGap + " days" : "") +
      "</td><td>" +
      (r.busiestWeek ? games(r.busiestWeek) : "") +
      "</td></tr>";
  });

  return h + "</tbody></table></div>";
}

/**
 * The placed games, folded, by date.
 *
 * @param {Object[]} placed
 * @returns {string} HTML.
 */
function gameList(placed) {
  var h = '<details class="built"><summary>Every game by date</summary><div class="tablewrap"><table>';

  h += '<thead><tr><th scope="col">Date</th><th scope="col">Time</th><th scope="col">Game, rink</th></tr></thead><tbody>';

  placed.forEach(function (g) {
    h +=
      '<tr><td class="d">' +
      esc(fmtDate(g.date)) +
      '</td><td class="t">' +
      esc(g.time || "") +
      '</td><td class="who">' +
      esc(g.away) +
      '<span class="at">at ' +
      esc(g.home) +
      "</span>" +
      (g.rink ? '<span class="rk">' + esc(g.rink) + "</span>" : "") +
      "</td></tr>";
  });

  return h + "</tbody></table></div></details>";
}

/**
 * The card.
 *
 * @returns {string} HTML.
 */
function builderHtml() {
  var slots = state.data.slots;
  var cfg = state.data.config;
  var r = state.built;
  var h = '<section class="card builder"><div class="card-h"><h2>Scheduling tool</h2>';

  if (r) {
    h += '<span class="eyebrow">' + r.placed.length + " of " + games(r.wanted) + "</span>";
  }

  h += '</div><div class="card-b">';

  var ready = slots && slots.length && cfg.gamesPerTeam && state.data.teams.length;

  if (!ready) {
    h +=
      '<p class="empty">Needs teams on the Teams tab, ice on the Ice slots tab and "Games per team" on the Settings tab. ' +
      "Then one tap builds the season.</p>";

    return h + "</div></section>";
  }

  h +=
    '<p class="lead">Every division plays a round robin, then the divisions cross over, repeating until each team has ' +
    games(cfg.gamesPerTeam) +
    ". Each game goes into the home club's own ice. No team plays twice in a day, more than twice on a weekend, or more than three times in a week. A team with no division on the Teams tab is left out.</p>";

  h +=
    '<p class="acts"><button type="button" class="coachbtn" data-act="build">' +
    (r ? "Build it again" : "Build the season") +
    "</button></p>";

  if (!r) {
    return h + "</div></section>";
  }

  // The verdict line. Kept games count as placed: they have ice.
  var done = r.placed.length + r.kept.length;

  if (!r.placed.length && !r.kept.length) {
    h += '<p class="verdict bad">Nothing could be placed.</p>';
  } else if (r.unplaced.length) {
    h +=
      '<p class="verdict warn">' +
      done +
      " of " +
      games(r.wanted) +
      " placed. " +
      games(r.unplaced.length) +
      " found no ice. " +
      r.unused.length +
      " slot" +
      (r.unused.length === 1 ? "" : "s") +
      " left over.</p>";
  } else {
    h +=
      '<p class="verdict ok">All ' +
      games(r.wanted) +
      " placed. " +
      r.unused.length +
      " slot" +
      (r.unused.length === 1 ? "" : "s") +
      " left over.</p>";
  }

  r.notes.forEach(function (n) {
    h += '<p class="note">' + esc(n) + "</p>";
  });

  if (r.unplaced.length) {
    h += '<ul class="unplaced">';

    r.unplaced.forEach(function (u) {
      h += "<li>" + esc(u.away) + " at " + esc(u.home) + ": " + esc(u.why) + ".</li>";
    });

    h += "</ul>";
    h +=
      '<p class="note">Add a slot for the home club on a free day on the Ice slots tab and build again, or schedule these by hand.</p>';
  }

  h += teamTable(r.perTeam);

  h += gameList(r.placed);

  h +=
    '<p class="foot"><button type="button" class="coachbtn" data-act="copysched">' +
    (state.schedCopied ? "Copied" : "Copy for the Schedule tab") +
    "</button> " +
    esc(pasteWhere(r)) +
    " The page picks the games up on its next read.</p>";

  return h + "</div></section>";
}

export { builderHtml };
