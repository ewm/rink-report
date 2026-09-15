/**
 * Component: the gold next-game banner.
 *
 * nextGameHtml() reads state.data.games and prefers our next unplayed game,
 * else the next game on the schedule. A past game with no score shows as
 * "Waiting on a score" and gets no directions or calendar links.
 * See ARCHITECTURE.md, "Next game".
 */
import { bySlot, isOurs, played } from "../model/game.js";
import { directionsFor, googleCalendarUrl, icsUrlFor } from "../model/links.js";
import { on, state } from "../state.js";
import { countdownText, fmtDate, todayISO } from "../util/dates.js";
import { esc } from "../util/text.js";

/**
 * The next-game card: matchup, date line, event tag and action links.
 *
 * @returns {string} HTML.
 */
function nextGameHtml() {
  var today = todayISO();
  var open = state.data.games
    .filter(function (g) {
      return !played(g);
    })
    .sort(bySlot);
  var ahead = open.filter(function (g) {
    return g.date >= today;
  });

  // A past game with no score would otherwise sit here as "next" all week.
  var pool = ahead.length ? ahead : open;
  var stale = !ahead.length && open.length > 0;

  var ours = pool.filter(isOurs);
  var g = ours[0] || pool[0];
  var us = state.data.config.teamName;

  var h =
    '<section class="next"><div class="strip"><span class="eyebrow">' +
    (stale ? "Waiting on a score" : "Next game") +
    "</span>";

  if (g && !stale) {
    h += '<span class="countdown">' + esc(countdownText(g.date)) + "</span>";
  } else if (g) {
    h += '<span class="countdown">SCORE NOT IN</span>';
  }

  h += '</div><div class="body">';

  if (!g) {
    h += '<p class="empty">No upcoming games on the schedule.</p>';
  } else {
    if (!(g.away && g.home)) {
      h +=
        '<div class="matchup">' +
        esc(g.type || "Game") +
        ' <span class="vs">— teams TBD</span></div>';
    } else if (us && isOurs(g)) {
      var opp = g.home === us ? g.away : g.home;
      var atHome = g.home === us;

      h +=
        '<div class="matchup">' +
        (atHome ? "" : '<span class="vs">at</span> ') +
        esc(opp) +
        (atHome ? ' <span class="vs">at home</span>' : "") +
        "</div>";
    } else {
      h +=
        '<div class="matchup">' +
        esc(g.away) +
        ' <span class="vs">at</span> ' +
        esc(g.home) +
        "</div>";
    }

    h += '<div class="when"><span><b>' + esc(fmtDate(g.date)) + "</b></span>";

    if (g.time) {
      h += "<span>" + esc(g.time) + "</span>";
    }

    if (g.rink) {
      h += "<span>" + esc(g.rink) + "</span>";
    }

    h += "</div>";

    if (g.event) {
      h += '<div class="evtag">' + esc(g.event) + (g.pool ? " · " + esc(g.pool) : "") + "</div>";
    }

    h += actionsHtml(g, stale);
  }

  return h + "</div></section>";
}

/**
 * Directions and calendar links for one game. A game already waiting on a
 * score gets none.
 *
 * @param {Object} g - The game.
 * @param {boolean} stale - Whether the game is past and unscored.
 * @returns {string} HTML, or "" when there are no links.
 */
function actionsHtml(g, stale) {
  if (stale) {
    return "";
  }

  var dir = on("directions") ? directionsFor(g) : "";
  var cal = on("calendar");
  var gcal = cal ? googleCalendarUrl(g) : "";
  var ics = cal ? icsUrlFor(g) : "";
  var h = "";

  if (dir) {
    h += '<a class="act" href="' + esc(dir) + '" target="_blank" rel="noopener">Directions</a>';
  }

  if (ics) {
    h += '<a class="act" href="' + esc(ics) + '" download="game.ics">Add to calendar</a>';
  }

  if (gcal) {
    h +=
      '<a class="act" href="' + esc(gcal) + '" target="_blank" rel="noopener">Google Calendar</a>';
  }

  return h ? '<div class="actions">' + h + "</div>" : "";
}

export { nextGameHtml };
