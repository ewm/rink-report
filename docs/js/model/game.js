/**
 * Facts about one game: played, bracket, scrimmage, ours, sort order.
 *
 * A bracket game is decided by the pool standings rather than feeding them,
 * and a scrimmage counts toward nothing at all.
 * See ARCHITECTURE.md, "Game types".
 */
import { state } from "../state.js";
import { timeKey } from "../util/dates.js";
import { norm } from "../util/text.js";

/**
 * Whether a game has both scores.
 *
 * @param {Object} g
 * @returns {boolean}
 */
function played(g) {
  return typeof g.hs === "number" && typeof g.as === "number";
}

/**
 * Words managers type for a game that counts toward nothing. Matched as
 * substrings of the normalised Game type.
 */
var EXHIBITION_WORDS = [
  "exhibition",
  "exhib",
  "scrimmage",
  "friendly",
  "nonleague",
  "nonqualifier"
];

/**
 * Whether the Game type is "bracket".
 *
 * @param {Object} g
 * @returns {boolean}
 */
function isBracket(g) {
  return norm(g.type) === "bracket";
}

/**
 * Whether the Game type contains any EXHIBITION_WORDS entry.
 *
 * @param {Object} g
 * @returns {boolean}
 */
function isExhibition(g) {
  var t = norm(g.type);

  if (!t) {
    return false;
  }

  for (var i = 0; i < EXHIBITION_WORDS.length; i++) {
    if (t.indexOf(EXHIBITION_WORDS[i]) !== -1) {
      return true;
    }
  }

  return false;
}

/**
 * Whether our team (Settings tab) is playing in this game.
 *
 * @param {Object} g
 * @returns {boolean}
 */
function isOurs(g) {
  var t = state.data.config.teamName;

  return !!t && (g.home === t || g.away === t);
}

/**
 * Sort comparator: by date, then face-off time.
 *
 * @param {Object} a
 * @param {Object} b
 * @returns {number}
 */
function bySlot(a, b) {
  if (a.date !== b.date) {
    return a.date < b.date ? -1 : 1;
  }

  return timeKey(a.time) - timeKey(b.time);
}

export { played, isBracket, isExhibition, isOurs, bySlot };
