/**
 * The Player Stats tab -> skater and goalie totals.
 *
 * Reads the two totals blocks, anchored on the "Player" and "Goalie"
 * headers, with numeric headers matched by name or by position, and the two
 * game logs to their right, anchored on their Date columns. Names leave here
 * as first name + last initial; the full name never enters the model.
 * See ARCHITECTURE.md, "Player Stats tab".
 */
import { log, state } from "../state.js";
import { parseDate } from "../util/dates.js";
import { clean, norm } from "../util/text.js";

var SPEC_SKATER = {
  gp: ["gp", "gamesplayed", "games"],
  g: ["g", "goals"],
  a: ["a", "assists"],
  pts: ["pts", "points", "p"],
  pim: ["pim", "penaltyminutes", "penaltymin"]
};

var SPEC_GOALIE = {
  gp: ["gp", "gamesplayed", "games"],
  min: ["min", "mins", "minutes"],
  saves: ["saves", "sv"],
  ga: ["ga", "goalsagainst"],
  svpct: ["svpct", "savepct", "savepercentage"],
  gaa: ["gaa", "goalsagainstaverage", "goalsagainstavg"],
  so: ["so", "shutouts"],
  w: ["w", "wins"],
  l: ["l", "losses"]
};

/** Header spellings for the jersey number column, which sits left of the name. */
var NUMBER_HEADS = ["no", "num", "number", "jersey"];

/** The game logs, which carry one row per player per game. */
var SPEC_LOG_SKATER = {
  date: ["date", "gamedate"],
  opponent: ["opponent", "opp", "versus", "vs", "against"],
  no: NUMBER_HEADS,
  player: ["player", "skater", "name"],
  g: ["g", "goals"],
  a: ["a", "assists"],
  pim: ["pim", "penaltyminutes", "penaltymin"]
};

var SPEC_LOG_GOALIE = {
  date: ["date", "gamedate"],
  opponent: ["opponent", "opp", "versus", "vs", "against"],
  no: NUMBER_HEADS,
  goalie: ["goalie", "name", "keeper"],
  min: ["min", "mins", "minutes"],
  saves: ["saves", "sv"],
  ga: ["ga", "goalsagainst"],
  result: ["result", "wl", "outcome", "wlt"]
};

/**
 * A stat cell as a number, or null. "1.5", "0.", "0.792" and "1,234" are
 * numbers; "" and "-" are not.
 *
 * @param {string} v
 * @returns {number|null}
 */
function numf(v) {
  var s = clean(v).replace(/,/g, "");

  if (s === "" || s === "-" || s === "—") {
    return null;
  }

  if (!/^-?\d*\.?\d*$/.test(s) || s === "." || s === "-") {
    return null;
  }

  var n = parseFloat(s);

  return isNaN(n) ? null : n;
}

/**
 * First name plus last initial: "Sam O'Connell" -> "Sam O.". The initial is
 * the first character of the last word that is a letter.
 *
 * @param {string} full
 * @returns {string}
 */
function shortName(full) {
  var parts = clean(full)
    .split(" ")
    .filter(function (p) {
      return p;
    });

  if (parts.length < 2) {
    return parts.join(" ");
  }

  var last = parts[parts.length - 1];
  var first = parts.slice(0, -1).join(" ");
  var m = /[A-Za-zÀ-ɏ]/.exec(last);

  return first + " " + (m ? m[0].toUpperCase() + "." : last);
}

/**
 * Maps the headers of one block: named where the header survived,
 * positional where it did not.
 *
 * A header containing "%" is a percentage and nothing else, so "SV%" can
 * never claim the Saves column.
 *
 * @param {string[]} row - The header row.
 * @param {number} anchor - The column holding "Player" or "Goalie".
 * @param {number} end - Where the block ends (the next anchor, or the row's width).
 * @param {string[]} canonical - Column keys in sheet order, for positional fallback.
 * @param {Object} spec - Header spellings per key.
 * @returns {{map: Object, positional: string[]}}
 */
