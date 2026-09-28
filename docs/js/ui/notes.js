/**
 * Component: the Coaches report, on ?admin only.
 *
 * The written report that goes with the Coaches Corner numbers. It is not
 * worked out by the page: the manager writes it (or has it written), saves
 * it as data/coaches-corner.txt in the team folder, and uploads it with the
 * other files. The page reads the file and draws it as a folded card under
 * the Coaches Corner card. Folded on every open; nothing is remembered.
 *
 * The file is plain text, in the shape the report is already written in:
 *
 *   COACHES CORNER: GAMES THROUGH 9/25/2026     the first line is the title
 *   1. HEADLINE                                 a numbered line in capitals
 *                                               starts a section
 *   - Record 6-2-3.                             a dash starts a bullet
 *   1. Finishing reps for ...                   a number inside a section
 *                                               starts a numbered point
 *   Anything else is a paragraph.
 *
 * Unlike the card above it, the report names players. render.js only draws
 * it with ?admin, and the card says so at the bottom.
 * See ARCHITECTURE.md, "Coaches report".
 */
import { state } from "../state.js";
import { esc } from "../util/text.js";

/**
 * A section heading: "1. HEADLINE", "6. WHAT THE NUMBERS CAN'T TELL US YET".
 * Every letter is a capital, which is what tells it apart from a numbered
 * point inside a section ("1. Finishing reps ...").
 */
var HEADING = /^\d+\.\s+([A-Z0-9][A-Z0-9 '’,:/()-]*)$/;

/** A bullet: "- Record 6-2-3." */
var BULLET = /^[-•]\s+(.*)$/;

/** A numbered point: "2. A discipline reminder ..." */
var NUMBERED = /^\d+\.\s+(.*)$/;

/**
 * The report split into a title and sections, each holding blocks.
 *
 * A block is {kind, text} for a paragraph, or {kind, items} for a bullet
 * list ("ul") or a numbered list ("ol"). Lines before the first heading
 * become the opening section, which has no heading of its own.
 *
 * @param {string} text - The file's contents.
 * @returns {{title: string, sections: {heading: string, blocks: Object[]}[]}}
 */
function parseNotes(text) {
  var lines = String(text || "").split(/\r?\n/);
  var out = { title: "", sections: [] };
  var section = null;
  var list = null;

  /**
   * Starts a section, with or without a heading.
   *
   * @param {string} heading
   */
  function open(heading) {
    section = { heading: heading, blocks: [] };
    out.sections.push(section);
    list = null;
  }

  /**
   * Adds an item to the current list, starting one of the given kind if
   * the last block is not that kind of list.
   *
   * @param {string} kind - "ul" or "ol".
   * @param {string} item
   */
  function addItem(kind, item) {
    if (!list || list.kind !== kind) {
      list = { kind: kind, items: [] };
      section.blocks.push(list);
    }

    list.items.push(item);
  }

  lines.forEach(function (raw) {
    var line = raw.trim();
    var m;

    if (!line) {
      list = null;
      return;
    }

    if (!out.title) {
      out.title = line;
      return;
    }

    m = line.match(HEADING);

    if (m) {
      open(titleCase(m[1]));
      return;
    }

    if (!section) {
      open("");
    }

    m = line.match(BULLET);

    if (m) {
      addItem("ul", m[1]);
      return;
    }

    m = line.match(NUMBERED);

    if (m) {
      addItem("ol", m[1]);
      return;
    }

    list = null;
    section.blocks.push({ kind: "p", text: line });
  });

  return out;
}

/**
 * "WHAT NEEDS WORK" as "What needs work". The headings are typed in capitals
 * so they stand out in the text file; on the page the style does that.
 *
 * @param {string} s
 * @returns {string}
 */
function titleCase(s) {
  var lower = s.toLowerCase();

  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * The words after the colon in the title, for the card's eyebrow:
 * "COACHES CORNER: GAMES THROUGH 9/25/2026" gives "Games through 9/25/2026".
 * A title with no colon is used whole.
 *
 * @param {string} title
 * @returns {string}
 */
function eyebrowText(title) {
  var i = title.indexOf(":");
  var tail = i === -1 ? title : title.slice(i + 1);

  return titleCase(tail.trim());
}

/**
 * One block as HTML.
 *
 * @param {Object} b - From parseNotes().
 * @returns {string}
 */
function blockHtml(b) {
  if (b.kind === "p") {
    return "<p>" + esc(b.text) + "</p>";
  }

  var h = "<" + b.kind + ">";

  b.items.forEach(function (item) {
    h += "<li>" + esc(item) + "</li>";
  });

  return h + "</" + b.kind + ">";
}

/**
 * The card. Only drawn on ?admin; render.js checks that.
 *
 * @returns {string} "" when there is no report file, or it is empty.
 */
function notesHtml() {
  var text = state.coachNotes;

  if (!text || !text.trim()) {
    return "";
  }

  var notes = parseNotes(text);
  var open = !!state.notesOpen;

  var h =
    '<section class="card coach notes' +
    (open ? "" : " shut") +
    '">' +
    '<button type="button" class="card-h sph" data-act="coachnotes" aria-expanded="' +
    (open ? "true" : "false") +
    '" aria-controls="rr-notes"><h2>Coaches report</h2>' +
    '<span class="eyebrow">' +
    esc(eyebrowText(notes.title)) +
    '<svg class="chev" width="11" height="7" viewBox="0 0 11 7" aria-hidden="true">' +
    '<path d="M1 1l4.5 4.5L10 1" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>' +
    "</span></button>";

  // The body stays in the markup, folded with `hidden`, the same as sponsors.
  h += '<div class="card-b" id="rr-notes"' + (open ? "" : " hidden") + ">";

  notes.sections.forEach(function (s) {
    h += '<div class="nsec">';

    if (s.heading) {
      h += "<h3>" + esc(s.heading) + "</h3>";
    }

    s.blocks.forEach(function (b) {
      h += blockHtml(b);
    });

    h += "</div>";
  });

  h +=
    '<p class="foot">Written by hand and saved as data/coaches-corner.txt in the team folder; the page only shows it. ' +
    "It names players, and anyone who adds ?admin to the address can read it.</p>";

  h += "</div></section>";

  return h;
}

export { notesHtml, parseNotes };
