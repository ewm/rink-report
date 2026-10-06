/**
 * The scheduling tool: teams and ice slots in, a season out.
 *
 * Pure functions, no DOM, no store. ui/schedule-builder.js draws the result
 * and copies it for the Schedule tab; tests run this file in Node.
 *
 * How it works, in the order it happens:
 *
 * 1. Pairings. Each division plays a round robin (every team against every
 *    other once). Divisions then cross over (every team against every team
 *    in the other divisions once). The two kinds alternate, in-division
 *    first, with home and away swapped on every repeat, until every team
 *    has its "Games per team" from the Settings tab. A pairing is skipped
 *    once either side has its games, so a team never goes over.
 *
 * 2. Placement. Every pairing has a home team, and goes into one of that
 *    team's own ice slots. Each team's games get a target date spread
 *    evenly over the season, and the game takes the unused home slot
 *    nearest the two teams' average target that breaks no rule. The rules:
 *    no team twice in a day, at most two games on a Saturday-Sunday, at
 *    most three in a Monday-to-Sunday week.
 *
 * 3. Repair. A game with no legal home slot tries the away team's slots
 *    (home and away swap) when that keeps the pair's home counts within
 *    one of each other, or always when Settings says "Home and away: any".
 *    Then one more try: move one of the host's already-placed games to
 *    another of its free slots, so the slot it was in can take this game.
 *    What is still unplaced is reported, never dropped quietly.
 *
 * Greedy with one repair pass, not a solver: for 8 to 16 teams it finishes
 * in a blink and a commissioner can follow what it did.
 * See ARCHITECTURE.md, "The scheduling tool".
 */

/** Hard limits on how often a team plays. */
var LIMITS = { perDay: 1, perWeekend: 2, perWeek: 3 };

/* ---- dates ---- */

/**
 * Days since the epoch for an ISO day, for date arithmetic without time
 * zones getting a vote.
 *
 * @param {string} iso - "2026-11-07".
 * @returns {number}
 */
function dayNumber(iso) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);

  return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000);
}

/**
 * 0 = Monday ... 6 = Sunday, for a day number.
 *
 * @param {number} n
 * @returns {number}
 */
function weekday(n) {
  // Day 0 (Jan 1 1970) was a Thursday, which is 3 counting from Monday.
  return (((n + 3) % 7) + 7) % 7;
}

/**
 * The Monday that starts the week a day falls in, as a day number. Games
 * on the same key are in the same week.
 *
 * @param {number} n
 * @returns {number}
 */
function weekKey(n) {
  return n - weekday(n);
}

/**
 * The Saturday that starts the weekend a day falls in, or null on a
 * weekday. Saturday and Sunday share a key.
 *
 * @param {number} n
 * @returns {number|null}
 */
function weekendKey(n) {
  var w = weekday(n);

  if (w === 5) {
    return n;
  }

  if (w === 6) {
    return n - 1;
  }

  return null;
}

/* ---- pairings ---- */

/**
 * One round robin of a list of teams, as rounds of games, by the circle
 * method. An odd list gets a bye (a game against null, dropped). Home and
 * away alternate so that a team is not home for a whole round.
 *
 * @param {string[]} teams
 * @returns {{home: string, away: string}[][]} Rounds of games.
 */
function roundRobin(teams) {
  var list = teams.slice();

  if (list.length % 2 === 1) {
    list.push(null);
  }

  var n = list.length;
  var rounds = [];
  var r;
  var i;

  for (r = 0; r < n - 1; r++) {
    var round = [];

    for (i = 0; i < n / 2; i++) {
      var a = list[i];
      var b = list[n - 1 - i];

      if (a === null || b === null) {
        continue;
      }

      // Alternating by position keeps home counts close within a round.
      var flip = (r + i) % 2 === 1;

      round.push(flip ? { home: b, away: a } : { home: a, away: b });
    }

    rounds.push(round);

    // Rotate every team but the first.
    list.splice(1, 0, list.pop());
  }

  return rounds;
}

