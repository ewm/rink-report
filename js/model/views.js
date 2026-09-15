/**
 * Views: what the data contains, and what the bar shows.
 *
 * dataViews() is every view the schedule implies (league play plus one per
 * named event), derived, never configured. buildViews() is the BAR: league,
 * the one live-or-next event, Events, Stats. currentView() is the view on
 * screen, from viewKey or from the calendar.
 * See ARCHITECTURE.md, "Views".
 */
import { isBracket, isExhibition, isOurs, played } from "./game.js";
import { on, state } from "../state.js";
import { daysUntil, todayISO } from "../util/dates.js";
import { bare, norm } from "../util/text.js";

/**
 * Every view the schedule implies: league play (rows with a blank Event),
 * then one view per named event in date order.
 *
 * @returns {Object[]}
 */
function dataViews() {
  var league = [];
  var byEvent = bare();
  var order = [];

  state.data.games.forEach(function (g) {
    if (!g.event) {
      league.push(g);
      return;
    }

    if (!byEvent[g.event]) {
      byEvent[g.event] = [];
      order.push(g.event);
    }

    byEvent[g.event].push(g);
  });

  order.sort(function (a, b) {
    var fa = firstDate(byEvent[a]);
    var fb = firstDate(byEvent[b]);

    return fa < fb ? -1 : fa > fb ? 1 : a.localeCompare(b);
  });

  var out = [];

  if (league.length || !order.length) {
    out.push({
      key: "league",
      label: "League play",
      tab: "League",
      games: league,
      event: false,
      hasBracket: false
    });
  }

  order.forEach(function (n) {
    var gs = byEvent[n];
    var hasBracket = false;

    gs.forEach(function (g) {
      if (isBracket(g)) {
        hasBracket = true;
      }
    });

    out.push({
      key: "ev:" + n,
      label: n,
      tab: tabLabel(n),
      games: gs,
      event: true,
      hasBracket: hasBracket,
      first: firstDate(gs),
      last: lastDate(gs)
    });
  });

  return out;
}

/**
 * Whether any game in a view is within a day of today.
 *
 * @param {Object} v
 * @returns {boolean}
 */
function isLive(v) {
  var live = false;

  v.games.forEach(function (g) {
    var d = daysUntil(g.date);

    if (d !== null && d >= -1 && d <= 1) {
      live = true;
    }
  });

  return live;
}

/**
 * The event that earns a bar button: one being played this weekend, else
 * the next one on the calendar, else null once the last event is over.
 *
 * @param {Object[]} views - From dataViews().
 * @returns {Object|null}
 */
function featuredEvent(views) {
  var i;
  var today = todayISO();
  var next = null;

  for (i = 0; i < views.length; i++) {
    if (views[i].event && isLive(views[i])) {
      return views[i];
    }
  }

  for (i = 0; i < views.length; i++) {
    var v = views[i];

    if (!v.event || v.first < today) {
      continue;
    }

    if (!next || v.first < next.first) {
      next = v;
    }
  }

  return next;
}

/**
 * The views the bar shows: league play, the featured event, an Events tab
 * when other events exist, and Stats when there are any.
 *
 * With the events switch off the bar is league play (and Stats): no
 * featured event, no Events tab.
 *
 * @returns {Object[]}
 */
function buildViews() {
  var all = dataViews();
  var out = [];
  var feat = on("events") ? featuredEvent(all) : null;
  var others = 0;
  var i;

  for (i = 0; i < all.length; i++) {
    if (!all[i].event) {
      out.push(all[i]);
    }
  }

  if (feat) {
    out.push(feat);
  }

  if (on("events")) {
    for (i = 0; i < all.length; i++) {
      if (all[i].event && all[i] !== feat) {
        others++;
      }
    }
  }

  if (others) {
    out.push({
      key: "events",
      label: "Tournaments & showcases",
      tab: "Events",
      games: [],
      event: false,
      hasBracket: false,
      events: true
    });
  }

  // A Stats tab that opens on nothing is a promise the page can't keep.
  if (hasStats()) {
    out.push({
      key: "stats",
      label: "Player stats",
      tab: "Stats",
      games: [],
      event: false,
      hasBracket: false,
      stats: true
    });
  }

  return out;
}

/**
 * Whether the stats switch is on and there is at least one skater or goalie.
 *
 * @returns {boolean}
 */
function hasStats() {
  return (
    on("stats") &&
    !!(state.data.stats && (state.data.stats.skaters.length || state.data.stats.goalies.length))
  );
}

/**
 * The league play view, for the masthead record chip, whatever tab is open.
 *
 * @param {Object[]} views
 * @returns {Object}
 */
function leagueView(views) {
  for (var i = 0; i < views.length; i++) {
    if (!views[i].event && !views[i].stats && !views[i].events) {
      return views[i];
    }
  }

  return views[0];
}

/**
 * The earliest ISO date in a list of games.
 *
 * @param {Object[]} gs
 * @returns {string}
 */
