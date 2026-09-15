/**
 * Component: the standings table for a view (pooled or flat).
 *
 * standingsHtml(view, precomputedRows, rules) renders one table per pool; a
 * single pool names the section instead of heading it. Until the first
 * counted score is in, the League tab shows the pre-season page instead of a
 * table of zeros. See ARCHITECTURE.md, "Standings".
 */
import { isExhibition, played } from "../model/game.js";
import { rulesFor, standings } from "../model/standings.js";
import { dataViews, ourRecordIn, poolsInView, teamsInView } from "../model/views.js";
import { on, state } from "../state.js";
import { fmtDate, todayISO } from "../util/dates.js";
import { bare, esc } from "../util/text.js";

/**
 * A team name, linked to its MyHockey Rankings page when the Teams tab has
 * one, plain text when it does not. The link opens in a new tab and the
 * stylesheet draws the outbound arrow. See ARCHITECTURE.md, "Standings".
 *
 * @param {string} name
 * @returns {string} HTML.
 */
function teamHtml(name) {
  var url = on("mhrLinks") && state.data.mhr && state.data.mhr[name];

  if (!url) {
    return esc(name);
  }

  return (
    '<a class="tm" href="' +
    esc(url) +
    '" target="_blank" rel="noopener" title="' +
    esc(name) +
    ' on MyHockey Rankings">' +
    esc(name) +
    "</a>"
  );
}

/**
 * The standings card for a view.
 *
 * Rank numbers appear only once a counted game has been played; rows level
 * on points under a "level" rule share the rank above them.
 *
 * @param {Object} v - The view.
 * @param {Object[]|null} flat - Precomputed rows for a single-group view, or null.
 * @param {Object} [rules] - Standings rules; defaults to rulesFor(v).
 * @returns {string} HTML.
 */
function standingsHtml(v, flat, rules) {
  var cfg = state.data.config;
  rules = rules || rulesFor(v);

  var teams = teamsInView(v);
  var pools = poolsInView(v);
  var body = "";
  var groups = [];
  var grouped = false;
  var t;
  var soleGroup = "";

  // Until a counted score is in, the table is a team list and gets no rank numbers.
  var anyPlayed = false;

  v.games.forEach(function (g) {
    if (played(g) && !isExhibition(g)) {
      anyPlayed = true;
    }
  });

  // Before the first league score the League tab is a pre-season page, not a table of zeros.
  if (on("preseason") && teams.length && !v.event && !anyPlayed) {
    return preseasonHtml(v, teams, cfg);
  }

  if (teams.length) {
    for (t in pools) {
      if (Object.prototype.hasOwnProperty.call(pools, t)) {
        grouped = true;
        break;
      }
    }

    if (grouped) {
      var byPool = bare();

      teams.forEach(function (tm) {
        var p = pools[tm] || "Unpooled";

        (byPool[p] = byPool[p] || []).push(tm);
      });

      Object.keys(byPool)
        .sort()
        .forEach(function (p) {
          groups.push({ name: p, teams: byPool[p] });
        });

      // A single pool names the section instead of heading its own table,
      // otherwise the Pool column never reaches the page.
      if (groups.length === 1 && groups[0].name) {
        soleGroup = groups[0].name;
        groups[0].name = "";
      }
    } else {
      groups.push({ name: "", teams: teams });
    }

    body += '<div class="tablewrap">';

    groups.forEach(function (grp) {
      if (grp.name) {
        body += '<div class="poolname">' + esc(grp.name) + "</div>";
      }

      var st = groups.length === 1 && flat ? flat : standings(v.games, grp.teams, v.event, rules);

      body +=
        '<table><thead><tr><th scope="col">Team</th><th scope="col">GP</th><th scope="col">W</th>' +
        '<th scope="col">L</th><th scope="col">T</th><th scope="col">GF</th><th scope="col">GA</th>' +
        '<th scope="col">+/-</th><th scope="col">Pts</th></tr></thead><tbody>';

      var shownRank = 0;
      var prevPts = null;
      var prevLevel = false;

      st.forEach(function (r, i) {
        var mine = r.team === cfg.teamName;

        if (!(r.level && prevLevel && r.pts === prevPts)) {
          shownRank = i + 1;
        }

        prevPts = r.pts;
        prevLevel = r.level;

        body +=
          "<tr" +
          (mine ? ' class="us"' : "") +
          '><td><span class="rank">' +
          (anyPlayed ? shownRank : "") +
          "</span>" +
          teamHtml(r.team) +
          "</td>" +
          "<td>" +
          r.gp +
          "</td><td>" +
          r.w +
          "</td><td>" +
          r.l +
          "</td><td>" +
          r.t +
          "</td><td>" +
          r.gf +
          "</td><td>" +
          r.ga +
          "</td>" +
          "<td>" +
          (r.diff > 0 ? "+" : "") +
          r.diff +
          '</td><td class="pts">' +
          r.pts +
          "</td></tr>";
      });

      body += "</tbody></table>";
    });

    body += "</div>";

    var note = rules.note || "";

    if (v.hasBracket) {
      note += (note ? " " : "") + "Bracket games are not counted here.";
    }

    var exh = 0;

    v.games.forEach(function (g) {
      if (isExhibition(g)) {
        exh++;
      }
    });

    if (exh) {
      note +=
        (note ? " " : "") +
        (exh === 1 ? "One scrimmage is" : exh + " scrimmages are") +
        " on the schedule but not in this table.";
    }

    if (note) {
      body += '<p class="foot">' + esc(note) + "</p>";
    }
  } else {
    body +=
      '<p class="empty">' +
      (v.event ? "No teams in this event yet." : "No teams loaded yet.") +
      "</p>";
  }

  // A round robin nobody seeds is not a "pool standing".
  var title = !v.event ? "Standings" : v.hasBracket ? "Pool standings" : "Round robin";

  if (soleGroup) {
    title = soleGroup;
  }

  return (
    '<section class="card"><div class="card-h"><h2>' +
    esc(title) +
    "</h2>" +
    '<span class="eyebrow">' +
    cfg.ptsWin +
    " pt win &middot; " +
    cfg.ptsTie +
    ' pt tie</span></div><div class="card-b">' +
    body +
    "</div></section>"
  );
}