/**
 * Rounds in which every team of one group plays every team of the other
 * once. Groups of unequal size leave byes.
 *
 * @param {string[]} a
 * @param {string[]} b
 * @returns {{home: string, away: string}[][]}
 */
function crossRounds(a, b) {
  var big = a.length >= b.length ? a : b;
  var small = a.length >= b.length ? b : a;
  var rounds = [];
  var r;
  var i;

  for (r = 0; r < big.length; r++) {
    var round = [];

    for (i = 0; i < small.length; i++) {
      var x = small[i];
      var y = big[(i + r) % big.length];

      // The home side alternates by round so neither group hosts a whole round.
      var flip = (r + i) % 2 === 1;

      round.push(flip ? { home: y, away: x } : { home: x, away: y });
    }

    rounds.push(round);
  }

  return rounds;
}

/**
 * Swaps home and away in every game of every round.
 *
 * @param {{home: string, away: string}[][]} rounds
 * @returns {{home: string, away: string}[][]}
 */
function flipped(rounds) {
  return rounds.map(function (round) {
    return round.map(function (g) {
      return { home: g.away, away: g.home };
    });
  });
}

/**
 * The teams the league schedules. When any team has a division, only teams
 * with one are in league play; the rest (a showcase-only club on the
 * Teams tab, say) are left out and named. With no divisions at all, every
 * team is in.
 *
 * @param {string[]} teams - Teams-tab names.
 * @param {Object} pools - team name -> division.
 * @returns {{teams: string[], left: string[]}}
 */
function leagueTeams(teams, pools) {
  var any = teams.some(function (t) {
    return pools && pools[t];
  });

  if (!any) {
    return { teams: teams.slice(), left: [] };
  }

  var left = [];
  var kept = teams.filter(function (t) {
    if (pools[t]) {
      return true;
    }

    left.push(t);

    return false;
  });

  return { teams: kept, left: left };
}

/**
 * Teams grouped by division, in Teams-tab order. Teams with no division
 * form one group named "".
 *
 * @param {string[]} teams
 * @param {Object} pools - team name -> division name.
 * @returns {{name: string, teams: string[]}[]}
 */
function divisionsOf(teams, pools) {
  var order = [];
  var byName = {};

  teams.forEach(function (t) {
    var d = (pools && pools[t]) || "";

    if (!byName[d]) {
      byName[d] = { name: d, teams: [] };
      order.push(d);
    }

    byName[d].teams.push(t);
  });

  return order.map(function (d) {
    return byName[d];
  });
}

/**
 * The season's pairings, in the order they should be played: in-division
 * round robin, cross-division round, then both again with home and away
 * swapped, until every team has `gamesPerTeam`. Games beyond a team's
 * count are skipped.
 *
 * @param {string[]} teams
 * @param {Object} pools
 * @param {number} gamesPerTeam
 * @returns {{games: {home: string, away: string, division: string, order: number, round: number}[], short: {team: string, missing: number}[]}}
 */