function firstDate(gs) {
  var d = "9999-99-99";

  gs.forEach(function (g) {
    if (g.date < d) {
      d = g.date;
    }
  });

  return d;
}

/**
 * The latest ISO date in a list of games.
 *
 * @param {Object[]} gs
 * @returns {string}
 */
function lastDate(gs) {
  var d = "0000-00-00";

  gs.forEach(function (g) {
    if (g.date > d) {
      d = g.date;
    }
  });

  return d;
}

/**
 * An event name short enough for a bar button, cut at a word boundary.
 *
 * @param {string} n
 * @returns {string}
 */
function tabLabel(n) {
  if (n.length <= 18) {
    return n;
  }

  var cut = n.slice(0, 17).replace(/\s+\S*$/, "");

  return (cut || n.slice(0, 17)) + "…";
}

/**
 * The view on screen: the one state.viewKey names (bar first, then any
 * event opened from the Events list), else whatever is live this weekend,
 * else the nearest event when Settings says showcase, else the first bar view.
 *
 * @returns {Object}
 */
function currentView() {
  var bar = buildViews();
  var vs = dataViews();
  var i;

  if (state.viewKey) {
    for (i = 0; i < bar.length; i++) {
      if (bar[i].key === state.viewKey) {
        return bar[i];
      }
    }

    // an event opened from the Events list
    if (on("events")) {
      for (i = 0; i < vs.length; i++) {
        if (vs[i].key === state.viewKey) {
          return vs[i];
        }
      }
    }
  }

  if (!on("events")) {
    return bar[0];
  }

  // with nothing chosen, open on whatever is happening this weekend
  for (i = 0; i < vs.length; i++) {
    if (vs[i].event && isLive(vs[i])) {
      return vs[i];
    }
  }

  // otherwise the Settings tab decides which one the page opens on
  if (norm(state.data.config.mode) === "showcase") {
    var near = null;
    var best = 1e9;

    for (i = 0; i < vs.length; i++) {
      if (!vs[i].event) {
        continue;
      }

      vs[i].games.forEach(function (g) {
        var d = daysUntil(g.date);

        if (d === null) {
          return;
        }

        var dist = Math.abs(d);

        if (dist < best) {
          best = dist;
          near = vs[i];
        }
      });
    }

    if (near) {
      return near;
    }
  }

  return bar[0];
}

/**
 * Which bar button lights up for a view: its own, or Events for an event
 * that was opened from the list.
 *
 * @param {Object[]} views - The bar views.
 * @param {Object} v - The view on screen.
 * @returns {string}
 */
function barKeyFor(views, v) {
  for (var i = 0; i < views.length; i++) {
    if (views[i].key === v.key) {
      return v.key;
    }
  }

  return v.event ? "events" : views[0] ? views[0].key : "";
}

/**
 * The clubs that actually play in a view (scrimmages excluded), so a club
 * seen only at a showcase never sits at 0-0-0 in the league table.
 *
 * Before a single fixture is typed in, the Teams tab is all there is to go on.
 *
 * @param {Object} v
 * @returns {string[]}
 */
function teamsInView(v) {
  var seen = bare();

  v.games.forEach(function (g) {
    if (isExhibition(g)) {
      return;
    }

    if (g.home) {
      seen[g.home] = 1;
    }

    if (g.away) {
      seen[g.away] = 1;
    }
  });

  var list = state.data.teams.filter(function (t) {
    return seen[t];
  });

  return list.length ? list : state.data.teams;
}

/**
 * Pool membership for a view. Pools belong to the event, not the team, so
 * an event view reads them from its own games; league divisions come from
 * the Teams tab.
 *
 * @param {Object} v
 * @returns {Object} team name -> pool
 */
function poolsInView(v) {
  if (!v.event) {
    return state.data.pools || {};
  }

  var map = bare();

  v.games.forEach(function (g) {
    if (!g.pool) {
      return;
    }

    if (g.home) {
      map[g.home] = g.pool;
    }

    if (g.away) {
      map[g.away] = g.pool;
    }
  });

  return map;
}

/**
 * Our own record in a view, bracket games included (this is our record,
 * not a pool standing), or null with no team name or no played games.
 *
 * @param {Object} v
 * @returns {{gp: number, w: number, l: number, t: number}|null}
 */
function ourRecordIn(v) {
  var us = state.data.config.teamName;
  var w = 0;
  var l = 0;
  var t = 0;
  var gp = 0;

  if (!us) {
    return null;
  }

  v.games.forEach(function (g) {
    if (!isOurs(g) || !played(g) || isExhibition(g)) {
      return;
    }

    var o = g.home === us ? g.hs : g.as;
    var x = g.home === us ? g.as : g.hs;

    gp++;

    if (o > x) {
      w++;
    } else if (o < x) {
      l++;
    } else {
      t++;
    }
  });

  return gp ? { gp: gp, w: w, l: l, t: t } : null;
}

export {
  dataViews,
  isLive,
  featuredEvent,
  buildViews,
  hasStats,
  leagueView,
  currentView,
  barKeyFor,
  teamsInView,
  poolsInView,
  ourRecordIn
};