/**
 * The League tab before the first league score: when play starts, the
 * pre-season events already played, and the division as a list.
 *
 * @param {Object} v - The league view.
 * @param {string[]} teams - Teams in the view.
 * @param {Object} cfg - state.data.config.
 * @returns {string} HTML.
 */
function preseasonHtml(v, teams, cfg) {
  var today = todayISO();
  var first = "";
  var firstAny = "";

  v.games.forEach(function (g) {
    if (isExhibition(g)) {
      return;
    }

    if (!firstAny || g.date < firstAny) {
      firstAny = g.date;
    }

    if (g.date >= today && (!first || g.date < first)) {
      first = g.date;
    }
  });

  var body = "";

  if (first) {
    body += '<p class="lead">League play starts <b>' + esc(fmtDate(first)) + "</b>.</p>";
  } else if (firstAny) {
    body +=
      '<p class="lead">League play has started. Standings appear once the first score is in.</p>';
  } else {
    body += '<p class="lead">No league games on the schedule yet.</p>';
  }

  // Pre-season events already played: one line each, tap to open.
  var evs = on("events")
    ? dataViews().filter(function (x) {
        return x.event && x.last < today;
      })
    : [];

  evs.sort(function (a, b) {
    return a.first > b.first ? -1 : 1;
  });

  evs.forEach(function (x) {
    var rec = ourRecordIn(x);

    if (!rec) {
      return;
    }

    body +=
      '<button type="button" class="evrow pre" data-act="view" data-v="' +
      esc(x.key) +
      '">' +
      '<span class="evname">' +
      esc(x.label) +
      '</span><span class="evdates">' +
      esc(fmtDate(x.first)) +
      (x.first !== x.last ? " – " + esc(fmtDate(x.last)) : "") +
      '</span><span class="evrec">' +
      rec.w +
      "-" +
      rec.l +
      "-" +
      rec.t +
      "</span></button>";
  });

  body += '<div class="division"><div class="eyebrow">In the division</div><ul>';

  teams.forEach(function (t) {
    body += "<li" + (t === cfg.teamName ? ' class="us"' : "") + ">" + teamHtml(t) + "</li>";
  });

  body += "</ul></div>";

  return (
    '<section class="card"><div class="card-h"><h2>Standings</h2>' +
    '<span class="eyebrow">' +
    teams.length +
    ' teams</span></div><div class="card-b">' +
    body +
    "</div></section>"
  );
}

export { standingsHtml };