function pairings(teams, pools, gamesPerTeam) {
  var divs = divisionsOf(teams, pools);
  var count = {};
  var games = [];
  var cycle;
  var order = 0;
  var roundNo = 0;

  teams.forEach(function (t) {
    count[t] = 0;
  });

  /**
   * Whether some team still needs a game.
   * @returns {boolean}
   */
  function anyShort() {
    return teams.some(function (t) {
      return count[t] < gamesPerTeam;
    });
  }

  /**
   * Adds the games of a block of rounds that both sides still have room for.
   * @param {{home: string, away: string}[][]} rounds
   * @param {string} division - The division name, or "" for a cross game.
   */
  function take(rounds, division) {
    rounds.forEach(function (round) {
      roundNo++;

      round.forEach(function (g) {
        if (count[g.home] >= gamesPerTeam || count[g.away] >= gamesPerTeam) {
          return;
        }

        count[g.home]++;
        count[g.away]++;
        games.push({ home: g.home, away: g.away, division: division, order: order++, round: roundNo });
      });
    });
  }

  // Each cycle is one in-division round robin plus one cross round; the odd
  // cycles are flipped. The cap stops a league of one team looping forever.
  for (cycle = 0; cycle < 50 && anyShort(); cycle++) {
    var flip = cycle % 2 === 1;
    var before = games.length;

    divs.forEach(function (d) {
      var rr = roundRobin(d.teams);

      take(flip ? flipped(rr) : rr, d.name);
    });

    if (!anyShort()) {
      break;
    }

    var i;
    var j;

    for (i = 0; i < divs.length; i++) {
      for (j = i + 1; j < divs.length; j++) {
        var cr = crossRounds(divs[i].teams, divs[j].teams);

        take(flip ? flipped(cr) : cr, "");
      }
    }

    if (games.length === before) {
      break; // nothing can be added: a one-team league
    }
  }

  var short = teams
    .filter(function (t) {
      return count[t] < gamesPerTeam;
    })
    .map(function (t) {
      return { team: t, missing: gamesPerTeam - count[t] };
    });

  return { games: games, short: short };
}

/* ---- placement ---- */

/**
 * One build of the season (see the file comment for the steps).
 *
 * @param {Object} input
 * @param {string[]} input.teams - Teams-tab names.
 * @param {Object} input.pools - team name -> division.
 * @param {{team: string, rink: string, date: string, time: string, timeKey: number}[]} input.slots - From shape/slots.js.
 * @param {number} input.gamesPerTeam
 * @param {string} [input.homeAway] - "balanced" (default) or "any".
 * @param {number} seed - 0 for the plain pass; any other number shuffles.
 * @returns {Object} The result: placed games, unplaced pairings, per-team
 *   figures, unused slots, and notes for the commissioner.
 */
