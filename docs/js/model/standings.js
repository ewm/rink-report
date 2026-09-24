/**
 * Standings: points, then the competition's own tiebreak sequence.
 *
 * RULESETS is data, not code: real events publish real sequences and they
 * disagree. Groups level on points are settled separately (pairs vs. three
 * or more), and teams a ruleset cannot separate keep the same rank.
 * See ARCHITECTURE.md, "Standings and tiebreaks".
 */
import { isBracket, isExhibition, played } from "./game.js";
import { ratings } from "./rating.js";
import { state } from "../state.js";
import { bare, norm } from "../util/text.js";

/**
 * Published tiebreak sequences, keyed by the normalised Settings value.
 *
 * `two` settles a pair and `many` a group of three or more, because
 * head-to-head decides a pair and means nothing across three clubs who did
 * not all play each other.
 */
var RULESETS = {
  none: {
    label: "No published tiebreakers",
    two: [],
    many: [],
    shareRank: true,
    note: "This event publishes no tiebreakers, so teams level on points are shown level here."
  },
  goalpercentage: {
    label: "Head-to-head, then goal percentage",
    two: ["h2h", "goalpct", "diff", "fewestga"],
    many: ["goalpct", "diff", "fewestga"],
    note: "Ties broken by head-to-head, then goal percentage — goals for divided by total goals for and against — then goal differential, then fewest goals against."
  },
  usahockey: {
    label: "USA Hockey",
    two: ["wins", "regwins", "diff", "quotient"],
    many: ["wins", "regwins", "diff", "quotient"],
    cap: 8,
    note: "Ties broken by most wins, then goal differential and goal quotient, each capped at eight goals a game."
  },
  differential: {
    label: "Head-to-head, then differential",
    two: ["h2h", "diff", "gf"],
    many: ["diff", "gf"],
    note: "Ties broken by head-to-head, then goal differential, then goals for."
  },
  wnyahl: {
    label: "WNYAHL",
    custom: "wnyahl",
    two: [],
    many: [],
    note:
      "Ties broken by WNYAHL rules: first the games between the tied teams, if they have all " +
      "played each other (points, wins, goal differential, goals for divided by goals against), " +
      "then all games (wins, goal differential, goals for divided by goals against). Periods won " +
      "and quickest first goal aren't in the sheet, so teams still level after that are shown level."
  }
};

/**
 * The ruleset for a view: the Settings tab's choice, else "none" for an
 * event with no bracket (nobody seeds it), else "differential".
 *
 * @param {Object} [v] - The view.
 * @returns {Object}
 */
function rulesFor(v) {
  var key = norm(state.data.config.rules || "");

  if (RULESETS[key]) {
    return RULESETS[key];
  }

  // An event nobody seeds gets no invented order.
  if (v && v.event && !v.hasBracket) {
    return RULESETS.none;
  }

  return RULESETS.differential;
}

/** Every comparator returns a number: higher is better unless noted. */
var METRIC = {
  goalpct: function (r) {
    return r.gf + r.ga ? r.gf / (r.gf + r.ga) : 0;
  },
  diff: function (r, c) {
    return c ? r.cap : r.gf - r.ga;
  },
  quotient: function (r) {
    return r.ga ? r.gf / r.ga : r.gf ? Infinity : 0;
  },
  fewestga: function (r) {
    return -r.ga;
  },
  wins: function (r) {
    return r.w;
  },
  regwins: function (r) {
    return r.w;
  }, // no OT/SO column in the sheet
  gf: function (r) {
    return r.gf;
  }
};

/**
 * Builds the standings table for a set of games.
 *
 * Scrimmages count toward nothing, and at an event bracket games do not
 * move the pool standings. `cap` accumulates the capped goal margin for
 * rulesets with a cap. Each row also gets `rating` (see model/rating.js),
 * worked out from the same games the table counts, or null before the
 * team's first game. The rating never changes the order.
 *
 * @param {Object[]} games
 * @param {string[]} teams - The clubs to list.
 * @param {boolean} isEvent - Whether this is an event view.
 * @param {Object} [rules] - A RULESETS entry.
 * @returns {Object[]}
 */
