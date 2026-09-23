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
      h2h: bare()
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

export { rulesFor, standings };