function buildOnce(input, seed) {
  var split = leagueTeams(input.teams || [], input.pools);
  var teams = split.teams;
  var rand = mulberry(seed);
  var slots = (input.slots || []).slice().sort(function (a, b) {
    return a.date < b.date ? -1 : a.date > b.date ? 1 : a.timeKey - b.timeKey;
  });
  var gamesPerTeam = input.gamesPerTeam || 0;
  var anySide = input.homeAway === "any";
  var notes = [];

  if (!teams.length || !gamesPerTeam || !slots.length) {
    return empty(teams, slots, gamesPerTeam);
  }

  if (split.left.length) {
    notes.push(
      "Left out, no division on the Teams tab: " +
        split.left.join(", ") +
        ". A showcase-only club stays out of league play; give a club a division to schedule it."
    );
  }

  var pr = pairings(teams, input.pools, gamesPerTeam);

  pr.short.forEach(function (s) {
    notes.push(s.team + " can only be paired for " + (gamesPerTeam - s.missing) + " of " + gamesPerTeam + " games with these divisions.");
  });

  // The season runs from the first slot to the last; each team's k-th game
  // aims at an even share of it.
  var first = dayNumber(slots[0].date);
  var last = dayNumber(slots[slots.length - 1].date);
  var span = Math.max(1, last - first);

  var used = slots.map(function () {
    return false;
  });

  // Per team: games placed so far, and the days, weekends and weeks used.
  var book = {};

  teams.forEach(function (t) {
    book[t] = { placed: 0, home: 0, away: 0, days: {}, weekends: {}, weeks: {}, dates: [] };
  });

  /**
   * Whether a team may play on a day under LIMITS.
   * @param {string} team
   * @param {number} day
   * @returns {boolean}
   */
  function free(team, day) {
    var b = book[team];
    var we = weekendKey(day);

    if (b.days[day]) {
      return false;
    }

    if (we !== null && (b.weekends[we] || 0) >= LIMITS.perWeekend) {
      return false;
    }

    if ((b.weeks[weekKey(day)] || 0) >= LIMITS.perWeek) {
      return false;
    }

    return true;
  }

  /**
   * Records a game on a day for a team.
   * @param {string} team
   * @param {number} day
   * @param {boolean} isHome
   */
  function take(team, day, isHome) {
    var b = book[team];
    var we = weekendKey(day);

    b.placed++;
    b.days[day] = true;
    b.weeks[weekKey(day)] = (b.weeks[weekKey(day)] || 0) + 1;

    if (we !== null) {
      b.weekends[we] = (b.weekends[we] || 0) + 1;
    }

    if (isHome) {
      b.home++;
    } else {
      b.away++;
    }

    b.dates.push(day);
  }

  /**
   * The day a team's next game should aim for: an even share of the season.
   * @param {string} team
   * @returns {number}
   */
  function targetFor(team) {
    var k = book[team].placed;
    var spacing = span / gamesPerTeam;

    // Every try after the first nudges the target by up to half a game's
    // spacing either way, so a different slot wins the scarce days.
    var nudge = seed ? (rand() - 0.5) * spacing : 0;

    return first + Math.round((k + 0.5) * spacing + nudge);
  }

  // Later tries also shuffle the games inside each round, so a different
  // team gets first pick.
  var order = pr.games.slice();

  if (seed) {
    order = shuffleWithinRounds(order, rand);
  }

  /**
   * The unused slot of `host` nearest the pair's target that both teams are
   * free for, or -1.
   * @param {string} host
   * @param {string} guest
   * @returns {number} Index into slots.
   */
  function bestSlot(host, guest) {
    var target = (targetFor(host) + targetFor(guest)) / 2;
    var best = -1;
    var bestDist = Infinity;
    var i;

    for (i = 0; i < slots.length; i++) {
      if (used[i] || slots[i].team !== host) {
        continue;
      }

      var day = dayNumber(slots[i].date);

      if (!free(host, day) || !free(guest, day)) {
        continue;
      }

      var dist = Math.abs(day - target);

      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }

    return best;
  }

  /**
   * Whether swapping sides keeps the pair's home counts within one.
   * @param {string} newHome
   * @param {string} newAway
   * @returns {boolean}
   */
  function swapOk(newHome, newAway) {
    if (anySide) {
      return true;
    }

    return book[newHome].home + 1 - book[newHome].away <= 1 && book[newAway].away + 1 - book[newAway].home <= 1;
  }

  var placed = [];
  var unplaced = [];

  order.forEach(function (g) {
    var i = bestSlot(g.home, g.away);
    var home = g.home;
    var away = g.away;
    var swapped = false;

    if (i === -1 && swapOk(g.away, g.home)) {
      i = bestSlot(g.away, g.home);

      if (i !== -1) {
        home = g.away;
        away = g.home;
        swapped = true;
      }
    }

    if (i === -1 && moveOneGame(g.home, g.away)) {
      i = bestSlot(g.home, g.away);
    }

    // The same move on the other side, when a swap is allowed.
    if (i === -1 && swapOk(g.away, g.home) && moveOneGame(g.away, g.home)) {
      i = bestSlot(g.away, g.home);

      if (i !== -1) {
        home = g.away;
        away = g.home;
        swapped = true;
      }
    }

    if (i === -1) {
      unplaced.push({ home: g.home, away: g.away, division: g.division, why: whyNot(g.home, g.away) });
      return;
    }

    place(i, home, away, g.division, swapped);
  });

  /**
   * Books a slot for a game and records it for both teams.
   * @param {number} i - Index into slots.
   * @param {string} home
   * @param {string} away
   * @param {string} division
   * @param {boolean} swapped
   */
  function place(i, home, away, division, swapped) {
    var s = slots[i];
    var day = dayNumber(s.date);

    used[i] = true;
    take(home, day, true);
    take(away, day, false);

    placed.push({
      date: s.date,
      time: s.time,
      timeKey: s.timeKey,
      home: home,
      away: away,
      rink: s.rink,
      division: division,
      swapped: swapped,
      slotRow: s.row,
      slot: i
    });
  }

  /**
   * Un-books a game so its slot is free again.
   * @param {Object} g - An entry of placed.
   */
  function unplace(g) {
    var day = dayNumber(g.date);

    used[g.slot] = false;
    untake(g.home, day, true);
    untake(g.away, day, false);
    placed.splice(placed.indexOf(g), 1);
  }

  /**
   * The reverse of take().
   * @param {string} team
   * @param {number} day
   * @param {boolean} isHome
   */
  function untake(team, day, isHome) {
    var b = book[team];
    var we = weekendKey(day);

    b.placed--;
    delete b.days[day];
    b.weeks[weekKey(day)]--;

    if (we !== null) {
      b.weekends[we]--;
    }

    if (isHome) {
      b.home--;
    } else {
      b.away--;
    }

    b.dates.splice(b.dates.indexOf(day), 1);
  }

  /**
   * The repair move: one of the host's placed home games moves to another
   * free host slot its opponent can make, which frees a slot the guest can
   * make. True when a move was made.
   * @param {string} host
   * @param {string} guest
   * @returns {boolean}
   */
  function moveOneGame(host, guest) {
    var mine = placed.filter(function (g) {
      return g.home === host;
    });
    var k;

    for (k = 0; k < mine.length; k++) {
      var g = mine[k];
      var day = dayNumber(g.date);

      // The guest has to be free on the day this game would vacate.
      if (!free(guest, day)) {
        continue;
      }

      var opp = g.away;
      var div = g.division;
      var sw = g.swapped;

      unplace(g);

      // Its old slot stays booked during the search: moving a game back
      // into the same slot is no move at all.
      used[g.slot] = true;

      var j = bestSlot(host, opp);

      used[g.slot] = false;

      if (j !== -1) {
        place(j, host, opp, div, sw);
        return true;
      }

      place(g.slot, host, opp, div, sw);
    }

    return false;
  }

  /**
   * A plain reason a pairing found no slot.
   * @param {string} home
   * @param {string} away
   * @returns {string}
   */
  function whyNot(home, away) {
    var homeLeft = slots.filter(function (s, i) {
      return !used[i] && s.team === home;
    }).length;

    if (!homeLeft) {
      return home + " has no ice left";
    }

    return "every free " + home + " slot lands on a day one of them already plays";
  }

  placed.sort(function (a, b) {
    return a.date < b.date ? -1 : a.date > b.date ? 1 : a.timeKey - b.timeKey;
  });

  var unused = slots.filter(function (s, i) {
    return !used[i];
  });

  var perTeam = teams.map(function (t) {
    var b = book[t];
    var sorted = b.dates.slice().sort(function (x, y) {
      return x - y;
    });
    var longest = 0;
    var i;

    for (i = 1; i < sorted.length; i++) {
      longest = Math.max(longest, sorted[i] - sorted[i - 1]);
    }

    var busiest = 0;
    var w;

    for (w in b.weeks) {
      busiest = Math.max(busiest, b.weeks[w]);
    }

    return {
      team: t,
      games: b.placed,
      home: b.home,
      away: b.away,
      longestGap: longest,
      busiestWeek: busiest,
      unusedSlots: unused.filter(function (s) {
        return s.team === t;
      }).length
    };
  });

  var swaps = placed.filter(function (g) {
    return g.swapped;
  }).length;

  if (swaps) {
    notes.push(swaps + " game" + (swaps === 1 ? "" : "s") + " swapped home and away to find ice.");
  }

  return {
    placed: placed,
    unplaced: unplaced,
    perTeam: perTeam,
    unused: unused,
    notes: notes,
    gamesPerTeam: gamesPerTeam,
    wanted: pr.games.length
  };
}