function blockColumns(row, anchor, end, canonical, spec) {
  var map = {};
  var claimed = {};
  var c;
  var h;
  var k;
  var i;

  claimed[anchor] = 1;

  for (c = anchor + 1; c < end; c++) {
    h = norm(row[c]);

    if (!h) {
      continue;
    }

    if (/%/.test(String(row[c]))) {
      for (k in spec) {
        if (
          Object.prototype.hasOwnProperty.call(spec, k) &&
          k.indexOf("pct") !== -1 &&
          map[k] === undefined
        ) {
          map[k] = c;
          claimed[c] = 1;
          break;
        }
      }

      continue;
    }

    for (k in spec) {
      if (Object.prototype.hasOwnProperty.call(spec, k)) {
        if (map[k] !== undefined || k.indexOf("pct") !== -1) {
          continue;
        }

        if (spec[k].indexOf(h) !== -1) {
          map[k] = c;
          claimed[c] = 1;
          break;
        }
      }
    }
  }

  var positional = [];

  for (i = 0; i < canonical.length; i++) {
    k = canonical[i];

    if (map[k] !== undefined) {
      continue;
    }

    c = anchor + 1 + i;

    if (c < end && !claimed[c]) {
      map[k] = c;
      claimed[c] = 1;
      positional.push(k);
    }
  }

  // the jersey number sits just left of the name
  map.no = anchor > 0 ? anchor - 1 : undefined;

  for (c = anchor - 1; c >= 0 && c >= anchor - 2; c--) {
    if (NUMBER_HEADS.indexOf(norm(row[c])) !== -1) {
      map.no = c;
      break;
    }
  }

  map.name = anchor;

  return { map: map, positional: positional };
}

/**
 * Reads the Player Stats tab into sorted skater and goalie lists, or null
 * when there is nothing to show.
 *
 * Each block runs from its anchor to the next block's anchor; the game logs
 * further right start with a Date column, which ends the goalie block. GAA
 * is not figured here: it depends on how long a game is, which is a setting,
 * so the page works it out at render time from ga and min.
 *
 * @param {string[][]} rows
 * @returns {{skaters: Object[], goalies: Object[]}|null}
 */
