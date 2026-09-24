/**
 * Links a parent taps: directions to a rink, and a game (or the whole
 * season) into their phone's calendar.
 *
 * Everything here is built in the browser from data already on the page.
 * Calendar times are floating local time (no Z, no TZID).
 * See ARCHITECTURE.md, "Directions and calendar links".
 */
import { isOurs, played } from "./game.js";
import { state } from "../state.js";
import { dateObj, timeKey } from "../util/dates.js";
import { nearestName, norm } from "../util/text.js";

/**
 * The rink row for a game, or null when the Rinks tab has no such rink.
 *
 * A Schedule rink is text, so a name within two edits of a Rinks row still
 * finds its address (the same rule as team snapping).
 *
 * @param {Object} g
 * @returns {Object|null}
 */
function rinkFor(g) {
  var rinks = state.data.rinks;

  if (!g || !g.rink || !rinks) {
    return null;
  }

  var hit = rinks[norm(g.rink)];

  if (hit) {
    return hit;
  }

  var names = [];
  var k;

  for (k in rinks) {
    names.push(rinks[k].name);
  }

  var near = nearestName(g.rink, names);

  return near ? rinks[norm(near)] || null : null;
}

/**
 * A street address for a game's rink, or "" when the sheet has none.
 *
 * @param {Object} g
 * @returns {string}
 */
function rinkAddress(g) {
  var r = rinkFor(g);

  return r && r.address ? r.address : "";
}

/**
 * Whether the reader is on an Apple device. Apple devices open the built-in
 * Maps app from a maps.apple.com link; a Google Maps link there lands on an
 * install page.
 *
 * @returns {boolean}
 */
function isApple() {
  try {
    return /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent || "");
  } catch (e) {
    return false;
  }
}

/**
 * A maps link to an address: Apple Maps on Apple devices, Google Maps
 * everywhere else. "" for no address.
 *
 * @param {string} address
 * @returns {string}
 */
function directionsUrl(address) {
  if (!address) {
    return "";
  }

  var q = encodeURIComponent(address);

  return isApple()
    ? "https://maps.apple.com/?daddr=" + q
    : "https://www.google.com/maps/dir/?api=1&destination=" + q;
}

/**
 * Directions to a game's rink, or "" when the address isn't on the sheet.
 *
 * @param {Object} g
 * @returns {string}
 */
function directionsFor(g) {
  return directionsUrl(rinkAddress(g));
}

/* ---- calendar ---- */

var GAME_MINUTES = 90; // a youth game with warm-up fits a 90-minute slot

/**
 * Two-digit zero-padded number.
 *
 * @param {number} n
 * @returns {string}
 */
function pad(n) {
  return (n < 10 ? "0" : "") + n;
}

/**
 * "20261113T191000" in the reader's local time (no Z, no TZID). A game in
 * Buffalo is at 7:10 wherever the phone happens to be.
 *
 * @param {Date} d
 * @returns {string}
 */
function stamp(d) {
  return (
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    "T" +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    "00"
  );
}

/**
 * "20261113" for an all-day entry.
 *
 * @param {Date} d
 * @returns {string}
 */
function dayStamp(d) {
  return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
}

/**
 * Start and end Date objects for a game, or null when the date is
 * unreadable. allDay is true when the sheet has no face-off time.
 *
 * @param {Object} g
 * @returns {{start: Date, end: Date, allDay: boolean}|null}
 */
function gameWindow(g) {
  var d = dateObj(g.date);

  if (!d) {
    return null;
  }

  var k = timeKey(g.time);

  if (k === 9999) {
    var next = new Date(d.getTime());

    next.setDate(next.getDate() + 1);

    return { start: d, end: next, allDay: true };
  }

  var s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(k / 60), k % 60);

  return { start: s, end: new Date(s.getTime() + GAME_MINUTES * 60000), allDay: false };
}

/**
 * The calendar entry title: "vs Southtown Stars (hockey)" for our games,
 * "Wings at Southtown Stars" otherwise.
 *
 * @param {Object} g
 * @returns {string}
 */
function gameTitle(g) {
  var us = state.data.config.teamName;

  if (us && isOurs(g)) {
    var opp = g.home === us ? g.away : g.home;

    return (g.home === us ? "vs " : "at ") + (opp || "TBD") + " (hockey)";
  }

  return (g.away || "TBD") + " at " + (g.home || "TBD");
}

/**
 * Rink name and address for the calendar location field.
 *
 * @param {Object} g
 * @returns {string}
 */
