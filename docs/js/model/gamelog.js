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

export { fullGameMinutes, gaaFromLog, goalieLogFor };
