/**
 * Practice ideas for the Coaches Corner card, on ?admin.
 *
 * The drills below were written ahead of time. The page picks the ones that
 * match what the team numbers show (scoring fell, penalties are high, and
 * so on), so nothing is sent anywhere and no AI runs on the page. Like the
 * rest of the card, the reasons use team numbers only and name no player.
 * See ARCHITECTURE.md, "Practice ideas".
 */

/** The most focus areas shown at once. One practice can't fix everything. */
var MAX_PICKS = 3;

/** A month's scoring has "dropped" when it is this many goals a game lower. */
var DROP = 1;

/** Fewer goals a game than this, over the season, is low scoring. */
var LOW_GF = 3;

/** More goals against a game than this, over the season, is too many. */
var HIGH_GA = 3;

/** Two players with this share of the goals or more is too top-heavy. */
var TOP2_SHARE = 0.5;

/** Below this many goals, the share of the top two means nothing yet. */
var MIN_GOALS = 6;

/** Penalty minutes a game at or above this are worth a practice block. */
var HIGH_PIM = 4;

/** At least this many one-goal games or ties before judging how they went. */
var MIN_CLOSE = 3;

/** Fewest games in a month before its average is compared with another. */
var MIN_MONTH_GP = 2;

/**
 * The drill library, one entry per focus area.
 *
 * ice: "half" runs on half ice as written. "full" needs the whole sheet,
 * and `half` says how to run it when the team only has half.
 */
var FOCUS = {
  defense: {
    title: "Tighten up in our end",
    drills: [
      {
        name: "Breakout under pressure",
        how:
          "Coach dumps the puck in. A D gets it with one forechecker chasing, wingers on the boards, center low for support. Go up ice on the first good pass.",
        ice: "full",
        half: "Stop at the red line and dump the puck back in for the next group."
      },
      {
        name: "Low-zone 2-on-2",
        how:
          "Two attack, two defend, below the tops of the circles. Defenders stay between their player and the net and keep sticks in the passing lanes. 30-second shifts.",
        ice: "half"
      }
    ]
  },

  finishing: {
    title: "Finish our chances",
    drills: [
      {
        name: "Rebounds and tips",
        how:
          "Coach shoots from the point. Two forwards at the net: one screens and tips, one pounces on rebounds. Rotate every three shots.",
        ice: "half"
      },
      {
        name: "Shoot in stride",
        how:
          "Carry in from the blue line and shoot without stopping to stickhandle. Pick a corner before you shoot. Both sides, both hands.",
        ice: "half"
      }
    ]
  },

  spread: {
    title: "Get more players scoring",
    drills: [
      {
        name: "2-on-1, the other guy shoots",
        how:
          "Rush 2-on-1. The player who did not start with the puck has to take the shot, so everyone gets reps finishing a pass.",
        ice: "full",
        half: "Start the rush at the red line instead of the far end."
      },
      {
        name: "Three-touch small-area game",
        how:
          "3-on-3 in one zone. A goal only counts after all three players on the team touched the puck. Keeps the puck moving to everyone.",
        ice: "half"
      }
    ]
  },

  penalties: {
    title: "Cut the penalties",
    drills: [
      {
        name: "Angling with the stick down",
        how:
          "Checker steers the puck carrier to the boards with body position, stick on the ice. A hook, slash or high stick means the puck goes back to the carrier.",
        ice: "half"
      },
      {
        name: "Scrimmage with a real box",
        how:
          "Any small-area game. A stick penalty sends the player to a 30-second box and the team plays short. Kids feel what a penalty costs.",
        ice: "half"
      }
    ]
  },

  close: {
    title: "Win the close ones",
    drills: [
      {
        name: "Last-minute game",
        how:
          "Scrimmage with a set score and clock: down one with a minute left, then up one and protect it. Switch sides each round.",
        ice: "full",
        half: "Play it 3-on-3 in one zone with the same score and clock."
      },
      {
        name: "Next goal wins",
        how:
          "Continuous 3-on-3 across the ice, next goal wins, quick changes. Builds the habit of pushing for the winner instead of settling.",
        ice: "half"
      }
    ]
  },

  sharp: {
    title: "Keep the basics sharp",
    drills: [
      {
        name: "Tempo passing",
        how:
          "Pass-and-follow triangles at full speed, tape to tape. Add a second puck once they have it.",
        ice: "half"
      },
      {
        name: "Edges with a puck",
        how:
          "Tight turns, crossovers and stops around cones, head up, puck on the stick the whole way.",
        ice: "half"
      }
    ]
  }
};

/**
 * One decimal place, dropping a trailing ".0": 2.8, 3.
 *
 * @param {number} n
 * @returns {string}
 */
function oneDp(n) {
  return String(Math.round(n * 10) / 10);
}

/**
 * The last two months, when both have enough games to compare.
 *
 * @param {Object} sum - From coachSummary().
 * @returns {{prev: Object, last: Object}|null}
 */