/**
 * Builds the season: the greedy pass, then up to TRIES more passes with
 * the games shuffled inside each round, keeping the result that places the
 * most games (ties go to the better home-and-away balance). Same input,
 * same answer: the shuffles come from a fixed seed.
 *
 * @param {Object} input - See buildOnce().
 * @returns {Object}
 */
function buildSchedule(input) {
  var best = buildOnce(input, 0);
  var seed;

  for (seed = 1; seed <= TRIES && best.unplaced.length; seed++) {
    var next = buildOnce(input, seed);

    if (better(next, best)) {
      best = next;
    }
  }

  return best;
}

/** How many shuffled passes to try after the first when games are left over. */
var TRIES = 400;

/**
 * Whether result a beats result b: more games placed, then a smaller
 * worst home-and-away gap.
 *
 * @param {Object} a
 * @param {Object} b
 * @returns {boolean}
 */
function better(a, b) {
  if (a.placed.length !== b.placed.length) {
    return a.placed.length > b.placed.length;
  }

  return worstGap(a) < worstGap(b);
}

/**
 * The biggest home-minus-away difference any team has.
 *
 * @param {Object} r - A build result.
 * @returns {number}
 */
function worstGap(r) {
  return r.perTeam.reduce(function (m, t) {
    return Math.max(m, Math.abs(t.home - t.away));
  }, 0);
}