function standings(games, teams, isEvent, rules) {
  var cfg = state.data.config;
  var rows = bare();
  var counted = [];
  var i;
  var g;

  for (i = 0; i < teams.length; i++) {
    rows[teams[i]] = {
      team: teams[i],
      gp: 0,
      w: 0,
      l: 0,
      t: 0,
      gf: 0,
      ga: 0,
      cap: 0,
      pts: 0,
      h2h: bare(),
      vs: bare()
    };
  }

  for (i = 0; i < games.length; i++) {
    g = games[i];

    if (!played(g)) {
      continue;
    }

    if (isExhibition(g)) {
      continue; // a scrimmage counts toward nothing
    }

    if (isEvent && isBracket(g)) {
      continue; // playoffs don't move pool standings
    }

    if (g.home === g.away) {
      continue;
    }

    var h = rows[g.home];
    var a = rows[g.away];

    if (!h || !a) {
      continue;
    }

    counted.push(g);
    h.gp++;
    a.gp++;
    h.gf += g.hs;
    h.ga += g.as;
    a.gf += g.as;
    a.ga += g.hs;

    var margin = Math.min((rules && rules.cap) || 99, Math.abs(g.hs - g.as));

    addVs(h, g.away, g.hs, g.as);
    addVs(a, g.home, g.as, g.hs);

    if (g.hs > g.as) {
      h.w++;
      a.l++;
      h.cap += margin;
      a.cap -= margin;
      h.h2h[g.away] = (h.h2h[g.away] || 0) + 1;
      a.h2h[g.home] = (a.h2h[g.home] || 0) - 1;
    } else if (g.hs < g.as) {
      a.w++;
      h.l++;
      a.cap += margin;
      h.cap -= margin;
      a.h2h[g.home] = (a.h2h[g.home] || 0) + 1;
      h.h2h[g.away] = (h.h2h[g.away] || 0) - 1;
    } else {
      h.t++;
      a.t++;
    }
  }

  var rated = ratings(counted);
  var out = [];

  for (var k in rows) {
    if (Object.prototype.hasOwnProperty.call(rows, k)) {
      var r = rows[k];

      r.pts = r.w * cfg.ptsWin + r.t * cfg.ptsTie + r.l * cfg.ptsLoss;
      r.diff = r.gf - r.ga;
      r.rating = r.gp ? rated[r.team] : null;
      out.push(r);
    }
  }

  return orderTable(out, rules, isEvent);
}

/**
 * Sorts by points, then settles each level group with the ruleset's own
 * sequence: the two-team path for a pair, the many path for three or more,
 * and any adjacent pair still level afterwards gets the pair path
 * (resettlePairs). Teams the ruleset cannot separate get level = true.
 * See ARCHITECTURE.md, "Standings and tiebreaks".
 *
 * @param {Object[]} rows - Standings rows from standings().
 * @param {Object} [rules] - A RULESETS entry; defaults to differential.
 * @param {boolean} isEvent
 * @returns {Object[]}
 */
function orderTable(rows, rules, isEvent) {
  rules = rules || RULESETS.differential;

  var groups = bare();
  var order = [];

  rows.forEach(function (r) {
    if (!groups[r.pts]) {
      groups[r.pts] = [];
      order.push(r.pts);
    }

    groups[r.pts].push(r);
  });

  order.sort(function (a, b) {
    return b - a;
  });

  var out = [];

  order.forEach(function (p) {
    var g = groups[p];

    if (rules.custom === "wnyahl") {
      wnyahlPlace(g).forEach(function (r) {
        out.push(r);
      });

      return;
    }

    if (g.length === 1) {
      g[0].level = false;
      out.push(g[0]);
      return;
    }

    settle(g, g.length === 2 ? rules.two : rules.many, rules);

    if (g.length > 2) {
      resettlePairs(g, rules);
    }

    var unresolved = allEqual(g, g.length === 2 ? rules.two : rules.many, rules);

    g.forEach(function (r) {
      r.level = unresolved;
      out.push(r);
    });
  });

  return out;
}