function lastTwoMonths(sum) {
  var m = sum.months;

  if (m.length < 2) {
    return null;
  }

  var prev = m[m.length - 2];
  var last = m[m.length - 1];

  if (prev.gp < MIN_MONTH_GP || last.gp < MIN_MONTH_GP) {
    return null;
  }

  return { prev: prev, last: last };
}

/**
 * Goals against: too many over the season, or up a goal a game on last month.
 *
 * @param {Object} sum
 * @returns {string} Why, or "" when it doesn't apply.
 */
function whyDefense(sum) {
  var two = lastTwoMonths(sum);

  if (two) {
    var before = two.prev.ga / two.prev.gp;
    var now = two.last.ga / two.last.gp;

    if (now - before >= DROP) {
      return (
        "Goals against went from " +
        oneDp(before) +
        " a game in " +
        two.prev.label +
        " to " +
        oneDp(now) +
        " in " +
        two.last.label +
        "."
      );
    }
  }

  var a = sum.all;

  if (a.gp >= 3 && a.ga / a.gp > HIGH_GA) {
    return "The team gives up " + oneDp(a.ga / a.gp) + " goals a game.";
  }

  return "";
}

/**
 * Scoring: down a goal a game on last month, or low over the season.
 *
 * @param {Object} sum
 * @returns {string}
 */
function whyFinishing(sum) {
  var two = lastTwoMonths(sum);

  if (two) {
    var before = two.prev.gf / two.prev.gp;
    var now = two.last.gf / two.last.gp;

    if (before - now >= DROP) {
      return (
        "Goals a game fell from " +
        oneDp(before) +
        " in " +
        two.prev.label +
        " to " +
        oneDp(now) +
        " in " +
        two.last.label +
        "."
      );
    }
  }

  var a = sum.all;

  if (a.gp >= 3 && a.gf / a.gp < LOW_GF) {
    return "The team scores " + oneDp(a.gf / a.gp) + " goals a game.";
  }

  return "";
}

/**
 * Two players scoring half the goals or more. Looks at the last few games
 * first, since that is what the next practice can change.
 *
 * @param {Object} sum
 * @returns {string}
 */
function whySpread(sum) {
  var sc = sum.scoring;

  if (!sc) {
    return "";
  }

  var r = sc.recent;

  if (r && r.total >= MIN_GOALS && r.top2 / r.total >= TOP2_SHARE) {
    return (
      "Two players have " +
      r.top2 +
      " of the " +
      r.total +
      " goals in the last " +
      sc.recentGames +
      " games."
    );
  }

  var s = sc.season;

  if (s.total >= MIN_GOALS && s.top2 / s.total >= TOP2_SHARE) {
    return "Two players have " + s.top2 + " of the " + s.total + " goals this season.";
  }

  return "";
}

/**
 * Penalty minutes a game at or over the line.
 *
 * @param {Object} sum
 * @returns {string}
 */
function whyPenalties(sum) {
  var sc = sum.scoring;

  if (!sc || !sc.pimGames) {
    return "";
  }

  var perGame = sc.pim / sc.pimGames;

  if (perGame < HIGH_PIM) {
    return "";
  }

  return oneDp(perGame) + " penalty minutes a game.";
}

/**
 * One-goal games and ties, when fewer than half of them were wins.
 *
 * @param {Object} sum
 * @returns {string}
 */
function whyClose(sum) {
  var c = sum.close;

  if (c.gp < MIN_CLOSE || c.w * 2 >= c.gp) {
    return "";
  }

  return (
    "In one-goal games and ties the team is " +
    c.w +
    "-" +
    c.l +
    "-" +
    c.t +
    ". One more goal turns those around."
  );
}

/**
 * The checks, most important first. The first MAX_PICKS that apply are shown.
 * Keeping the puck out comes first because a practice spent on it helps
 * every game; the close-game drills come last because the others feed them.
 */
var CHECKS = [
  { key: "defense", why: whyDefense },
  { key: "finishing", why: whyFinishing },
  { key: "spread", why: whySpread },
  { key: "penalties", why: whyPenalties },
  { key: "close", why: whyClose }
];

/**
 * The practice ideas for the card, picked from the Coaches Corner numbers.
 *
 * @param {Object|null} sum - From coachSummary().
 * @returns {Object[]} Up to MAX_PICKS of {key, title, why, drills}. When no
 *   check applies, one "Keep the basics sharp" entry. Empty for no summary.
 */
function practicePicks(sum) {
  if (!sum) {
    return [];
  }

  var picks = [];

  CHECKS.forEach(function (c) {
    if (picks.length >= MAX_PICKS) {
      return;
    }

    var why = c.why(sum);

    if (why) {
      picks.push({
        key: c.key,
        title: FOCUS[c.key].title,
        why: why,
        drills: FOCUS[c.key].drills
      });
    }
  });

  if (!picks.length) {
    picks.push({
      key: "sharp",
      title: FOCUS.sharp.title,
      why: "Nothing in the numbers stands out.",
      drills: FOCUS.sharp.drills
    });
  }

  return picks;
}

export { practicePicks };
