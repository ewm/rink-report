/**
 * Team rating: how many goals better or worse than an average team in the
 * same table, from who each team played and by how much.
 *
 * The idea is MyHockey Rankings' (opponent strength plus goal margin,
 * averaged over games) with four changes for a youth season.
 * See ARCHITECTURE.md, "Team rating".
 */
import { dateObj } from "../util/dates.js";
import { bare } from "../util/text.js";

/**
 * The tuning knobs. Starting points, meant to be checked against real
 * results once the season has enough of them. See the peer review of
 * Sept 23 2026 for how each one was tested.
 *
 * ghostGames must stay above 0: at 0 the rounds flip back and forth and
 * never settle. halfLifeDays at 0 or below switches the fade off.
 */
var RATING = {
  fullGoals: 3, // goals 1 to 3 of a margin count in full
  halfGoals: 6, // goals 4 to 6 count half; past this they count nothing
  ghostGames: 2, // every team starts with this many games at league average
  halfLifeDays: 60, // a game this much older than the table's latest game counts half
  maxRounds: 200,
  settled: 0.0005 // stop once no rating moves more than this in a round
};

/**
 * A goal margin with the blowout taken out of it. A 3-goal win is worth 3,
 * a 6-goal win 4.5, and anything bigger still 4.5.
 *
 * @param {number} m - Our goals minus theirs.
 * @returns {number}
 */
function softMargin(m) {
  var a = Math.abs(m);
  var full = Math.min(a, RATING.fullGoals);
  var half = Math.max(0, Math.min(a, RATING.halfGoals) - RATING.fullGoals) / 2;

  return (m < 0 ? -1 : 1) * (full + half);
}

/**
 * How much a game counts by its age, measured back from the latest game in
 * the same table (not from today, or every rating would shrink a little each
 * day with no new games). The latest game counts 1, a game halfLifeDays
 * older counts a half, twice that a quarter. An unreadable date counts 1.
 *
 * @param {string} iso - The game date.
 * @param {Date|null} latest - The latest game date in the table.
 * @returns {number}
 */
function ageWeight(iso, latest) {
  var d = dateObj(iso);

  if (!d || !latest || RATING.halfLifeDays <= 0) {
    return 1;
  }

  var age = Math.max(0, Math.round((latest - d) / 86400000));

  return Math.pow(0.5, age / RATING.halfLifeDays);
}

/**
 * Whether a game has two real scores. A score that is not a finite number
 * would spread through every rating and show the whole column as 0.0.
 *
 * @param {Object} g
 * @returns {boolean}
 */
function hasScores(g) {
  return Number.isFinite(g.hs) && Number.isFinite(g.as);
}

/**
 * Ratings for every team that has played at least one of the games.
 *
 * Each team's rating is the weighted average, over its games, of the
 * opponent's rating plus the softened margin, with ghostGames extra games
 * at 0 in the average. Because every rating leans on the others, all of
 * them are recomputed together, round after round, until they stop moving.
 * After each round they are shifted so the average team sits at 0.
 *
 * The caller passes only the games that count (played, not a scrimmage,
 * not a bracket game at an event, both teams in the table).
 *
 * @param {Object[]} games - Counted games: {home, away, hs, as, date}.
 * @returns {Object} Team name to rating, rounded to one decimal.
 */
function ratings(games) {
  var links = bare();
  var names = [];
  var latest = null;
  var i;

  games = games.filter(hasScores);

  // The latest game date sets "now" for the fade.
  for (i = 0; i < games.length; i++) {
    var day = dateObj(games[i].date);

    if (day && (!latest || day > latest)) {
      latest = day;
    }
  }

  // Each team's list of {opp, margin, weight}, one entry per game.
  for (i = 0; i < games.length; i++) {
    var g = games[i];
    var w = ageWeight(g.date, latest);
    var m = softMargin(g.hs - g.as);

    if (!links[g.home]) {
      links[g.home] = [];
      names.push(g.home);
    }

    if (!links[g.away]) {
      links[g.away] = [];
      names.push(g.away);
    }

    links[g.home].push({ opp: g.away, margin: m, weight: w });
    links[g.away].push({ opp: g.home, margin: -m, weight: w });
  }

  var r = bare();

  names.forEach(function (n) {
    r[n] = 0;
  });

  for (var round = 0; round < RATING.maxRounds; round++) {
    var next = bare();
    var total = 0;

    names.forEach(function (n) {
      var sum = 0;
      var weights = RATING.ghostGames;

      links[n].forEach(function (e) {
        sum += e.weight * (r[e.opp] + e.margin);
        weights += e.weight;
      });

      next[n] = sum / weights;
      total += next[n];
    });

    var mean = names.length ? total / names.length : 0;
    var moved = 0;

    names.forEach(function (n) {
      next[n] -= mean;
      moved = Math.max(moved, Math.abs(next[n] - r[n]));
    });

    r = next;

    if (moved < RATING.settled) {
      break;
    }
  }

  var out = bare();

  names.forEach(function (n) {
    // Rounded the same way both sides of zero (Math.round(-7.5) is -7),
    // so two mirror-image teams show mirror-image ratings. -0.0 shows as 0.0.
    var sign = r[n] < 0 ? -1 : 1;

    out[n] = (sign * Math.round(Math.abs(r[n]) * 10)) / 10 || 0;
  });

  return out;
}

export { RATING, ratings, softMargin };
