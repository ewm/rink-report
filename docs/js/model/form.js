/**
 * Hot, warm and cold: who is on a run lately, for the Stats page on ?admin.
 *
 * Skaters are judged on points in the team's last five games, with fixed
 * counts. Goalies are judged on goals against per full game over their own
 * last three appearances, against their season number.
 *
 * Everything comes from the game log on the Player Stats tab. A skater only
 * gets a log row when they score or take a penalty, and the log does not say
 * who missed a game, so a kid who sat out reads the same as a kid who played
 * and got nothing. See ARCHITECTURE.md, "Hot and cold".
 */
import { gaaFromLog, goalieLogFor } from "./gamelog.js";
import { state } from "../state.js";
import { norm } from "../util/text.js";

/** How many of the team's most recent games a skater is judged on. */
var SKATER_GAMES = 5;

/** Points in those games that make a skater hot, and the floor for warm. */
var HOT_POINTS = 5;
var WARM_POINTS = 2;

/** How many of a goalie's own most recent appearances they are judged on. */
var GOALIE_GAMES = 3;

/** How far the recent GAA has to move off the season GAA, in goals a game. */
var GOALIE_SWING = 1;

/** What each level looks like on the page. */
var LOOK = {
  hot: { emoji: "🔥", word: "Hot" },
  warm: { emoji: "☀️", word: "Warm" },
  cold: { emoji: "🧊", word: "Cold" }
};

/**
 * The key that ties a log row to one game: its date and opponent.
 *
 * @param {Object} row - A skater or goalie log row.
 * @returns {string}
 */
function gameKey(row) {
  return row.date + "|" + norm(row.opponent);
}

/**
 * The team's games as the log knows them, oldest first.
 *
 * A goalie gets a row every game, so the goalie log is the list of games.
 * The skater log is only used when there is no goalie log at all: a skater
 * row with the opponent spelled a little differently would otherwise count
 * as a game of its own. Games on the same date keep the sheet's order.
 *
 * @returns {Object[]} Each is { key, date }.
 */
function loggedGames() {
  var st = state.data.stats || {};
  var rows = (st.logGoalies || []).length ? st.logGoalies : st.logSkaters || [];
  var seen = {};
  var games = [];

  rows.forEach(function (r) {
    var key = gameKey(r);

    if (!seen[key]) {
      seen[key] = true;
      games.push({ key: key, date: r.date });
    }
  });

  games.sort(function (x, y) {
    if (x.date < y.date) {
      return -1;
    }

    return x.date > y.date ? 1 : 0;
  });

  return games;
}

/**
 * Whether a skater's log row belongs to one of the given games.
 *
 * The opponent is typed by hand in both logs, so the two can be spelled
 * differently. When only one game in the window falls on the row's date,
 * the date alone is enough.
 *
 * @param {Object} row - A skater log row.
 * @param {Object[]} window - The games being counted.
 * @returns {boolean}
 */
function inWindow(row, window) {
  var key = gameKey(row);
  var sameDay = 0;

  for (var i = 0; i < window.length; i++) {
    if (window[i].key === key) {
      return true;
    }

    if (window[i].date === row.date) {
      sameDay += 1;
    }
  }

  return sameDay === 1;
}

/**
 * Hot, warm or cold for every skater, keyed by short name.
 *
 * Empty until the log holds at least five games, so nobody is called cold
 * off two games in September.
 *
 * @returns {Object} name -> { level, points }.
 */
function skaterForm() {
  var st = state.data.stats || {};
  var games = loggedGames();
  var out = {};

  if (games.length < SKATER_GAMES) {
    return out;
  }

  var window = games.slice(games.length - SKATER_GAMES);

  (st.skaters || []).forEach(function (p) {
    var points = 0;

    (st.logSkaters || []).forEach(function (r) {
      if (r.name === p.name && inWindow(r, window)) {
        points += (r.g || 0) + (r.a || 0);
      }
    });

    var level = "cold";

    if (points >= HOT_POINTS) {
      level = "hot";
    } else if (points >= WARM_POINTS) {
      level = "warm";
    }

    out[p.name] = { level: level, points: points };
  });

  return out;
}

/**
 * Hot, warm or cold for one goalie, or null when there is too little to go on.
 *
 * A goalie needs more appearances than the three being judged, or the
 * recent number and the season number are the same games.
 *
 * @param {string} name - The goalie's short name.
 * @returns {Object|null} { level, recent, season }.
 */
function goalieForm(name) {
  var rows = goalieLogFor(name).slice();

  if (rows.length <= GOALIE_GAMES) {
    return null;
  }

  rows.sort(function (x, y) {
    if (x.date < y.date) {
      return -1;
    }

    return x.date > y.date ? 1 : 0;
  });

  var season = gaaFromLog(rows);
  var recent = gaaFromLog(rows.slice(rows.length - GOALIE_GAMES));

  if (season === null || recent === null) {
    return null;
  }

  var level = "warm";

  if (recent <= season - GOALIE_SWING) {
    level = "hot";
  } else if (recent >= season + GOALIE_SWING) {
    level = "cold";
  }

  return { level: level, recent: recent, season: season };
}

/**
 * The emoji for a level, with the reason for the label in ui/formtip.js.
 *
 * @param {string} level - "hot", "warm" or "cold".
 * @param {string} why - Plain text for the tooltip, already safe for HTML.
 * @returns {string} HTML.
 */
function formBadge(level, why) {
  var look = LOOK[level];

  return (
    '<span class="form form-' +
    level +
    '" tabindex="0" data-why="' +
    look.word +
    ": " +
    why +
    '" aria-label="' +
    look.word +
    ": " +
    why +
    '">' +
    look.emoji +
    "</span>"
  );
}

export {
  GOALIE_GAMES,
  GOALIE_SWING,
  HOT_POINTS,
  LOOK,
  SKATER_GAMES,
  WARM_POINTS,
  formBadge,
  goalieForm,
  skaterForm
};
