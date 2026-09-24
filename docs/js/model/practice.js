/**
 * Practice ideas for the Coaches Corner card, on ?admin.
 *
 * Two parts. A skating and skills warm-up that shows every week and changes
 * each Monday, because game stats can't tell us anything about skating.
 * Then the focus areas the team numbers point to (scoring fell, penalties
 * are high, and so on).
 *
 * Every drill was written ahead of time and the page only picks, so nothing
 * is sent anywhere and no AI runs on the page. Like the rest of the card,
 * the reasons use team numbers only and name no player.
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
 * The weekly skating and skills sets, one per week in turn.
 *
 * Each has two skating drills and one puck drill, all on half ice, about
 * 4 to 5 minutes each. kind is "skating" or "puck", for the drill's tag.
 */
var SKILL_SETS = [
  {
    theme: "Edges",
    drills: [
      {
        name: "Edge circles",
        how:
          "Glide around a faceoff circle on one foot, inside edge, then outside edge. Both feet, both directions. Knees bent, chest up.",
        kind: "skating"
      },
      {
        name: "Figure 8s",
        how:
          "Figure 8s around two cones without stopping. Stay low and lean into the turns.",
        kind: "skating"
      },
      {
        name: "Heads-up stickhandling",
        how:
          "Stickhandle through a line of cones. Coach holds up fingers at the end and each player calls out the number, so eyes stay up.",
        kind: "puck"
      }
    ]
  },
  {
    theme: "Crossovers and turns",
    drills: [
      {
        name: "Circle crossovers",
        how:
          "Crossovers around the faceoff circles, both directions. Push hard with the leg that goes under, not just the one that steps over.",
        kind: "skating"
      },
      {
        name: "Turn on the whistle",
        how:
          "Skate forward. On the whistle, turn to backward without slowing down. Next whistle, back to forward. Turn both ways.",
        kind: "skating"
      },
      {
        name: "Crossovers with a puck",
        how:
          "Crossovers around the circle carrying the puck. Forehand going one way, backhand going the other.",
        kind: "puck"
      }
    ]
  },
  {
    theme: "Stops and starts",
    drills: [
      {
        name: "Blue line to blue line",
        how:
          "Sprint, stop at the blue line, sprint back. Face the same wall every time so both sides of the stop get work. First three strides short and quick.",
        kind: "skating"
      },
      {
        name: "Tight turns at the dots",
        how:
          "Skate to each faceoff dot and turn tight around it, stick on the ice, then burst out of the turn.",
        kind: "skating"
      },
      {
        name: "Stop and go with a puck",
        how:
          "Same stops and starts, carrying a puck. Keep it on the stick through the stop and take it with you on the first stride.",
        kind: "puck"
      }
    ]
  },
  {
    theme: "Puck control",
    drills: [
      {
        name: "Backward C-cuts",
        how:
          "Backward the length of half ice using C-cuts, one leg then the other. Butt down, back straight, stick on the ice.",
        kind: "skating"
      },
      {
        name: "Toe drags through cones",
        how:
          "Pull the puck across the body with the toe of the blade at each cone. Start slow, then add speed.",
        kind: "puck"
      },
      {
        name: "Protect it on the boards",
        how:
          "In pairs along the boards. One carries, the other leans in with light pressure. The carrier keeps their body between the checker and the puck for 15 seconds, then switch.",
        kind: "puck"
      }
    ]
  },
  {
    theme: "Passing on the move",
    drills: [
      {
        name: "Mohawk turns",
        how:
          "Open the hips heel to heel and glide sideways, then turn up ice. Both directions. This is how D walk the blue line.",
        kind: "skating"
      },
      {
        name: "Backward partner passing",
        how:
          "Pairs, one skating forward, one backward, passing the length of half ice. Switch at the end.",
        kind: "puck"
      },
      {
        name: "Take it on the backhand",
        how:
          "Receive a pass on the backhand and move it on in one smooth motion. Both sides of the ice so everyone gets both hands.",
        kind: "puck"
      }
    ]
  },
  {
    theme: "Backward skating",
    drills: [
      {
        name: "Backward crossovers",
        how:
          "Backward crossovers around the circles, both directions. Look up ice, not at your feet.",
        kind: "skating"
      },
      {
        name: "Pivot and go",
        how:
          "Skate backward. On the whistle, open up and pivot to forward and sprint to the boards. Pivot both ways.",
        kind: "skating"
      },
      {
        name: "Pivot and pass",
        how:
          "Skate backward with a puck, pivot to forward, and hit a partner with a pass on the tape.",
        kind: "puck"
      }
    ]
  }
];

/** A Monday, as days since 1970-01-01. Weeks are counted from it. */
var MONDAY_ZERO = 4;

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

/**
 * This week's skating and skills set. The set changes every Monday and
 * goes round the list in order, so no two weeks in a row repeat.
 *
 * @param {Date} now - Today (the page passes new Date()).
 * @returns {{key: string, title: string, theme: string, weekOf: string, drills: Object[]}}
 */
function skillsFor(now) {
  // Count days in UTC from the local calendar date, so a time change never
  // moves the week boundary.
  var day = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000;
  var sinceMonday = (((day - MONDAY_ZERO) % 7) + 7) % 7;
  var week = Math.floor((day - MONDAY_ZERO) / 7);
  var set = SKILL_SETS[((week % SKILL_SETS.length) + SKILL_SETS.length) % SKILL_SETS.length];

  var monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - sinceMonday);
  var weekOf =
    monday.getFullYear() +
    "-" +
    String(monday.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(monday.getDate()).padStart(2, "0");

  return {
    key: "skills",
    title: "Skating and skills",
    theme: set.theme,
    weekOf: weekOf,
    drills: set.drills
  };
}

export { practicePicks, skillsFor };
