/**
 * CSV parsing and header discovery.
 *
 * parseCSV handles quoted fields and both line endings. locateHeader finds
 * the header row wherever it sits (title rows above it are normal) and maps
 * field roles to column indexes by name. recoverByPosition fills in roles
 * whose header Google blanked. See ARCHITECTURE.md, "Why two read routes".
 */
import { norm } from "./text.js";

/**
 * Parses CSV text into rows of strings. A leading BOM is dropped.
 *
 * @param {string} text
 * @returns {string[][]}
 */
function parseCSV(text) {
  var rows = [];
  var row = [];
  var cur = "";
  var q = false;
  var i = 0;
  var c;
  var n;

  text = text.replace(/^﻿/, "");

  for (i = 0; i < text.length; i++) {
    c = text[i];

    if (q) {
      if (c === '"') {
        n = text[i + 1];

        if (n === '"') {
          cur += '"';
          i++;
        } else {
          q = false;
        }
      } else {
        cur += c;
      }
    } else {
      if (c === '"') {
        q = true;
      } else if (c === ",") {
        row.push(cur);
        cur = "";
      } else if (c === "\n") {
        row.push(cur);
        rows.push(row);
        row = [];
        cur = "";
      } else if (c === "\r") {
        /* skip */
      } else {
        cur += c;
      }
    }
  }

  if (cur !== "" || row.length) {
    row.push(cur);
    rows.push(row);
  }

  return rows;
}

/**
 * Finds the header row anywhere in the first 25 rows: the row that matches
 * the most spec fields wins.
 *
 * @param {string[][]} rows
 * @param {Object} spec - field -> array of normalized header names.
 * @returns {{headerIndex: number, map: Object, hits: number}|null}
 */
function locateHeader(rows, spec) {
  var best = null;

  for (var r = 0; r < Math.min(rows.length, 25); r++) {
    var map = {};
    var hits = 0;

    for (var c = 0; c < rows[r].length; c++) {
      var h = norm(rows[r][c]);

      if (!h) {
        continue;
      }

      for (var field in spec) {
        if (map[field] !== undefined) {
          continue;
        }

        if (spec[field].indexOf(h) !== -1) {
          map[field] = c;
          hits++;
          break;
        }
      }
    }

    if (hits > (best ? best.hits : 0)) {
      best = { headerIndex: r, map: map, hits: hits };
    }
  }

  return best;
}

/**
 * Fills in roles whose header Google blanked, from position. Roles sitting
 * between two identified columns must occupy the unclaimed columns between
 * them, in order, and only when the counts match exactly.
 * See ARCHITECTURE.md, "Why two read routes".
 *
 * @param {Object} map - field -> column index; filled in place.
 * @param {string[]} canonical - Every role, in sheet column order.
 * @param {number} width - Column count of the header row.
 * @returns {string[]} The roles that were filled in.
 */
function recoverByPosition(map, canonical, width) {
  var claimed = {};
  var k;
  var filled = [];

  for (k in map) {
    if (Object.prototype.hasOwnProperty.call(map, k)) {
      claimed[map[k]] = k;
    }
  }

  var found = [];

  canonical.forEach(function (role, i) {
    if (map[role] !== undefined) {
      found.push({ role: role, i: i, col: map[role] });
    }
  });

  if (!found.length) {
    return filled;
  }

  /**
   * Assigns the missing roles to the unclaimed columns in [from, to), only
   * when the counts match exactly.
   *
   * @param {string[]} missing
   * @param {number} from
   * @param {number} to
   */
  function fill(missing, from, to) {
    if (!missing.length) {
      return;
    }

    var gap = [];

    for (var c = from; c < to; c++) {
      if (claimed[c] === undefined) {
        gap.push(c);
      }
    }

    if (gap.length !== missing.length) {
      return;
    }

    missing.forEach(function (role, n) {
      map[role] = gap[n];
      claimed[gap[n]] = role;
      filled.push(role);
    });
  }

  // Columns left of the first recognised one: this is where the date-typed
  // Date header lands.
  fill(canonical.slice(0, found[0].i), 0, found[0].col);

  for (var i = 0; i < found.length - 1; i++) {
    fill(canonical.slice(found[i].i + 1, found[i + 1].i), found[i].col + 1, found[i + 1].col);
  }

  // And anything past the last one.
  var last = found[found.length - 1];

  fill(canonical.slice(last.i + 1), last.col + 1, width);

  return filled;
}

export { parseCSV, locateHeader, recoverByPosition };
