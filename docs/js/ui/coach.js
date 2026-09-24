/**
 * Component: the Coaches Corner card, on ?admin only.
 *
 * Team-level trends from model/coach.js, drawn as a short list and a
 * month-by-month table, plus a button that copies the same thing as plain
 * text for an email or a text message. Below the numbers, practice ideas
 * picked from them (model/practice.js). No player is named anywhere on it.
 * See ARCHITECTURE.md, "Coaches Corner" and "Practice ideas".
 */
import { coachSummary } from "../model/coach.js";
import { practicePicks } from "../model/practice.js";
import { state } from "../state.js";
import { fmtDate } from "../util/dates.js";
import { esc } from "../util/text.js";

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
 * A per-game average, or "0" for no games.
 *
 * @param {number} total
 * @param {number} games
 * @returns {string}
 */
function perGame(total, games) {
  return games ? oneDp(total / games) : "0";
}

/**
 * "5-2-3".
 *
 * @param {Object} t - A tally from model/coach.js.
 * @returns {string}
 */
function record(t) {
  return t.w + "-" + t.l + "-" + t.t;
}

/**
 * "+14", "-3" or "0".
 *
 * @param {number} n
 * @returns {string}
 */
function signed(n) {
  return n > 0 ? "+" + n : String(n);
}

/**
 * "1 game" / "3 games".
 *
 * @param {number} n
 * @param {string} word - The singular.
 * @returns {string}
 */
function count(n, word) {
  return n + " " + word + (n === 1 ? "" : "s");
}

/**
 * The run the team is on, in words, or "" for a run of one game.
 *
 * @param {{kind: string, n: number}|null} s
 * @returns {string}
 */
function streakText(s) {
  if (!s || s.n < 2) {
    return "";
  }

  if (s.kind === "won") {
    return "Won the last " + s.n + " in a row.";
  }

  if (s.kind === "unbeaten") {
    return "No loss in the last " + s.n + ".";
  }

  if (s.kind === "lost") {
    return "Lost the last " + s.n + " in a row.";
  }

  return "No win in the last " + s.n + ".";
}

/**
 * The card's points, as plain sentences. The card and the copied text are
 * both built from this list, so they can never say different things.
 *
 * @param {Object} sum - From coachSummary().
 * @returns {string[]}
 */
function points(sum) {
  var a = sum.all;
  var out = [];

  out.push(
    "Record " +
      record(a) +
      " in " +
      count(a.gp, "game") +
      ". Goals " +
      a.gf +
      " for, " +
      a.ga +
      " against (" +
      signed(a.gf - a.ga) +
      ")."
  );

  if (sum.league.gp && sum.league.gp !== a.gp) {
    out.push(
      "League play: " +
        record(sum.league) +
        ", " +
        sum.league.gf +
        " for and " +
        sum.league.ga +
        " against. The other " +
        count(a.gp - sum.league.gp, "game") +
        " were showcases and tournaments."
    );
  }

  var run = streakText(sum.streak);

  if (run) {
    out.push(run);
  }

  out.push(
    "Per game: " +
      perGame(a.gf, a.gp) +
      " goals for, " +
      perGame(a.ga, a.gp) +
      " against."
  );

  if (sum.close.gp) {
    out.push(
      count(sum.close.gp, "game") +
        " decided by one goal or tied: " +
        record(sum.close) +
        "."
    );
  }

  var sc = sum.scoring;

  if (sc && sc.season.total) {
    out.push(
      "Two players have " +
        sc.season.top2 +
        " of the " +
        sc.season.total +
        " goals. " +
        count(sc.season.scorers, "player") +
        " have scored, and " +
        sc.withPoint +
        " of " +
        sc.skaters +
        " skaters have a point."
    );

    if (sc.recent && sc.recent.total) {
      out.push(
        "Last " +
          count(sc.recentGames, "game") +
          ": two players have " +
          sc.recent.top2 +
          " of the " +
          sc.recent.total +
          " goals."
      );
    }

    if (sc.pimGames) {
      out.push(
        "Penalty minutes: " +
          oneDp(sc.pim) +
          " in " +
          count(sc.pimGames, "game") +
          ", " +
          perGame(sc.pim, sc.pimGames) +
          " a game."
      );
    }
  }

  return out;
}

/**
 * The month rows, as plain lines.
 *
 * @param {Object} sum
 * @returns {string[]}
 */
function monthLines(sum) {
  return sum.months.map(function (m) {
    return (
      m.label +
      ": " +
      count(m.gp, "game") +
      ", " +
      record(m) +
      ", " +
      perGame(m.gf, m.gp) +
      " for and " +
      perGame(m.ga, m.gp) +
      " against a game"
    );
  });
}

