/**
 * The Coaches Corner numbers: team-level trends for the manager, on ?admin.
 *
 * Everything here is worked out from the Schedule tab (results) and the
 * Player Stats tab (who scored), and nothing names a player. The card is
 * hidden behind ?admin, which is tidiness, not privacy, so it only says
 * things any parent could add up from the public page themselves.
 * See ARCHITECTURE.md, "Coaches Corner".
 */
import { bySlot, isExhibition, isOurs, played } from "./game.js";
import { state } from "../state.js";

/** Month names, as Date.getMonth() numbers them. */
var MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

/** How many of the most recent games the "lately" scoring line looks at. */
var RECENT = 5;

/**
 * Our finished games that count for something, oldest first.
 *
 * Scrimmages are left out, the same as the standings leave them out.
 * Showcase, tournament and bracket games stay in: they are real games and
 * the coach wants to see them.
 *
 * @returns {Object[]}
 */
function ourGames() {
  var games = (state.data.games || []).filter(function (g) {
    return isOurs(g) && played(g) && !isExhibition(g);
  });

  return games.slice().sort(bySlot);
}

/**
 * Our goals and theirs in one game, whichever side we were on.
 *
 * @param {Object} g
 * @returns {{gf: number, ga: number}}
 */
function sideOf(g) {
  var home = g.home === state.data.config.teamName;

  return {
    gf: home ? g.hs : g.as,
    ga: home ? g.as : g.hs
  };
}

/**
 * Adds up a list of our games.
 *
 * @param {Object[]} games
 * @returns {{gp: number, w: number, l: number, t: number, gf: number, ga: number}}
 */
function tally(games) {
  var out = { gp: 0, w: 0, l: 0, t: 0, gf: 0, ga: 0 };

  games.forEach(function (g) {
    var s = sideOf(g);

    out.gp += 1;
    out.gf += s.gf;
    out.ga += s.ga;

    if (s.gf > s.ga) {
      out.w += 1;
    } else if (s.gf < s.ga) {
      out.l += 1;
    } else {
      out.t += 1;
    }
  });

  return out;
}

/**
 * Our games split by calendar month, oldest month first.
 *
 * @param {Object[]} games - Oldest first.
 * @returns {Object[]} One tally per month, plus its label ("September").
 */
function byMonth(games) {
  var groups = [];
  var last = "";

  games.forEach(function (g) {
    var key = g.date.slice(0, 7);

    if (key !== last) {
      groups.push({ key: key, games: [] });
      last = key;
    }

    groups[groups.length - 1].games.push(g);
  });

  return groups.map(function (grp) {
    var t = tally(grp.games);

    t.label = MONTHS[+grp.key.slice(5, 7) - 1];

    return t;
  });
}

/**
 * The run the team is on right now, counted back from the latest game.
 *
 * "won": every game in the run was a win.
 * "unbeaten": no losses, at least one tie.
 * "lost": every game in the run was a loss.
 * "winless": no wins, at least one tie.
 *
 * @param {Object[]} games - Oldest first.
 * @returns {{kind: string, n: number}|null}
 */
function streak(games) {
  if (!games.length) {
    return null;
  }

  var first = sideOf(games[games.length - 1]);
  var goingWell = first.gf >= first.ga;
  var n = 0;
  var ties = 0;

  for (var i = games.length - 1; i >= 0; i--) {
    var s = sideOf(games[i]);

    // A loss ends a good run; a win ends a bad one.
    if (goingWell && s.gf < s.ga) {
      break;
    }

    if (!goingWell && s.gf > s.ga) {
      break;
    }

    n += 1;

    if (s.gf === s.ga) {
      ties += 1;
    }
  }

  if (goingWell) {
    return { kind: ties ? "unbeaten" : "won", n: n };
  }

  return { kind: ties ? "winless" : "lost", n: n };
}

/**
 * Games decided by one goal, plus ties, and how they went.
 *
 * @param {Object[]} games
 * @returns {{gp: number, w: number, l: number, t: number}}
 */
function closeGames(games) {
  var close = games.filter(function (g) {
    var s = sideOf(g);

    return Math.abs(s.gf - s.ga) <= 1;
  });

  return tally(close);
}

/**
 * How much of the scoring comes from the top two scorers, for a set of
 * goals per player. Returns counts only, never names.
 *
 * @param {Object} goalsBy - Player name to goals.
 * @returns {{top2: number, total: number, scorers: number}}
 */
function spread(goalsBy) {
  var counts = Object.keys(goalsBy)
    .map(function (k) {
      return goalsBy[k];
    })
    .filter(function (n) {
      return n > 0;
    })
    .sort(function (a, b) {
      return b - a;
    });

  var total = counts.reduce(function (sum, n) {
    return sum + n;
  }, 0);

  return {
    top2: (counts[0] || 0) + (counts[1] || 0),
    total: total,
    scorers: counts.length
  };
}

/**
 * Scoring depth from the Player Stats tab: the season's totals, and the
 * last few games from the game log.
 *
 * @param {Object[]} games - Our games, oldest first.
 * @returns {Object|null} Null when the Stats tab is missing.
 */
function scoring(games) {
  var s = state.data.stats;

  if (!s || !s.skaters || !s.skaters.length) {
    return null;
  }

  var season = {};
  var withPoint = 0;
  var pim = 0;
  var gp = 0;

  s.skaters.forEach(function (p) {
    season[p.name] = p.g || 0;
    pim += p.pim || 0;

    if ((p.pts || 0) > 0) {
      withPoint += 1;
    }

    if ((p.gp || 0) > gp) {
      gp = p.gp;
    }
  });

  // The last RECENT game dates we have results for, read from the log.
  var dates = {};
  var recentGames = games.slice(-RECENT);

  recentGames.forEach(function (g) {
    dates[g.date] = true;
  });

  var recent = {};
  var logRows = s.logSkaters || [];

  logRows.forEach(function (r) {
    if (dates[r.date]) {
      recent[r.name] = (recent[r.name] || 0) + (r.g || 0);
    }
  });

  return {
    season: spread(season),
    recent: logRows.length ? spread(recent) : null,
    recentGames: recentGames.length,
    skaters: s.skaters.length,
    withPoint: withPoint,
    pim: pim,
    pimGames: gp
  };
}

/**
 * Everything the Coaches Corner card shows.
 *
 * @returns {Object|null} Null before our first finished game.
 */
function coachSummary() {
  var games = ourGames();

  if (!games.length) {
    return null;
  }

  var league = games.filter(function (g) {
    return !g.event;
  });

  return {
    through: games[games.length - 1].date,
    all: tally(games),
    league: tally(league),
    months: byMonth(games),
    streak: streak(games),
    close: closeGames(games),
    scoring: scoring(games)
  };
}

export { coachSummary };
