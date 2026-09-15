/**
 * Text helpers shared by every layer.
 *
 * esc() is the one gate between sheet text and HTML: anything a manager can
 * type into the sheet passes through it before it reaches innerHTML. norm()
 * is the comparison form of a string, used by header matching, team-name
 * snapping and settings labels. bare() is a prototype-free object for any
 * map keyed by sheet text.
 */

/**
 * HTML-escapes a value for innerHTML.
 *
 * @param {*} s - Null and undefined become "".
 * @returns {string}
 */
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * The comparison form of a string: lowercase, letters and digits only.
 *
 * @param {*} s
 * @returns {string}
 */
function norm(s) {
  return String(s == null ? "" : s)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Collapses runs of whitespace to one space and trims.
 *
 * @param {*} s
 * @returns {string}
 */
function clean(s) {
  return String(s == null ? "" : s)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * An object with no prototype, for any map keyed by sheet text. A team named
 * "__proto__" or "constructor" would otherwise corrupt every lookup.
 *
 * @returns {Object}
 */
function bare() {
  return Object.create ? Object.create(null) : {};
}

/**
 * Levenshtein distance, capped: 99 when the lengths differ by more than 3.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function editDistance(a, b) {
  if (a === b) {
    return 0;
  }

  if (Math.abs(a.length - b.length) > 3) {
    return 99;
  }

  var prev = [];
  var cur = [];
  var i;
  var j;

  for (j = 0; j <= b.length; j++) {
    prev[j] = j;
  }

  for (i = 1; i <= a.length; i++) {
    cur[0] = i;

    for (j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1)
      );
    }

    for (j = 0; j <= b.length; j++) {
      prev[j] = cur[j];
    }
  }

  return prev[b.length];
}

/**
 * The name in the list within two edits of the given name, or null. Used to
 * say which Teams-tab name a Schedule name nearly matched.
 *
 * @param {string} name
 * @param {string[]} list
 * @returns {string|null}
 */
function nearestName(name, list) {
  var n = norm(name);
  var best = null;
  var bestD = 3;
  var i;
  var d;

  for (i = 0; i < list.length; i++) {
    d = editDistance(n, norm(list[i]));

    if (d < bestD) {
      bestD = d;
      best = list[i];
    }
  }

  return best;
}

/**
 * A URL safe to put in an href, or "". Only http and https pass; a bare
 * domain is promoted to https; any other scheme is dropped.
 *
 * @param {*} s
 * @returns {string}
 */
function safeUrl(s) {
  var u = clean(s);

  if (!u) {
    return "";
  }

  if (/^https?:\/\//i.test(u)) {
    return u;
  }

  // mailto:, javascript:, data: and the like are not links here.
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) {
    return "";
  }

  if (/^[\w-]+(\.[\w-]+)+([\/?#].*)?$/.test(u)) {
    return "https://" + u;
  }

  return "";
}

/**
 * A non-negative integer from sheet text, or null. "3.0" counts as 3.
 *
 * @param {*} v
 * @returns {number|null}
 */
function num(v) {
  var s = clean(v);

  if (s === "") {
    return null;
  }

  if (!/^-?\d+(\.0+)?$/.test(s)) {
    return null;
  }

  var n = parseInt(s, 10);

  return isNaN(n) || n < 0 ? null : n;
}

export { esc, norm, clean, bare, nearestName, num, safeUrl };
