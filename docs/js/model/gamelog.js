/**
 * The game log: pairing a logged row with the game it belongs to.
 *
 * The Player Stats tab carries one row per player per game to the right of
 * the two totals tables. Those rows are what the page needs for anything the
 * season totals cannot answer on their own: how long the game was, and
 * whether it counted toward the league table.
 *
 * A row is matched to its game by date. The opponent is written the way the
 * scoresheet spells it ("Southtowns 12U Martino") while the Schedule tab uses
 * the league's name for the club ("Southtown Stars"), so the two names will
 * not match and are not asked to. Two games on one date always belong to the
 * same event and, in practice, run the same length, so the date is enough.
 * See ARCHITECTURE.md, "The game log".
 */
import { isExhibition, isOurs, played } from "./game.js";
import { state } from "../state.js";

/**
 * How long a full game was on a given date, in minutes.
 *
 * A tournament that plays shorter periods says so in the Period length
 * column on the Schedule tab. Anything blank falls back to the league's own
 * length from the Settings tab.
 *
 * @param {string} iso - The date, YYYY-MM-DD.
 * @returns {number} Minutes in a full game that day.
 */
function fullGameMinutes(iso) {
  var games = state.data.games || [];

  for (var i = 0; i < games.length; i++) {
    if (games[i].date === iso && games[i].mins) {
      return games[i].mins;
    }
  }

  return state.data.config.gameMinutes;
}

/**
 * A goalie's GAA from their own log rows.
 *
 * GAA is goals against per full game. With every game the same length that
 * is goals against times the game length over minutes played, but a season
 * that mixes a 45 minute league game with a 36 minute tournament game has no
 * single length to multiply by. So each appearance is counted as the share
 * of a full game it actually was, and the goals are divided by the total.
 *
 * @param {Object[]} rows - That goalie's rows from the log.
 * @returns {number|null} GAA, or null when no row can be figured.
 */
function gaaFromLog(rows) {
  var ga = 0;
  var games = 0;

  rows.forEach(function (r) {
    var full = fullGameMinutes(r.date);

    if (r.min > 0 && full > 0) {
      ga += r.ga || 0;
      games += r.min / full;
    }
  });

  return games > 0 ? ga / games : null;
}

/**
 * One goalie's rows from the log, newest last.
 *
 * @param {string} name - The short name, as the totals table carries it.
 * @returns {Object[]}
 */
function goalieLogFor(name) {
  var rows = (state.data.stats && state.data.stats.logGoalies) || [];

  return rows.filter(function (r) {
    return r.name === name;
  });
}

/**
 * Whether a date belongs to league play.
 *
 * League play is what feeds the standings: our game, no Event on the row,
 * and not a scrimmage. A date carrying both a league game and a scrimmage
 * would count both, which the date-only matching above cannot separate; two
 * games in a day are almost always the same kind, so this is left alone
 * rather than guessed at.
 *
 * @param {string} iso - The date, YYYY-MM-DD.
 * @returns {boolean}
 */
function isLeagueDate(iso) {
  var games = state.data.games || [];

  for (var i = 0; i < games.length; i++) {
    var g = games[i];

    if (g.date === iso && !g.event && isOurs(g) && !isExhibition(g)) {
      return true;
    }
  }

  return false;
}

/**
 * How many league games the team has actually played.
 *
 * This is a skater's GP in the league-only table. A skater's log row only
 * exists when they put up a point or took a penalty, so their own games
 * cannot be counted from the log; the team's count is the same rule the
 * sheet uses by default. A kid who missed a league game reads one high, and
 * the typed-over GP on the sheet cannot help here because it is a season
 * total with no way to split it by event.
 *
 * @returns {number}
 */
function leagueGamesPlayed() {
  var games = state.data.games || [];
  var n = 0;

  games.forEach(function (g) {
    if (!g.event && isOurs(g) && !isExhibition(g) && played(g)) {
      n += 1;
    }
  });

  return n;
}

/**
 * The roster's league-only skater line, in the same shape the totals table
 * uses, so the component does not care which scope it is drawing.
 *
 * @returns {Object[]}
 */
function leagueSkaters() {
  var rows = (state.data.stats && state.data.stats.logSkaters) || [];
  var gp = leagueGamesPlayed();

  return ((state.data.stats && state.data.stats.skaters) || []).map(function (p) {
    var o = { name: p.name, no: p.no, gp: gp, g: 0, a: 0, pts: 0, pim: 0 };

    rows.forEach(function (r) {
      if (r.name === p.name && isLeagueDate(r.date)) {
        o.g += r.g || 0;
        o.a += r.a || 0;
        o.pim += r.pim || 0;
      }
    });

    o.pts = o.g + o.a;

    return o;
  });
}

/**
 * The roster's league-only goalie line. Everything here is countable from
 * the log, because a goalie gets a row every game they dress for.
 *
 * @returns {Object[]}
 */
function leagueGoalies() {
  var rows = (state.data.stats && state.data.stats.logGoalies) || [];

  return ((state.data.stats && state.data.stats.goalies) || []).map(function (k) {
    var mine = rows.filter(function (r) {
      return r.name === k.name && isLeagueDate(r.date);
    });

    var o = { name: k.name, no: k.no, gp: mine.length, min: 0, ga: 0, so: 0, w: 0, l: 0 };

    mine.forEach(function (r) {
      o.min += r.min || 0;
      o.ga += r.ga || 0;

      if ((r.ga || 0) === 0) {
        o.so += 1;
      }

      if (r.result === "w") {
        o.w += 1;
      } else if (r.result === "l") {
        o.l += 1;
      }
    });

    o.gaa = gaaFromLog(mine);

    return o;
  });
}

/**
 * Whether the league-only view can be offered at all: there has to be a log
 * to read and a league game in it.
 *
 * @returns {boolean}
 */
function canSplitByScope() {
  var st = state.data.stats;

  if (!st || (!(st.logSkaters || []).length && !(st.logGoalies || []).length)) {
    return false;
  }

  var rows = (st.logSkaters || []).concat(st.logGoalies || []);

  for (var i = 0; i < rows.length; i++) {
    if (isLeagueDate(rows[i].date)) {
      return true;
    }
  }

  return false;
}

export {
  canSplitByScope,
  fullGameMinutes,
  gaaFromLog,
  goalieLogFor,
  isLeagueDate,
  leagueGamesPlayed,
  leagueGoalies,
  leagueSkaters
};
