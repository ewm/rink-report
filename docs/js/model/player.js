/**
 * One player's season, game by game.
 *
 * The Stats page shows season totals. This model pairs a player's rows from
 * the game log with the games on the Schedule tab, so the page can show what
 * happened in each one, and sums up the season from those rows.
 *
 * A log row names its game by date and a hand-typed opponent. On a day with
 * one game the date is enough. On a two-game day the opponent decides, by
 * whichever schedule name shares the most words with it ("Norflok Knights"
 * still finds Norfolk Knights). A row that matches nothing is kept, with the
 * opponent as typed and no score. See ARCHITECTURE.md, "Player pages".
 */
import { bySlot, isExhibition, isOurs, played } from "./game.js";
import { isLeagueDate } from "./gamelog.js";
import { state } from "../state.js";

/** Tokens that say nothing about which club a name is: birth years, age groups. */
var NOISE = /^(\d+|u\d+|\d+u|hc|the|of)$/;

/**
 * The words in a team name worth matching on, lower case, at least three
 * letters, years and age groups dropped.
 *
 * @param {string} s
 * @returns {string[]}
 */
function words(s) {
  return String(s || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(function (w) {
      return w.length >= 3 && !NOISE.test(w);
    });
}

/**
 * How alike a logged opponent and a schedule name are: the count of logged
 * words whose first four letters open some word of the schedule name.
 *
 * @param {string} logged - The opponent as typed in the log.
 * @param {string} scheduled - The team name on the Schedule tab.
 * @returns {number}
 */
function likeness(logged, scheduled) {
  var a = words(logged);
  var b = words(scheduled);
  var n = 0;

  a.forEach(function (w) {
    var stem = w.slice(0, 4);

    for (var i = 0; i < b.length; i++) {
      if (b[i].slice(0, 4) === stem) {
        n += 1;
        return;
      }
    }
  });

  return n;
}

/**
 * Our finished games, oldest first, each with the opponent and result
 * worked out from our side.
 *
 * @returns {Object[]} Each is { game, date, opponent, home, gf, ga, result, event, league }.
 */
function ourGames() {
  var us = state.data.config.teamName;
  var out = [];

  (state.data.games || []).forEach(function (g) {
    if (!isOurs(g) || !played(g)) {
      return;
    }

    var home = g.home === us;
    var gf = home ? g.hs : g.as;
    var ga = home ? g.as : g.hs;

    out.push({
      game: g,
      date: g.date,
      opponent: home ? g.away : g.home,
      home: home,
      gf: gf,
      ga: ga,
      result: gf > ga ? "W" : gf < ga ? "L" : "T",
      event: g.event || "",
      league: !g.event && !isExhibition(g)
    });
  });

  out.sort(function (x, y) {
    return bySlot(x.game, y.game);
  });

  return out;
}

/**
 * The game a log row belongs to, or null.
 *
 * @param {Object} row - A log row with date and opponent.
 * @param {Object[]} games - From ourGames().
 * @returns {Object|null}
 */
function gameFor(row, games) {
  var sameDay = games.filter(function (g) {
    return g.date === row.date;
  });

  if (sameDay.length === 1) {
    return sameDay[0];
  }

  var best = null;
  var bestScore = 0;

  sameDay.forEach(function (g) {
    var s = likeness(row.opponent, g.opponent);

    if (s > bestScore) {
      best = g;
      bestScore = s;
    }
  });

  return best;
}

/**
 * A line for a game the log knows but the schedule does not.
 *
 * @param {Object} row
 * @returns {Object}
 */
function unscheduled(row) {
  return {
    date: row.date,
    opponent: row.opponent || "Unknown opponent",
    home: null,
    gf: null,
    ga: null,
    result: "",
    event: "",
    league: isLeagueDate(row.date),
    unscheduled: true
  };
}

/**
 * A skater's season, one line per game the team played.
 *
 * A skater only gets a log row when they score or take a penalty, so a game
 * with no row reads as zeros. The log does not say who missed a game.
 *
 * @param {string} name - The short name, as the totals table carries it.
 * @returns {Object[]} Oldest first: { date, opponent, home, gf, ga, result, event, league, g, a, pts, pim }.
 */
function skaterGames(name) {
  var games = ourGames();
  var rows = ((state.data.stats && state.data.stats.logSkaters) || []).filter(function (r) {
    return r.name === name;
  });

  var lines = games.map(function (g) {
    var line = Object.assign({}, g, { g: 0, a: 0, pts: 0, pim: 0 });

    delete line.game;

    return line;
  });

  rows.forEach(function (r) {
    var g = gameFor(r, games);
    var line;

    if (g) {
      line = lines[games.indexOf(g)];
    } else {
      line = Object.assign(unscheduled(r), { g: 0, a: 0, pts: 0, pim: 0 });
      lines.push(line);
    }

    line.g += r.g || 0;
    line.a += r.a || 0;
    line.pim += r.pim || 0;
    line.pts = line.g + line.a;
  });

  lines.sort(function (x, y) {
    return x.date < y.date ? -1 : x.date > y.date ? 1 : 0;
  });

  return lines;
}

/**
 * A goalie's season, one line per game they dressed for.
 *
 * @param {string} name - The short name.
 * @returns {Object[]} Oldest first: { date, opponent, home, gf, ga, result, event, league, min, goalsAgainst, so }.
 */
function goalieGames(name) {
  var games = ourGames();
  var rows = ((state.data.stats && state.data.stats.logGoalies) || []).filter(function (r) {
    return r.name === name;
  });

  var lines = rows.map(function (r) {
    var g = gameFor(r, games);
    var line = g ? Object.assign({}, g) : unscheduled(r);

    delete line.game;

    line.min = r.min || 0;
    line.goalsAgainst = r.ga || 0;
    line.so = line.min > 0 && line.goalsAgainst === 0;

    // The log's own W/L/T stands in when the schedule has no score.
    if (!line.result && r.result) {
      line.result = r.result.charAt(0).toUpperCase();
    }

    return line;
  });

  lines.sort(function (x, y) {
    return x.date < y.date ? -1 : x.date > y.date ? 1 : 0;
  });

  return lines;
}

/**
 * What a skater's game lines add up to, beyond the totals table.
 *
 * @param {Object[]} lines - From skaterGames().
 * @returns {{withPoint: number, multiPoint: number, streak: number, best: Object|null, league: {g: number, a: number, pts: number, pim: number, games: number}}}
 */
function skaterSummary(lines) {
  var s = {
    withPoint: 0,
    multiPoint: 0,
    streak: 0,
    best: null,
    league: { g: 0, a: 0, pts: 0, pim: 0, games: 0 }
  };

  lines.forEach(function (l) {
    if (l.pts > 0) {
      s.withPoint += 1;
    }

    if (l.pts > 1) {
      s.multiPoint += 1;
    }

    if (l.pts > 0 && (!s.best || l.pts > s.best.pts || (l.pts === s.best.pts && l.g > s.best.g))) {
      s.best = l;
    }

    if (l.league) {
      s.league.games += 1;
      s.league.g += l.g;
      s.league.a += l.a;
      s.league.pim += l.pim;
    }
  });

  s.league.pts = s.league.g + s.league.a;

  // Games in a row with a point, counting back from the latest game.
  for (var i = lines.length - 1; i >= 0 && lines[i].pts > 0; i--) {
    s.streak += 1;
  }

  return s;
}

/**
 * What a goalie's game lines add up to.
 *
 * @param {Object[]} lines - From goalieGames().
 * @returns {{so: number, best: Object|null, league: {games: number, ga: number, min: number, w: number, l: number, t: number}}}
 */
function goalieSummary(lines) {
  var s = {
    so: 0,
    best: null,
    league: { games: 0, ga: 0, min: 0, w: 0, l: 0, t: 0 }
  };

  lines.forEach(function (l) {
    if (l.so) {
      s.so += 1;
    }

    if (
      l.min > 0 &&
      (!s.best || l.goalsAgainst < s.best.goalsAgainst || (l.goalsAgainst === s.best.goalsAgainst && l.min > s.best.min))
    ) {
      s.best = l;
    }

    if (l.league) {
      s.league.games += 1;
      s.league.ga += l.goalsAgainst;
      s.league.min += l.min;

      if (l.result === "W") {
        s.league.w += 1;
      } else if (l.result === "L") {
        s.league.l += 1;
      } else if (l.result === "T") {
        s.league.t += 1;
      }
    }
  });

  return s;
}

/**
 * The totals-table row for a name, and whether it is a skater or a goalie.
 *
 * @param {string} name - The short name.
 * @returns {{row: Object, kind: string}|null} kind is "skater" or "goalie".
 */
function findPlayer(name) {
  var st = state.data.stats;
  var i;

  if (!st || !name) {
    return null;
  }

  for (i = 0; i < st.skaters.length; i++) {
    if (st.skaters[i].name === name) {
      return { row: st.skaters[i], kind: "skater" };
    }
  }

  for (i = 0; i < st.goalies.length; i++) {
    if (st.goalies[i].name === name) {
      return { row: st.goalies[i], kind: "goalie" };
    }
  }

  return null;
}

export { findPlayer, goalieGames, goalieSummary, likeness, skaterGames, skaterSummary };
