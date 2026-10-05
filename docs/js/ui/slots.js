/**
 * Component: the Ice slots card, on a league staff page only.
 *
 * What the clubs brought to the scheduling meeting, summed per club and
 * listed by date, so the commissioner can see the ice before the
 * scheduling tool runs on it. The tool itself (model/schedule-builder.js)
 * is the next step; this card is its input, checked.
 * See ARCHITECTURE.md, "Ice slots tab".
 */
import { state } from "../state.js";
import { fmtDate } from "../util/dates.js";
import { esc } from "../util/text.js";

/**
 * "1 slot" / "11 slots".
 *
 * @param {number} n
 * @returns {string}
 */
function slotsWord(n) {
  return n + (n === 1 ? " slot" : " slots");
}

/**
 * How many slots each team brought, in Teams-tab order, teams with none
 * included so the gap is visible.
 *
 * @param {Object[]} slots
 * @returns {{team: string, n: number}[]}
 */
function perTeam(slots) {
  var counts = {};
  var teams = state.data.teams;

  slots.forEach(function (s) {
    counts[s.team] = (counts[s.team] || 0) + 1;
  });

  return teams.map(function (t) {
    return { team: t, n: counts[t] || 0 };
  });
}

/**
 * The games the league needs against the ice it has: with N teams at G
 * games each, N x G / 2 games.
 *
 * @param {number} slotCount
 * @returns {string} One sentence.
 */
function needLine(slotCount) {
  var cfg = state.data.config;
  var n = state.data.teams.length;

  if (!cfg.gamesPerTeam) {
    return "Set “Games per team” on the Settings tab and this line says whether the ice covers it.";
  }

  var games = Math.ceil((n * cfg.gamesPerTeam) / 2);
  var spare = slotCount - games;

  return (
    n +
    " teams at " +
    cfg.gamesPerTeam +
    " games each is " +
    games +
    " games. " +
    (spare >= 0
      ? slotCount + " slots covers it with " + spare + " to spare."
      : "Only " + slotCount + " slots: " + -spare + " short.")
  );
}

/**
 * The card.
 *
 * @returns {string} HTML.
 */
function slotsHtml() {
  var slots = state.data.slots;
  var h = '<section class="card slots"><div class="card-h"><h2>Ice slots</h2>';

  if (slots && slots.length) {
    h += '<span class="eyebrow">' + slotsWord(slots.length) + "</span>";
  }

  h += '</div><div class="card-b">';

  if (!slots) {
    h +=
      '<p class="empty">No Ice slots tab read yet. ' +
      (state.slotsNote ? esc(state.slotsNote) + ". " : "") +
      "Add a tab named Ice slots (Home team, Rink, Date, Face-off) and give its gid to config.js.</p>";

    return h + "</div></section>";
  }

  if (!slots.length) {
    h += '<p class="empty">The Ice slots tab is there but empty. One row per hour of ice a club brings.</p>';

    return h + "</div></section>";
  }

  h += '<p class="need">' + esc(needLine(slots.length)) + "</p>";

  h += '<div class="tablewrap"><table class="slotsum"><thead><tr><th scope="col">Team</th><th scope="col">Brought</th></tr></thead><tbody>';

  perTeam(slots).forEach(function (row) {
    h +=
      "<tr" +
      (row.n ? "" : ' class="none"') +
      "><td>" +
      esc(row.team) +
      "</td><td>" +
      (row.n ? slotsWord(row.n) : "none yet") +
      "</td></tr>";
  });

  h += "</tbody></table></div>";

  // Date and time in mono (they are numbers), the team and its rink in the
  // text face, the rink under the team so nothing scrolls sideways.
  h += '<details class="slotlist"><summary>Every slot by date</summary><div class="tablewrap"><table>';
  h += '<thead><tr><th scope="col">Date</th><th scope="col">Time</th><th scope="col">Home team, rink</th></tr></thead><tbody>';

  slots.forEach(function (s) {
    h +=
      '<tr><td class="d">' +
      esc(fmtDate(s.date)) +
      '</td><td class="t">' +
      esc(s.time || "") +
      '</td><td class="who">' +
      esc(s.team) +
      (s.rink ? '<span class="rk">' + esc(s.rink) + "</span>" : "") +
      "</td></tr>";
  });

  h += "</tbody></table></div></details>";

  return h + "</div></section>";
}

export { slotsHtml };
