/**
 * Component: the ?check page.
 *
 * diagHtml() renders everything the page knows about the sheet and how it
 * was read, for the manager. See ARCHITECTURE.md, "Setup check".
 */
import { played } from "../model/game.js";
import { buildViews, currentView, dataViews, featuredEvent, hasStats } from "../model/views.js";
import { CFG, offList, state } from "../state.js";
import { esc } from "../util/text.js";

/**
 * The Sponsors line: whether the tab was read and how many names came off
 * it, per tier.
 *
 * @returns {string} HTML.
 */
function sponsorsLine() {
  var s = state.data.sponsors;

  if (!s) {
    return state.sponsorsNote
      ? '<span class="warn">not shown — ' + esc(state.sponsorsNote) + "</span>"
      : "not shown — add a Sponsors tab (Sponsor, Tier, Website) to list them at the foot of the page (optional)";
  }

  var tiers = s.groups
    .map(function (g) {
      return (g.label || "no tier") + " " + g.list.length;
    })
    .join(", ");

  return (
    '<span class="ok">' +
    s.count +
    " sponsor" +
    (s.count === 1 ? "" : "s") +
    "</span>   " +
    esc(tiers)
  );
}

/**
 * The Rinks line: how many rinks have an address and which still need one,
 * so the manager knows exactly which Directions links are missing.
 *
 * @returns {string} HTML.
 */
function rinksLine() {
  var r = state.data.rinks;
  var k;
  var n = 0;
  var missing = [];

  if (!r) {
    return state.rinksNote
      ? '<span class="warn">not read — ' + esc(state.rinksNote) + "</span>"
      : "not read — add a Rinks tab (Rink name, Address) for Directions links (optional)";
  }

  for (k in r) {
    n++;

    if (!r[k].address) {
      missing.push(r[k].name);
    }
  }

  if (!n) {
    return '<span class="warn">tab read, no rinks on it</span>';
  }

  var s = '<span class="ok">' + (n - missing.length) + " of " + n + " with an address</span>";

  if (missing.length) {
    s += '   <span class="warn">no address yet: ' + esc(missing.join(", ")) + "</span>";
  }

  return s;
}

/**
 * The whole ?check page: masthead plus one preformatted block of lines.
 *
 * @returns {string} HTML.
 */