function shapeStats(rows) {
  var out = { skaters: [], goalies: [], logSkaters: [], logGoalies: [] };
  var r;
  var c;
  var hdr = -1;
  var pc = -1;
  var gc = -1;
  var width = 0;

  for (r = 0; r < Math.min(rows.length, 25) && hdr < 0; r++) {
    for (c = 0; c < rows[r].length; c++) {
      var h = norm(rows[r][c]);

      if (h === "player" && pc < 0) {
        pc = c;
      } else if (h === "goalie" && gc < 0) {
        gc = c;
      }
    }

    if (pc >= 0 || gc >= 0) {
      hdr = r;
    } else {
      pc = -1;
      gc = -1;
    }
  }

  if (hdr < 0) {
    state.statsNote = "no Player / Goalie header row found";
    state.problems.push(
      "Player Stats tab: couldn't find the header row. Row 2 should have a Player column and a Goalie column, each with its totals to the right."
    );
    return null;
  }

  for (r = 0; r < rows.length; r++) {
    if (rows[r].length > width) {
      width = rows[r].length;
    }
  }

  var head = rows[hdr];

  /**
   * Reads one block's rows into objects, stopping at the first blank name.
   *
   * @param {number} anchor - The block's name column, or -1 for no block.
   * @param {number} end - Where the block ends.
   * @param {string[]} canonical - Column keys in sheet order.
   * @param {Object} spec - Header spellings per key.
   * @param {string} shape - "s" for skaters, "g" for goalies (log text only).
   * @returns {Object[]}
   */
  function readBlock(anchor, end, canonical, spec, shape) {
    if (anchor < 0) {
      return [];
    }

    var cols = blockColumns(head, anchor, end, canonical, spec);
    var list = [];

    if (cols.positional.length) {
      log(
        "stats: " +
          (shape === "s" ? "skater" : "goalie") +
          " headers placed by position -> " +
          cols.positional.join(", ")
      );
    }

    for (var rr = hdr + 1; rr < rows.length; rr++) {
      var name = clean(rows[rr][anchor]);

      if (!name) {
        break; // the block ends at the first blank name
      }

      var row = rows[rr];
      var o = {
        name: shortName(name),
        no: cols.map.no !== undefined ? numf(row[cols.map.no]) : null
      };

      for (var k in cols.map) {
        if (Object.prototype.hasOwnProperty.call(cols.map, k) && k !== "no" && k !== "name") {
          o[k] = numf(row[cols.map[k]]);
        }
      }

      list.push(o);
    }

    return list;
  }

  /**
   * Reads one game-log block: a run of columns that starts with Date and
   * carries one row per player per game.
   *
   * Rows stop at the first blank date, the same way the totals blocks stop
   * at the first blank name. A row with a date but no name is skipped rather
   * than ending the block, because a manager clearing a mistyped name should
   * not truncate the season.
   *
   * @param {number} start - The block's Date column.
   * @param {number} end - Where the block ends.
   * @param {Object} spec - Header spellings per key.
   * @param {string} nameKey - "player" or "goalie".
   * @returns {Object[]}
   */
  function readLog(start, end, spec, nameKey) {
    var map = {};
    var cc;
    var k;

    for (cc = start; cc < end; cc++) {
      var hh = norm(head[cc]);

      for (k in spec) {
        if (
          Object.prototype.hasOwnProperty.call(spec, k) &&
          map[k] === undefined &&
          spec[k].indexOf(hh) !== -1
        ) {
          map[k] = cc;
        }
      }
    }

    if (map.date === undefined || map[nameKey] === undefined) {
      return [];
    }

    var list = [];

    for (var rr = hdr + 1; rr < rows.length; rr++) {
      var row = rows[rr] || [];
      var iso = parseDate(clean(row[map.date]));

      if (!iso) {
        break;
      }

      var nm = clean(row[map[nameKey]]);

      if (!nm) {
        continue;
      }

      var o = { date: iso, name: shortName(nm) };

      o.opponent = map.opponent === undefined ? "" : clean(row[map.opponent]);
      o.result = map.result === undefined ? "" : norm(row[map.result]);

      ["no", "g", "a", "pim", "min", "saves", "ga"].forEach(function (key) {
        if (map[key] !== undefined) {
          o[key] = numf(row[map[key]]);
        }
      });

      list.push(o);
    }

    return list;
  }

  // Every game-log block starts with its own Date column. The first one also
  // marks where the goalie totals stop.
  var dateCols = [];

  for (c = Math.max(pc, gc) + 1; c < head.length; c++) {
    if (norm(head[c]) === "date") {
      dateCols.push(c);
    }
  }

  var logStart = dateCols.length ? dateCols[0] : width;

  out.skaters = readBlock(
    pc,
    gc > pc ? gc : logStart,
    ["gp", "g", "a", "pts", "pim"],
    SPEC_SKATER,
    "s"
  );

  out.goalies = readBlock(
    gc,
    gc > pc ? logStart : pc > gc ? pc : logStart,
    ["gp", "min", "saves", "ga", "svpct", "so", "w", "l"],
    SPEC_GOALIE,
    "g"
  );

  // Each log block runs from its Date column to the next one. Which block is
  // which is decided by the name column inside it, not by its position, so a
  // sheet that lists goalies first still reads correctly.
  dateCols.forEach(function (start, i) {
    var end = i + 1 < dateCols.length ? dateCols[i + 1] : width;
    var hasPlayer = false;
    var hasGoalie = false;

    for (var cc = start; cc < end; cc++) {
      var hh = norm(head[cc]);

      if (SPEC_LOG_SKATER.player.indexOf(hh) !== -1) {
        hasPlayer = true;
      } else if (hh === "goalie") {
        hasGoalie = true;
      }
    }

    if (hasGoalie) {
      out.logGoalies = readLog(start, end, SPEC_LOG_GOALIE, "goalie");
    } else if (hasPlayer) {
      out.logSkaters = readLog(start, end, SPEC_LOG_SKATER, "player");
    }
  });

  if (out.logSkaters.length || out.logGoalies.length) {
    log(
      "stats: game log read -> " +
        out.logSkaters.length +
        " skater rows, " +
        out.logGoalies.length +
        " goalie rows"
    );
  }

  out.skaters.forEach(function (s) {
    if (s.pts === null && (s.g !== null || s.a !== null)) {
      s.pts = (s.g || 0) + (s.a || 0);
    }
  });

  // Points, then goals, then the lower number: the same order a program prints.
  out.skaters.sort(function (x, y) {
    if ((y.pts || 0) !== (x.pts || 0)) {
      return (y.pts || 0) - (x.pts || 0);
    }

    if ((y.g || 0) !== (x.g || 0)) {
      return (y.g || 0) - (x.g || 0);
    }

    return (x.no || 999) - (y.no || 999);
  });

  // Whatever the fifth goalie column says, SV% on older tabs or GAA on newer
  // ones, ga and min are what the page figures GAA from. See ui/stats.js.
  out.goalies.forEach(function (g) {
    if (g.gaa === undefined) {
      g.gaa = null;
    }
  });

  out.goalies.sort(function (x, y) {
    if ((y.gp || 0) !== (x.gp || 0)) {
      return (y.gp || 0) - (x.gp || 0);
    }

    return (x.no || 999) - (y.no || 999);
  });

  if (!out.skaters.length && !out.goalies.length) {
    state.statsNote = "header row found but no player rows under it";
    return null;
  }

  state.statsNote = "";
  log("stats: " + out.skaters.length + " skaters, " + out.goalies.length + " goalies");

  return out;
}

export { shapeStats };
