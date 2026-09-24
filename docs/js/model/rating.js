/**
 * Team rating: how many goals a game better or worse than an average team
 * in the same table, from who each team played and by how much.
 *
 * The idea is MyHockey Rankings' (opponent strength plus goal margin,
 * averaged over games) with two changes for a youth season: every team
 * starts with two average games, and all ratings are solved together.
 * See ARCHITECTURE.md, "Team rating".
 */
import { bare } from "../util/text.js";

/**
 * The tuning knobs. Tested on simulated seasons in September 2026; see
 * Rink-Report-Rating-Peer-Review-2026-09-23.md and ARCHITECTURE.md.
 *
 * ghostGames must stay above 0: at 0 the rounds flip back and forth and
 * never settle.
 */
var RATING = {
  cap: 8, // a margin counts up to 8 goals, so a runaway score or a typo can't swing a table
  ghostGames: 2, // every team starts with this many games at league average
  maxRounds: 200,
  settled: 0.0005 // stop once no rating moves more than this in a round
};

/**
 * A goal margin, capped. A 5-goal win is worth 5, and a 12-0 win is worth
 * 8, the same as 8-0.
 *
 * @param {number} m - Our goals minus theirs.
 * @returns {number}
 */
function cappedMargin(m) {
  return Math.max(-RATING.cap, Math.min(RATING.cap, m));
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
 * Each team's rating is the average, over its games, of the opponent's
 * rating plus the capped margin, with ghostGames extra games at 0 in the
 * average. Because every rating leans on the others, all of them are
 * recomputed together, round after round, until they stop moving. After
 * each round they are shifted so the average team sits at 0.
 *
 * Every game counts the same whatever its date, so a rating only changes
 * when a score comes in.
 *
 * The caller passes only the games that count (played, not a scrimmage,
 * not a bracket game at an event, both teams in the table).
 *
 * @param {Object[]} games - Counted games: {home, away, hs, as}.
 * @returns {Object} Team name to rating, rounded to one decimal.
 */
function ratings(games) {
  var links = bare();
  var names = [];
  var i;

  games = games.filter(hasScores);

  // Each team's list of {opp, margin}, one entry per game.
  for (i = 0; i < games.length; i++) {
    var g = games[i];
    var m = cappedMargin(g.hs - g.as);

    if (!links[g.home]) {
      links[g.home] = [];
      names.push(g.home);
    }

    if (!links[g.away]) {
      links[g.away] = [];
      names.push(g.away);
    }

    links[g.home].push({ opp: g.away, margin: m });
    links[g.away].push({ opp: g.home, margin: -m });
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

      links[n].forEach(function (e) {
        sum += r[e.opp] + e.margin;
      });

      next[n] = sum / (links[n].length + RATING.ghostGames);
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

export { RATING, ratings, cappedMargin };