function diagHtml() {
  var L = [];

  L.push("<b>Rink Report setup check</b>\n");
  L.push(
    "Sheet ID     " +
      (CFG.sheetId && CFG.sheetId.indexOf("PASTE") === -1
        ? '<span class="ok">' + esc(CFG.sheetId) + "</span>"
        : '<span class="bad">not set — edit index.html and paste your sheet ID</span>')
  );
  var tabs = CFG.tabs || {};

  L.push(
    "Tabs         " +
      esc(
        [
          tabs.settings || "(no settings tab)",
          tabs.teams || "(no teams tab)",
          tabs.schedule || "(no schedule tab)",
          tabs.stats || "(no stats tab)",
          tabs.rinks || "(no rinks tab)",
          tabs.sponsors || "(no sponsors tab)"
        ].join("  /  ")
      )
  );
  L.push(
    "Fetched      " +
      (state.fetchedAt
        ? '<span class="ok">' + esc(new Date(state.fetchedAt).toLocaleString()) + "</span>"
        : state.loading
          ? "in progress"
          : '<span class="bad">never</span>')
  );

  if (state.loadError) {
    L.push('Error        <span class="bad">' + esc(state.loadError) + "</span>");
  }

  if (state.snapshotAt !== null) {
    L.push(
      'Saved copy   <span class="warn">Google could not be reached; showing the site\'s saved copy' +
        (state.snapshotAt ? " from " + esc(new Date(state.snapshotAt).toLocaleString()) : "") +
        "</span>"
    );
  }

  L.push("");
  L.push("<b>What loaded</b>");
  L.push(
    "Our team     " +
      (state.data.config.teamName
        ? '<span class="ok">' + esc(state.data.config.teamName) + "</span>"
        : '<span class="bad">blank — set it on the Settings tab</span>')
  );
  L.push(
    "Mode         " +
      esc(state.data.config.mode) +
      "   points " +
      state.data.config.ptsWin +
      "/" +
      state.data.config.ptsTie +
      "/" +
      state.data.config.ptsLoss
  );
  L.push("Teams        " + state.data.teams.length);
  L.push(
    "Games        " +
      state.data.games.length +
      "   (" +
      state.data.games.filter(played).length +
      " with scores)"
  );
  L.push(
    "Stats        " +
      (hasStats()
        ? '<span class="ok">' +
          state.data.stats.skaters.length +
          " skaters, " +
          state.data.stats.goalies.length +
          " goalies</span>"
        : state.statsNote
          ? '<span class="warn">not shown — ' + esc(state.statsNote) + "</span>"
          : "not shown — the Player Stats tab hasn't been read yet (optional)")
  );
  L.push("Rinks        " + rinksLine());
  L.push("Sponsors     " + sponsorsLine());

  var vs = buildViews();
  var evs = dataViews().filter(function (v) {
    return v.event;
  });
  var feat = featuredEvent(evs);

  L.push(
    "Bar          " +
      esc(
        vs
          .map(function (v) {
            return v.tab;
          })
          .join("   |   ")
      )
  );
  L.push(
    "Events       " +
      (evs.length
        ? esc(
            evs
              .map(function (v) {
                return (
                  v.label +
                  " (" +
                  v.games.length +
                  ", " +
                  v.first +
                  " to " +
                  v.last +
                  (v === feat ? ", in the bar" : "") +
                  ")"
                );
              })
              .join("   |   ")
          )
        : "none")
  );
  L.push("Showing      " + esc(currentView().label));

  var off = offList();

  L.push(
    "Features     " +
      (off.length
        ? '<span class="warn">off: ' +
          esc(off.join(", ")) +
          "</span>   (switched off in index.html; everything else is on)"
        : '<span class="ok">all on</span>')
  );
  L.push(
    "Read via     " + (state.routeUsed.length ? state.routeUsed.join("   ") : "(not fetched)")
  );

  if (state.routeTrouble.length) {
    L.push(
      '<span class="bad">Tab IDs in index.html do not match this sheet — see "Correct tab IDs" below.</span>'
    );
  }

  if (state.headerMap.length) {
    L.push("");
    L.push("<b>Which Schedule column is which</b>");

    state.headerMap.forEach(function (m) {
      L.push(
        "  " +
          esc(m) +
          (m.indexOf("not found") !== -1 ? '   <span class="bad">&lt;-- fix this</span>' : "")
      );
    });
  }

  if (state.data.config.teamName && state.data.teams.indexOf(state.data.config.teamName) === -1) {
    L.push(
      '<span class="bad">Our team name does not match any row on the Teams tab — check the spelling.</span>'
    );
  }

  L.push("");
  L.push("<b>Warnings</b>");

  if (!state.problems.length) {
    L.push('<span class="ok">none</span>');
  } else {
    state.problems.forEach(function (p) {
      L.push('<span class="warn">- ' + esc(p) + "</span>");
    });
  }

  L.push("");
  L.push("<b>First rows read from the schedule</b>");

  if (!state.data.games.length) {
    L.push("(none)");
  } else {
    state.data.games.slice(0, 6).forEach(function (g) {
      L.push(
        esc(
          "  " +
            g.date +
            "  " +
            (g.time || "--") +
            "  " +
            (g.away || "TBD") +
            " at " +
            (g.home || "TBD") +
            (played(g) ? "  " + g.as + "-" + g.hs : "  (no score)") +
            (g.pool ? "  [" + g.pool + "]" : "") +
            (g.type ? "  " + g.type : "")
        )
      );
    });
  }

  L.push("");
  L.push("<b>Request log</b>");

  state.diagLog.forEach(function (m) {
    L.push("  " + esc(m));
  });

  L.push("");
  L.push('<a href="./">back to the page</a>');

  return (
    '<header class="masthead"><div class="txt"><div class="eyebrow">Diagnostics</div><h1>Setup check</h1></div></header><pre class="diag">' +
    L.join("\n") +
    "</pre>"
  );
}

export { diagHtml };
