/**
 * The Teams tab -> the team list, league pools, aliases and MyHockey links.
 *
 * An "Also known as" entry resolves an old or alternate spelling to the
 * current team name, because Schedule rows hold text, not references.
 * See ARCHITECTURE.md, "Teams tab".
 */
import { log, state } from "../state.js";
import { locateHeader } from "../util/csv.js";
import { bare, clean, norm, safeUrl } from "../util/text.js";

var SPEC_TEAMS = {
  team: ["teamname", "team"],
  pool: ["pooldivision", "pool", "division", "group"],
  alias: [
    "alsoknownas",
    "aka",
    "alsoknown",
    "othernames",
    "alternatenames",
    "formerlyknownas",
    "oldname",
    "othername"
  ],
  mhr: [
    "myhockeylink",
    "myhockey",
    "mhr",
    "mhrlink",
    "myhockeyrankings",
    "rankingslink",
    "rankings"
  ]
};

/** Only an address on this host may become a link on the page. */
var MHR_HOST = /^https?:\/\/(www\.)?myhockeyrankings\.com\//i;

/**
 * The year MyHockey Rankings counts the season from: this year from
 * September on, last year before that.
 *
 * @param {Date} [d] - Defaults to now.
 * @returns {number}
 */
function seasonYear(d) {
  d = d || new Date();

  return d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
}

/**
 * The MyHockey Rankings address for a team, or "".
 *
 * Takes a full MHR address or just the numeric team ID; an ID becomes the
 * address for the current season. Anything else is dropped with a log line.
 *
 * @param {string} raw - The "MyHockey link" cell.
 * @param {string} team - The team name, for the log line.
 * @returns {string}
 */
function mhrUrl(raw, team) {
  var v = clean(raw);

  if (!v) {
    return "";
  }

  if (/^\d{1,8}$/.test(v)) {
    return "https://myhockeyrankings.com/team_info.php?y=" + seasonYear() + "&t=" + v;
  }

  var u = safeUrl(v);

  if (u && MHR_HOST.test(u)) {
    return u;
  }

  log("teams: ignoring the MyHockey link for " + team + " (not an MHR address or ID): " + v);

  return "";
}

/**
 * Reads the Teams tab into the team list, pool map, alias map and MHR map.
 *
 * Aliases are separated by commas, semicolons or slashes. An alias that is
 * itself a team name is dropped.
 *
 * @param {string[][]} rows
 * @returns {{list: string[], pools: Object, alias: Object, mhr: Object}}
 */
function shapeTeams(rows) {
  var h = locateHeader(rows, SPEC_TEAMS);
  var out = [];
  var pools = bare();
  var alias = bare();
  var mhr = bare();

  if (!h || h.map.team === undefined) {
    state.problems.push("Couldn't find a “Team name” column on the Teams tab.");
    return { list: out, pools: pools, alias: alias, mhr: mhr };
  }

  for (var r = h.headerIndex + 1; r < rows.length; r++) {
    var name = clean(rows[r][h.map.team]);

    if (!name) {
      continue;
    }

    if (out.indexOf(name) === -1) {
      out.push(name);
    }

    if (h.map.pool !== undefined) {
      var p = clean(rows[r][h.map.pool]);

      if (p) {
        pools[name] = p;
      }
    }

    if (h.map.mhr !== undefined) {
      var m = mhrUrl(rows[r][h.map.mhr], name);

      if (m) {
        mhr[name] = m;
      }
    }

    if (h.map.alias !== undefined) {
      var raw = clean(rows[r][h.map.alias]);

      if (raw) {
        raw.split(/[,;\/]/).forEach(function (a) {
          var k = norm(a);

          // never let an alias hijack a name that is itself a team
          if (k && k !== norm(name)) {
            alias[k] = name;
          }
        });
      }
    }
  }

  var i;

  for (i = 0; i < out.length; i++) {
    if (alias[norm(out[i])]) {
      delete alias[norm(out[i])];
    }
  }

  var linked = Object.keys(mhr).length;

  log(
    "teams: " +
      out.length +
      (Object.keys(alias).length ? ", " + Object.keys(alias).length + " alias(es)" : "") +
      (linked ? ", " + linked + " with a MyHockey link" : "")
  );

  return { list: out, pools: pools, alias: alias, mhr: mhr };
}

export { shapeTeams, mhrUrl, seasonYear };