/**
 * Adds one game to a row's record against one opponent.
 *
 * @param {Object} row - A standings row.
 * @param {string} opp - The opponent's name.
 * @param {number} gf - Goals this team scored.
 * @param {number} ga - Goals the opponent scored.
 */
function addVs(row, opp, gf, ga) {
  var v = row.vs[opp] || (row.vs[opp] = { gp: 0, w: 0, t: 0, gf: 0, ga: 0 });

  v.gp++;
  v.gf += gf;
  v.ga += ga;

  if (gf > ga) {
    v.w++;
  } else if (gf === ga) {
    v.t++;
  }
}

/**
 * Goals for divided by goals against, the WNYAHL way: dividing by zero
 * ranks above any real quotient, and teams with no goals against are then
 * ordered by goals for.
 *
 * @param {number} gf
 * @param {number} ga
 * @returns {number}
 */
function quotientOf(gf, ga) {
  return ga ? gf / ga : 1e9 + gf;
}

/**
 * Whether every pair of teams in a group has played each other at least
 * once in the counted games.
 *
 * @param {Object[]} tied - Standings rows.
 * @returns {boolean}
 */
function allPlayedEachOther(tied) {
  for (var i = 0; i < tied.length; i++) {
    for (var j = i + 1; j < tied.length; j++) {
      if (!tied[i].vs[tied[j].team]) {
        return false;
      }
    }
  }

  return true;
}

/**
 * The WNYAHL step 1 measures: each team's record in the games between the
 * tied teams only (points, wins, differential, quotient).
 *
 * @param {Object[]} tied - Standings rows.
 * @returns {Function[]} One function per measure, (row) -> number.
 */
function headToHeadMeasures(tied) {
  var cfg = state.data.config;
  var mini = bare();

  tied.forEach(function (r) {
    var m = { pts: 0, w: 0, gf: 0, ga: 0 };

    tied.forEach(function (o) {
      var v = r.vs[o.team];

      if (o === r || !v) {
        return;
      }

      m.w += v.w;
      m.gf += v.gf;
      m.ga += v.ga;
      m.pts += v.w * cfg.ptsWin + v.t * cfg.ptsTie + (v.gp - v.w - v.t) * cfg.ptsLoss;
    });

    mini[r.team] = m;
  });

  return [
    function (r) {
      return mini[r.team].pts;
    },
    function (r) {
      return mini[r.team].w;
    },
    function (r) {
      return mini[r.team].gf - mini[r.team].ga;
    },
    function (r) {
      return quotientOf(mini[r.team].gf, mini[r.team].ga);
    }
  ];
}

/** The WNYAHL step 2 measures, over all the games each team played. */
var ALL_GAMES_MEASURES = [
  function (r) {
    return r.w;
  },
  function (r) {
    return r.gf - r.ga; // no cap: the league's differential is plain GF - GA
  },
  function (r) {
    return quotientOf(r.gf, r.ga);
  }
];

/**
 * Splits a group by one measure into buckets of equal value, best first.
 *
 * @param {Object[]} tied
 * @param {Function} measure - (row) -> number, higher is better.
 * @returns {Object[][]}
 */
function splitBy(tied, measure) {
  var sorted = tied.slice().sort(function (x, y) {
    return measure(y) - measure(x) || x.team.localeCompare(y.team);
  });

  var buckets = [];

  sorted.forEach(function (r) {
    var last = buckets[buckets.length - 1];

    if (last && measure(last[0]) === measure(r)) {
      last.push(r);
    } else {
      buckets.push([r]);
    }
  });

  return buckets;
}

