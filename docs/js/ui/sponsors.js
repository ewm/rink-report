/**
 * Component: the sponsors block.
 *
 * sponsorsHtml() renders the tiers in order, each sponsor in its own outlined
 * box, at the foot of every view. The header is a button that folds the
 * block; open is the default and a fold is remembered per phone only.
 * See ARCHITECTURE.md, "Sponsors".
 */
import { state } from "../state.js";
import { esc } from "../util/text.js";

/**
 * One sponsor's name, linked when the sheet gives a website.
 *
 * @param {Object} p - The sponsor: name and optional url.
 * @returns {string} HTML.
 */
function nameHtml(p) {
  if (!p.url) {
    return "<span>" + esc(p.name) + "</span>";
  }

  return (
    '<a href="' + esc(p.url) + '" target="_blank" rel="noopener noreferrer">' + esc(p.name) + "</a>"
  );
}

/**
 * The CSS class for a tier. It comes from which tier this is, never from
 * where the tier sits in the list. See ARCHITECTURE.md, "Sponsors".
 *
 * @param {number} rank - 0 gold, 1 silver, 2 bronze, anything else plain.
 * @returns {string}
 */
function tierClass(rank) {
  return rank < 3 ? "sp" + rank : "spx";
}

/**
 * The sponsors card, or "" when there is no Sponsors tab or it is empty.
 *
 * @returns {string} HTML.
 */
function sponsorsHtml() {
  var s = state.data.sponsors;

  if (!s || !s.groups.length) {
    return "";
  }

  var open = !!state.sponsorsOpen;
  var count = s.count + " sponsor" + (s.count === 1 ? "" : "s");

  var h =
    '<section class="card sponsors' +
    (open ? "" : " shut") +
    '">' +
    '<button type="button" class="card-h sph" data-act="sponsors" aria-expanded="' +
    (open ? "true" : "false") +
    '" aria-controls="rr-sponsors"><h2>Our sponsors</h2>' +
    '<span class="eyebrow">' +
    (open ? "Thank you" : esc(count)) +
    '<svg class="chev" width="11" height="7" viewBox="0 0 11 7" aria-hidden="true">' +
    '<path d="M1 1l4.5 4.5L10 1" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>' +
    "</span></button>";

  // The body is always in the markup so the button has something to point at;
  // `hidden` is what folds it, which keeps screen readers in step.
  h += '<div class="card-b" id="rr-sponsors"' + (open ? "" : " hidden") + ">";

  s.groups.forEach(function (g) {
    h += '<div class="sptier ' + tierClass(g.rank) + '">';

    if (g.label) {
      h += '<span class="sptl">' + esc(g.label) + "</span>";
    }

    h += '<div class="sprail">' + g.list.map(nameHtml).join("") + "</div></div>";
  });

  var c = state.data.config.sponsorContact;

  if (c) {
    h += '<p class="foot">' + esc(c) + "</p>";
  }

  return h + "</div></section>";
}

export { sponsorsHtml, tierClass };
