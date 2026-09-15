/**
 * Component: the Events page and the crumb back to it.
 *
 * eventsHtml() renders Coming up (the featured event tagged NOW/NEXT) and
 * Past events newest first, each row a button that opens the event.
 * crumbHtml(view) renders the "All events" way back, with the date range.
 */
import { dataViews, featuredEvent, isLive, ourRecordIn } from "../model/views.js";
import { dateRange, todayISO } from "../util/dates.js";
import { esc } from "../util/text.js";

/**
 * The Events page: what is coming, then what is done, newest first.
 *
 * @param {Object[]} views - Unused; the page reads dataViews() itself.
 * @returns {string} HTML.
 */
function eventsHtml(views) {
  var all = dataViews().filter(function (v) {
    return v.event;
  });
  var today = todayISO();
  var feat = featuredEvent(all);
  var ahead = [];
  var past = [];

  all.forEach(function (v) {
    (v.last >= today ? ahead : past).push(v);
  });

  ahead.sort(function (a, b) {
    return a.first < b.first ? -1 : 1;
  });
  past.sort(function (a, b) {
    return a.first > b.first ? -1 : 1;
  });

  /**
   * One button row per event: name, NOW/NEXT tag, dates, and our record or
   * the game count.
   *
   * @param {Object[]} list - Event views.
   * @returns {string} HTML.
   */
  function rows(list) {
    var h = "";

    list.forEach(function (v) {
      var rec = ourRecordIn(v);
      var n = v.games.length;
      var right;

      if (rec) {
        right = '<span class="evrec">' + rec.w + "-" + rec.l + "-" + rec.t + "</span>";
      } else {
        right = '<span class="evrec muted">' + n + " game" + (n === 1 ? "" : "s") + "</span>";
      }

      h +=
        '<button type="button" class="evrow" data-act="view" data-v="' +
        esc(v.key) +
        '">' +
        '<span class="evname">' +
        esc(v.label) +
        (v === feat ? ' <span class="tag w">' + (isLive(v) ? "NOW" : "NEXT") + "</span>" : "") +
        "</span>" +
        '<span class="evdates">' +
        esc(dateRange(v.first, v.last)) +
        "</span>" +
        right +
        "</button>";
    });

    return h;
  }

  var h = "";

  h +=
    '<section class="card"><div class="card-h"><h2>Coming up</h2><span class="eyebrow">' +
    (ahead.length ? "Tap one to open it" : "") +
    '</span></div><div class="card-b">';
  h += ahead.length ? rows(ahead) : '<p class="empty">Nothing on the calendar yet.</p>';
  h += "</div></section>";

  h +=
    '<section class="card"><div class="card-h"><h2>Past events</h2><span class="eyebrow">Newest first</span></div><div class="card-b">';
  h += past.length ? rows(past) : '<p class="empty">None yet.</p>';
  h += "</div></section>";

  return h;
}

/**
 * The way back from an event opened off the Events list.
 *
 * @param {Object} v - The event view.
 * @returns {string} HTML.
 */
function crumbHtml(v) {
  return (
    '<div class="crumb"><button type="button" data-act="view" data-v="events">&larr; All events</button>' +
    '<span class="evdates">' +
    esc(dateRange(v.first, v.last)) +
    "</span></div>"
  );
}

export { eventsHtml, crumbHtml };