/**
 * "Half ice" or "Full ice", for a drill's tag.
 *
 * @param {Object} d - A drill from model/practice.js.
 * @returns {string}
 */
function iceLabel(d) {
  return d.ice === "full" ? "Full ice" : "Half ice";
}

/**
 * The practice ideas as plain lines, for the copied text.
 *
 * @param {Object} sum - From coachSummary().
 * @returns {string[]}
 */
function practiceLines(sum) {
  var lines = [];

  practicePicks(sum).forEach(function (p, i) {
    lines.push(i + 1 + ". " + p.title + ". " + p.why);

    p.drills.forEach(function (d) {
      var line = "   - " + d.name + " (" + iceLabel(d).toLowerCase() + "): " + d.how;

      if (d.half) {
        line += " Half ice: " + d.half;
      }

      lines.push(line);
    });
  });

  return lines;
}

/**
 * The practice ideas block inside the card.
 *
 * @param {Object} sum - From coachSummary().
 * @returns {string}
 */
function practiceHtml(sum) {
  var picks = practicePicks(sum);

  if (!picks.length) {
    return "";
  }

  var h =
    '<div class="practice"><h3>Practice ideas</h3>' +
    '<p class="pnote">Picked by the page from the numbers above, out of drills written ahead of time. A starting point, not a plan. Use what fits the ice you have.</p>';

  picks.forEach(function (p) {
    h += '<div class="pfocus" data-focus="' + esc(p.key) + '">';
    h += "<h4>" + esc(p.title) + "</h4>";
    h += '<p class="pwhy">' + esc(p.why) + "</p>";
    h += '<ul class="drills">';

    p.drills.forEach(function (d) {
      h += "<li><b>" + esc(d.name) + '</b> <span class="ice">' + esc(iceLabel(d)) + "</span>";
      h += '<span class="how">' + esc(d.how) + "</span>";

      if (d.half) {
        h += '<span class="half">Half ice: ' + esc(d.half) + "</span>";
      }

      h += "</li>";
    });

    h += "</ul></div>";
  });

  h += "</div>";

  return h;
}

/**
 * The whole card as plain text, for the Copy button.
 *
 * @returns {string} "" before our first finished game.
 */
function coachText() {
  var sum = coachSummary();

  if (!sum) {
    return "";
  }

  var lines = ["COACHES CORNER (through " + fmtDate(sum.through) + ")", ""];

  points(sum).forEach(function (p) {
    lines.push("- " + p);
  });

  if (sum.months.length > 1) {
    lines.push("");
    lines.push("BY MONTH");

    monthLines(sum).forEach(function (m) {
      lines.push("- " + m);
    });
  }

  lines.push("");
  lines.push("PRACTICE IDEAS");

  practiceLines(sum).forEach(function (l) {
    lines.push(l);
  });

  lines.push("");
  lines.push("Scrimmages are left out. Team numbers only.");

  return lines.join("\n");
}

/**
 * The card. Only drawn on ?admin; render.js checks that.
 *
 * @returns {string} "" before our first finished game.
 */
function coachHtml() {
  var sum = coachSummary();

  if (!sum) {
    return "";
  }

  var h =
    '<section class="card coach"><div class="card-h"><h2>Coaches Corner</h2><span class="eyebrow">Through ' +
    esc(fmtDate(sum.through)) +
    '</span></div><div class="card-b">';

  h += '<ul class="coachlist">';

  points(sum).forEach(function (p) {
    h += "<li>" + esc(p) + "</li>";
  });

  h += "</ul>";

  // A month table only says something once there are two months to compare.
  if (sum.months.length > 1) {
    h +=
      '<div class="tablewrap"><table><thead><tr><th scope="col">Month</th><th scope="col">GP</th>' +
      '<th scope="col">Record</th><th scope="col">For / game</th><th scope="col">Against / game</th></tr></thead><tbody>';

    sum.months.forEach(function (m) {
      h +=
        "<tr><td>" +
        esc(m.label) +
        "</td><td>" +
        m.gp +
        "</td><td>" +
        record(m) +
        "</td><td>" +
        perGame(m.gf, m.gp) +
        "</td><td>" +
        perGame(m.ga, m.gp) +
        "</td></tr>";
    });

    h += "</tbody></table></div>";
  }

  h += practiceHtml(sum);

  h +=
    '<p class="foot">Shown because the address has ?admin. Anyone who adds that can see it, so it names no players. ' +
    "Scrimmages are left out. " +
    '<button type="button" class="coachbtn" data-act="coachcopy">' +
    (state.coachCopied ? "Copied" : "Copy as text") +
    "</button></p>";

  h += "</div></section>";

  return h;
}

export { coachHtml, coachText };