function gameLocation(g) {
  var addr = rinkAddress(g);

  if (!g.rink) {
    return addr;
  }

  return addr ? g.rink + ", " + addr : g.rink;
}

/**
 * The calendar notes: event and pool, game type (unless "pool"), and a link
 * back to the page.
 *
 * @param {Object} g
 * @returns {string}
 */
function gameNotes(g) {
  var bits = [];

  if (g.event) {
    bits.push(g.event + (g.pool ? " · " + g.pool : ""));
  }

  if (g.type && norm(g.type) !== "pool") {
    bits.push(g.type);
  }

  bits.push("Scores and standings: " + pageUrl());

  return bits.join("\n");
}

/**
 * This page's address without query or hash, or "" outside a browser.
 *
 * @returns {string}
 */
function pageUrl() {
  try {
    return location.origin + location.pathname;
  } catch (e) {
    return "";
  }
}

/**
 * Google Calendar's "add this event" page. Floating local times, like the .ics.
 *
 * @param {Object} g
 * @returns {string}
 */
function googleCalendarUrl(g) {
  var w = gameWindow(g);

  if (!w) {
    return "";
  }

  var dates = w.allDay
    ? dayStamp(w.start) + "/" + dayStamp(w.end)
    : stamp(w.start) + "/" + stamp(w.end);

  return (
    "https://calendar.google.com/calendar/render?action=TEMPLATE" +
    "&text=" +
    encodeURIComponent(gameTitle(g)) +
    "&dates=" +
    dates +
    "&location=" +
    encodeURIComponent(gameLocation(g)) +
    "&details=" +
    encodeURIComponent(gameNotes(g))
  );
}

/**
 * iCalendar text escaping: backslash, comma, semicolon; newlines as \n.
 *
 * @param {string} s
 * @returns {string}
 */
function icsText(s) {
  return String(s == null ? "" : s)
    .replace(/\\/g, "\\\\")
    .replace(/([,;])/g, "\\$1")
    .replace(/\r?\n/g, "\\n");
}

/**
 * One VEVENT block for a game, or "" when its date is unreadable.
 *
 * @param {Object} g
 * @returns {string}
 */
function vevent(g) {
  var w = gameWindow(g);

  if (!w) {
    return "";
  }

  var uid = (g.id || "g") + "-" + g.date + "@rinkreport";
  var L = ["BEGIN:VEVENT", "UID:" + uid, "DTSTAMP:" + stamp(new Date(state.fetchedAt || Date.now())) + "Z"];

  if (w.allDay) {
    L.push("DTSTART;VALUE=DATE:" + dayStamp(w.start));
    L.push("DTEND;VALUE=DATE:" + dayStamp(w.end));
  } else {
    L.push("DTSTART:" + stamp(w.start));
    L.push("DTEND:" + stamp(w.end));
  }

  L.push("SUMMARY:" + icsText(gameTitle(g)));

  var loc = gameLocation(g);

  if (loc) {
    L.push("LOCATION:" + icsText(loc));
  }

  L.push("DESCRIPTION:" + icsText(gameNotes(g)));
  L.push("END:VEVENT");

  return L.join("\r\n");
}

/**
 * A complete .ics file for a list of games.
 *
 * @param {Object[]} games
 * @returns {string}
 */
function icsFile(games) {
  var body = games
    .map(vevent)
    .filter(function (x) {
      return x;
    })
    .join("\r\n");

  return (
    [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Check The Rink//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      body,
      "END:VCALENDAR"
    ].join("\r\n") + "\r\n"
  );
}

/**
 * A data: URL the phone opens as a calendar file.
 *
 * @param {Object[]} games
 * @returns {string}
 */
function icsUrl(games) {
  return "data:text/calendar;charset=utf-8," + encodeURIComponent(icsFile(games));
}

/**
 * The data: URL for a single game.
 *
 * @param {Object} g
 * @returns {string}
 */
function icsUrlFor(g) {
  return icsUrl([g]);
}

/**
 * Our whole schedule, unplayed games only: the ones a parent still needs to
 * get to. Scrimmages stay in; they're still a drive to a rink.
 *
 * @returns {Object[]}
 */
function ourSeasonGames() {
  return state.data.games.filter(function (g) {
    return isOurs(g) && !played(g) && g.away && g.home;
  });
}

export { rinkAddress, directionsFor, googleCalendarUrl, icsUrl, icsUrlFor, ourSeasonGames };
