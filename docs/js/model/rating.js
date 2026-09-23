/**
 * Team rating: how many goals better or worse than an average team in the
 * same table, from who each team played and by how much.
 *
 * The idea is MyHockey Rankings' (opponent strength plus goal margin,
 * averaged over games) with four changes for a youth season.
 * See ARCHITECTURE.md, "Team rating".
 */
import { daysUntil } from "../util/dates.js";
import { bare } from "../util/text.js";

/**
 * The tuning knobs. Starting points, meant to be checked against real
 * results once the season has enough of them.
 */
var RATING = {
  fullGoals: 3, // goals 1 to 3 of a margin count in full
  halfGoals: 6, // goals 4 to 6 count half; past this they count nothing
  ghostGames: 2, // every team starts with this many games at league average
  halfLifeDays: 60, // a game this old counts half as much as one played today
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
 * How much a game counts by its age: 1 today, a half at halfLifeDays, a
 * quarter at twice that. A game dated in the future counts 1.
 *
 * @param {string} iso - The game date.
 * @returns {number}
 */
function ageWeight(iso) {
  var d = daysUntil(iso);
  var age = d === null ? 0 : Math.max(0, -d);

  return Math.pow(0.5, age / RATING.halfLifeDays);
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
  var i;

  // Each team's list of {opp, margin, weight}, one entry per game.
  for (i = 0; i < games.length; i++) {
    var g = games[i];
    var w = ageWeight(g.date);
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