/**
 * Orders teams level on points by the WNYAHL tiebreak.
 *
 * Step 1 uses only the games between the tied teams, and only when all of
 * them have played each other; step 2 uses all games. The first measure
 * that separates anyone places them, and every group still tied starts
 * again at step 1 with only its own members. Periods won, quickest first
 * goal and the shootout need data the sheet does not have, so teams still
 * tied after step 2 are marked level and share a rank (tieKey keeps two
 * separate level groups on the same points from sharing one number).
 *
 * @param {Object[]} tied - Standings rows level on points.
 * @returns {Object[]} The same rows, in order.
 */
function wnyahlPlace(tied) {
  if (tied.length === 1) {
    tied[0].level = false;
    tied[0].tieKey = undefined;
    return tied;
  }

  var measures = allPlayedEachOther(tied) ? headToHeadMeasures(tied) : [];

  measures = measures.concat(ALL_GAMES_MEASURES);

  for (var i = 0; i < measures.length; i++) {
    var buckets = splitBy(tied, measures[i]);

    if (buckets.length > 1) {
      var out = [];

      buckets.forEach(function (b) {
        out = out.concat(wnyahlPlace(b));
      });

      return out;
    }
  }

  var key = tied
    .map(function (r) {
      return r.team;
    })
    .sort()
    .join("|");

  tied.sort(function (x, y) {
    return x.team.localeCompare(y.team);
  });

  tied.forEach(function (r) {
    r.level = true;
    r.tieKey = key;
  });

  return tied;
}

/**
 * Sorts a level group in place by a tiebreak sequence, falling back to team
 * name so the order is stable.
 *
 * @param {Object[]} g - The group.
 * @param {string[]} seq - Metric keys, "h2h" included.
 * @param {Object} rules - The RULESETS entry, for its cap.
 */
function settle(g, seq, rules) {
  g.sort(function (x, y) {
    for (var i = 0; i < seq.length; i++) {
      var k = seq[i];

      if (k === "h2h") {
        var res = x.h2h[y.team] || 0;

        if (res !== 0) {
          return res > 0 ? -1 : 1;
        }

        continue;
      }

      var f = METRIC[k];

      if (!f) {
        continue;
      }

      var a = f(x, rules.cap);
      var b = f(y, rules.cap);

      if (a !== b) {
        return b - a;
      }
    }

    return x.team.localeCompare(y.team);
  });
}

/**
 * Re-settles each adjacent pair still level on the many path with the
 * two-team path, in place.
 *
 * @param {Object[]} g - A group of three or more, already settled.
 * @param {Object} rules
 */
function resettlePairs(g, rules) {
  for (var i = 0; i < g.length - 1; i++) {
    if (sameOn(g[i], g[i + 1], rules.many, rules)) {
      var pair = [g[i], g[i + 1]];

      settle(pair, rules.two, rules);
      g[i] = pair[0];
      g[i + 1] = pair[1];
    }
  }
}

/**
 * Whether two rows are equal on every metric in a sequence (h2h ignored).
 *
 * @param {Object} x
 * @param {Object} y
 * @param {string[]} seq
 * @param {Object} rules
 * @returns {boolean}
 */
function sameOn(x, y, seq, rules) {
  for (var i = 0; i < seq.length; i++) {
    var k = seq[i];

    if (k === "h2h") {
      continue;
    }

    var f = METRIC[k];

    if (!f) {
      continue;
    }

    if (f(x, rules.cap) !== f(y, rules.cap)) {
      return false;
    }
  }

  return true;
}

/**
 * Whether a whole group is equal on every metric in a sequence.
 *
 * @param {Object[]} g
 * @param {string[]} seq
 * @param {Object} rules
 * @returns {boolean}
 */
function allEqual(g, seq, rules) {
  if (!seq.length) {
    return true; // nothing published: everyone stays level
  }

  for (var i = 1; i < g.length; i++) {
    if (!sameOn(g[0], g[i], seq, rules)) {
      return false;
    }
  }

  // sameOn() skips head-to-head because it only means something for a pair.
  // A pair the sequence settles on head-to-head is not level.
  if (g.length === 2 && seq.indexOf("h2h") !== -1 && g[0].h2h && g[0].h2h[g[1].team]) {
    return false;
  }

  return true;
}

export { RULESETS, rulesFor, standings };