/**
 * A small seeded random number generator (mulberry32), so a shuffle is the
 * same every time for the same seed.
 *
 * @param {number} seed
 * @returns {function(): number} Returns numbers in [0, 1).
 */
function mulberry(seed) {
  var a = seed >>> 0;

  return function () {
    a = (a + 0x6d2b79f5) >>> 0;

    var t = a;

    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Shuffles games within each pairing round, keeping the rounds in order.
 * Games share a round when they carry the same `round` number.
 *
 * @param {Object[]} games - From pairings(), each with a `round`.
 * @param {function(): number} rand
 * @returns {Object[]}
 */
function shuffleWithinRounds(games, rand) {
  var out = [];
  var block = [];
  var current = null;

  /** Fisher-Yates on the block, then appended. */
  function flush() {
    var i;

    for (i = block.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var t = block[i];

      block[i] = block[j];
      block[j] = t;
    }

    out = out.concat(block);
    block = [];
  }

  games.forEach(function (g) {
    if (current !== null && g.round !== current) {
      flush();
    }

    current = g.round;
    block.push(g);
  });

  flush();

  return out;
}

/**
 * The result shape with nothing in it, for missing inputs.
 *
 * @param {string[]} teams
 * @param {Object[]} slots
 * @param {number} gamesPerTeam
 * @returns {Object}
 */
function empty(teams, slots, gamesPerTeam) {
  var notes = [];

  if (!teams.length) {
    notes.push("No teams on the Teams tab.");
  }

  if (!gamesPerTeam) {
    notes.push('Set "Games per team" on the Settings tab.');
  }

  if (!slots.length) {
    notes.push("No ice slots to place games in.");
  }

  return { placed: [], unplaced: [], perTeam: [], unused: slots, notes: notes, gamesPerTeam: gamesPerTeam, wanted: 0 };
}

/* ---- output ---- */

/**
 * The placed games as tab-separated Schedule rows, in the sheet's column
 * order: Date, Face-off, Away team, Home team, Away goals, Home goals,
 * Rink, Pool / division, Game type, Event. One paste into the Schedule tab.
 *
 * @param {Object[]} placed - From buildSchedule().
 * @returns {string}
 */
function scheduleRows(placed) {
  return placed
    .map(function (g) {
      return [g.date, g.time, g.away, g.home, "", "", g.rink, g.division, "League", ""].join("\t");
    })
    .join("\n");
}

export { buildSchedule, buildOnce, pairings, roundRobin, crossRounds, leagueTeams, scheduleRows, dayNumber, weekday, LIMITS };
