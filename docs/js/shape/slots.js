/**
 * The Ice slots tab -> the hours of ice each club brings to the scheduling
 * meeting. League staff page only.
 *
 * One row per slot: Home team, Rink, Date, Face-off, Notes. The scheduling
 * tool places that team's home games into its own slots. Team and rink
 * names snap onto the Teams and Rinks tabs the same way the Schedule does,
 * so "Lakeshore Lightnng" still counts and the tool says what it fixed.
 * See ARCHITECTURE.md, "Ice slots tab".
 */
import { log, state } from "../state.js";
import { locateHeader } from "../util/csv.js";
import { parseDate, timeKey } from "../util/dates.js";
import { clean, nearestName, norm } from "../util/text.js";

var SPEC_SLOTS = {
  team: ["hometeam", "team", "club", "home"],
  rink: ["rink", "rinkname", "arena", "venue", "location"],
  date: ["date", "day"],
  time: ["faceoff", "time", "start", "starttime"],
  notes: ["notes", "note"]
};

/**
 * Reads the Ice slots tab into a list of slots, earliest first.
 *
 * A row without a readable date, or a team that is not on the Teams tab
 * even after snapping, is dropped with a note in state.problems naming the
 * sheet row, so the manager can fix it before the tool runs.
 *
 * @param {string[][]} rows - The tab, as parseCSV() returns it.
 * @param {string[]} teamList - The Teams tab names, for snapping.
 * @returns {{team: string, rink: string, date: string, time: string, timeKey: number, notes: string, row: number}[]}
 */
function shapeSlots(rows, teamList) {
  var out = [];

  if (!rows || !rows.length) {
    return out;
  }

  var h = locateHeader(rows, SPEC_SLOTS);

  if (!h || h.map.team === undefined || h.map.date === undefined) {
    log("slots: no 'Home team' and 'Date' headers found, tab ignored");
    state.slotsNote = "needs Home team, Rink, Date and Face-off columns";

    return out;
  }

  var rinks = state.data.rinks || {};
  var rinkNames = Object.keys(rinks).map(function (k) {
    return rinks[k].name;
  });

  var dropped = [];

  for (var r = h.headerIndex + 1; r < rows.length; r++) {
    var row = rows[r];
    var team = clean(row[h.map.team]);
    var sheetRow = r + 1;

    if (!team) {
      continue;
    }

    var iso = parseDate(row[h.map.date]);

    if (!iso) {
      dropped.push("row " + sheetRow + " has no date the page can read");
      continue;
    }

    var snapped = snapTo(team, teamList);

    if (!snapped) {
      dropped.push('row ' + sheetRow + ': "' + team + '" is not on the Teams tab');
      continue;
    }

    var rink = h.map.rink !== undefined ? clean(row[h.map.rink]) : "";
    var rinkSnap = rink ? snapTo(rink, rinkNames) : "";
    var time = h.map.time !== undefined ? clean(row[h.map.time]) : "";

    out.push({
      team: snapped,
      rink: rinkSnap || rink,
      date: iso,
      time: time,
      timeKey: timeKey(time),
      notes: h.map.notes !== undefined ? clean(row[h.map.notes]) : "",
      row: sheetRow
    });
  }

  out.sort(function (a, b) {
    return a.date < b.date ? -1 : a.date > b.date ? 1 : a.timeKey - b.timeKey;
  });

  if (dropped.length) {
    state.problems.push(
      "Ice slots tab: " +
        dropped.length +
        " row" +
        (dropped.length === 1 ? "" : "s") +
        " left out. " +
        dropped.join("; ") +
        "."
    );
  }

  log("slots: " + out.length + " ice slots" + (dropped.length ? ", " + dropped.length + " dropped" : ""));

  return out;
}

/**
 * The list entry a typed name means: an exact match first, then the nearest
 * spelling within two edits, else "".
 *
 * @param {string} name
 * @param {string[]} list
 * @returns {string}
 */
function snapTo(name, list) {
  var want = norm(name);

  for (var i = 0; i < list.length; i++) {
    if (norm(list[i]) === want) {
      return list[i];
    }
  }

  return nearestName(name, list) || "";
}

export { shapeSlots };
