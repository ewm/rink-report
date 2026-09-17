/**
 * Component: the gameday post card.
 *
 * A 1080x1080 PNG for Instagram, drawn on a canvas from one upcoming game.
 * Opened from a schedule row when the page is in admin mode (?admin), so a
 * parent never sees the button.
 *
 * The panel lives outside #app on purpose. render() writes #app in one go
 * and would throw away a canvas mid-draw on the next poll, so this module
 * owns its own node and its own lifecycle.
 * See ARCHITECTURE.md, "Gameday post card".
 */
import { state } from "../state.js";
import { dateObj } from "../util/dates.js";

/** The square Instagram wants. Everything below is in these pixels. */
var SIZE = 1080;

/** Page margin. The gold bands run full width; type stays inside this. */
var PAD = 84;

var NAVY = "#003087";
var GOLD = "#FCD51E";
var WHITE = "#FFFFFF";

/** The open panel, or null. One at a time. */
var panel = null;

/** The game the open panel is drawing. */
var current = null;

/**
 * Finds a game by the key a schedule row carries.
 *
 * Games have no id on the sheet, so the row identifies one by the four
 * columns that cannot repeat: a team cannot play twice at one face-off.
 *
 * @param {string} key - "date|time|away|home".
 * @returns {Object|null}
 */
function gameByKey(key) {
  var hit = null;

  state.data.games.forEach(function (g) {
    if (postKey(g) === key) {
      hit = g;
    }
  });

  return hit;
}

/**
 * The key for a game, matching gameByKey.
 *
 * @param {Object} g
 * @returns {string}
 */
function postKey(g) {
  return [g.date, g.time || "", g.away || "", g.home || ""].join("|");
}

/**
 * Loads the web fonts the canvas draws with.
 *
 * Canvas does not wait for a webfont the way the DOM does: draw too early
 * and the card comes out in Times. These are the same families the page
 * already loads, so this resolves from cache in the normal case.
 *
 * @returns {Promise}
 */
function loadFonts() {
  if (!document.fonts || !document.fonts.load) {
    return Promise.resolve();
  }

  var wanted = [
    '700 120px "Barlow Condensed"',
    '700 40px "Barlow"',
    '400 40px "Barlow"',
    '600 60px "Chivo Mono"'
  ];

  return Promise.all(
    wanted.map(function (f) {
      return document.fonts.load(f).catch(function () {});
    })
  );
}

/**
 * Loads the club crest, if the site has one.
 *
 * logo.png is same-origin, so drawing it does not taint the canvas and the
 * PNG still exports. A missing crest is not an error: the card just runs
 * without it.
 *
 * @returns {Promise<HTMLImageElement|null>}
 */
function loadCrest() {
  return new Promise(function (resolve) {
    if (!state.logoOk) {
      resolve(null);
      return;
    }

    var img = new Image();

    img.onload = function () {
      resolve(img);
    };

    img.onerror = function () {
      resolve(null);
    };

    img.src = "logo.png";
  });
}

/**
 * Sets a font on the context, with letter spacing where the browser has it.
 *
 * ctx.letterSpacing is recent. Where it is missing the type simply sits
 * tight, which is a smaller loss than not drawing at all.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} font - A CSS font shorthand.
 * @param {string} [spacing] - e.g. "0.2em".
 */
function setFont(ctx, font, spacing) {
  ctx.font = font;

  try {
    ctx.letterSpacing = spacing || "0px";
  } catch (e) {}
}

/**
 * The largest size at or below start that fits text into maxWidth.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} maxWidth
 * @param {number} start - Size to try first, in px.
 * @param {number} min - Smallest size worth trying.
 * @param {Function} fontAt - size -> CSS font shorthand.
 * @returns {number} The size to use.
 */
function fitSize(ctx, text, maxWidth, start, min, fontAt) {
  var size = start;

  while (size > min) {
    setFont(ctx, fontAt(size));

    if (ctx.measureText(text).width <= maxWidth) {
      return size;
    }

    size -= 4;
  }

  return min;
}

/**
 * Breaks text into at most two lines that each fit maxWidth.
 *
 * "Niagara Jr. Cataracts" on one line at a readable size does not fit a
 * 1080px square, and shrinking it to fit makes the opponent smaller than
 * the rink name. Two lines keep it loud.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} maxWidth
 * @returns {string[]} One or two lines.
 */
function twoLines(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) {
    return [text];
  }

  var words = text.split(/\s+/);

  if (words.length < 2) {
    return [text];
  }

  var best = null;
  var bestGap = Infinity;

  // Split at whichever gap leaves the two lines closest in width.
  for (var i = 1; i < words.length; i++) {
    var a = words.slice(0, i).join(" ");
    var b = words.slice(i).join(" ");
    var gap = Math.abs(ctx.measureText(a).width - ctx.measureText(b).width);

    if (gap < bestGap) {
      bestGap = gap;
      best = [a, b];
    }
  }

  return best;
}

/**
 * The long date, the way a poster says it.
 *
 * @param {string} iso
 * @returns {string} e.g. "FRIDAY, SEPTEMBER 18".
 */
function longDate(iso) {
  var d = dateObj(iso);

  if (!d) {
    return "";
  }

  var days = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
  var months = [
    "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
    "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"
  ];

  return days[d.getDay()] + ", " + months[d.getMonth()] + " " + d.getDate();
}

/**
 * Draws the whole card onto a canvas.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {Object} g - The game.
 * @param {HTMLImageElement|null} crest
 */
function draw(canvas, g, crest) {
  var ctx = canvas.getContext("2d");
  var us = state.data.config.teamName;
  var atHome = g.home === us;
  var opponent = (atHome ? g.away : g.home) || "TBD";
  var inner = SIZE - PAD * 2;

  canvas.width = SIZE;
  canvas.height = SIZE;

  ctx.fillStyle = NAVY;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // ---- top gold band: the crest and who we are ----
  var bandH = 168;

  ctx.fillStyle = GOLD;
  ctx.fillRect(0, 0, SIZE, bandH);

  var textLeft = PAD;

  if (crest && crest.naturalWidth) {
    var crestH = 112;
    var crestW = (crest.naturalWidth / crest.naturalHeight) * crestH;

    ctx.drawImage(crest, PAD, (bandH - crestH) / 2, crestW, crestH);
    textLeft = PAD + crestW + 28;
  }

  ctx.fillStyle = NAVY;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";

  var nameSize = fitSize(ctx, (us || "").toUpperCase(), SIZE - textLeft - PAD, 68, 30, function (s) {
    return '700 ' + s + 'px "Barlow Condensed", sans-serif';
  });

  setFont(ctx, '700 ' + nameSize + 'px "Barlow Condensed", sans-serif', "0.02em");
  ctx.fillText((us || "").toUpperCase(), textLeft, bandH / 2);

  // ---- the eyebrow ----
  ctx.textAlign = "center";
  ctx.fillStyle = GOLD;
  setFont(ctx, '700 46px "Barlow", sans-serif', "0.32em");
  ctx.fillText("GAMEDAY", SIZE / 2 + 12, 300);

  // ---- home or away, then the opponent, as loud as it fits ----
  ctx.fillStyle = GOLD;
  setFont(ctx, '700 62px "Barlow Condensed", sans-serif', "0.14em");
  ctx.fillText(atHome ? "VS" : "AT", SIZE / 2 + 6, 396);

  var name = opponent.toUpperCase();

  setFont(ctx, '700 150px "Barlow Condensed", sans-serif', "0.01em");

  var lines = twoLines(ctx, name, inner);
  var lineSize = 150;

  lines.forEach(function (l) {
    lineSize = Math.min(
      lineSize,
      fitSize(ctx, l, inner, 150, 56, function (s) {
        return '700 ' + s + 'px "Barlow Condensed", sans-serif';
      })
    );
  });

  setFont(ctx, '700 ' + lineSize + 'px "Barlow Condensed", sans-serif', "0.01em");
  ctx.fillStyle = WHITE;

  var lineH = lineSize * 0.94;
  var blockTop = 500 + (lines.length === 1 ? lineH / 2 : 0);

  lines.forEach(function (l, i) {
    ctx.fillText(l, SIZE / 2, blockTop + i * lineH);
  });

  // ---- the rule, then when and where ----
  ctx.fillStyle = GOLD;
  ctx.fillRect(PAD, 700, inner, 7);

  ctx.fillStyle = WHITE;

  var dateText = longDate(g.date);
  var dateSize = fitSize(ctx, dateText, inner, 78, 34, function (s) {
    return '700 ' + s + 'px "Barlow Condensed", sans-serif';
  });

  setFont(ctx, '700 ' + dateSize + 'px "Barlow Condensed", sans-serif', "0.03em");
  ctx.fillText(dateText, SIZE / 2, 776);

  if (g.time) {
    ctx.fillStyle = GOLD;
    setFont(ctx, '600 62px "Chivo Mono", monospace', "0.02em");
    ctx.fillText(g.time.toUpperCase(), SIZE / 2, 862);
  }

  if (g.rink) {
    ctx.fillStyle = WHITE;

    var rinkSize = fitSize(ctx, g.rink, inner, 42, 24, function (s) {
      return '600 ' + s + 'px "Barlow", sans-serif';
    });

    setFont(ctx, '600 ' + rinkSize + 'px "Barlow", sans-serif', "0.06em");
    ctx.fillText(g.rink, SIZE / 2, 934);
  }

  // ---- bottom gold band: where to find the rest ----
  var footH = 82;

  ctx.fillStyle = GOLD;
  ctx.fillRect(0, SIZE - footH, SIZE, footH);

  ctx.fillStyle = NAVY;
  setFont(ctx, '700 30px "Barlow", sans-serif', "0.18em");
  ctx.fillText(
    (location.host + location.pathname).replace(/\/$/, "").toUpperCase(),
    SIZE / 2,
    SIZE - footH / 2
  );
}

/**
 * A file name a phone's photo roll can live with.
 *
 * @param {Object} g
 * @returns {string}
 */
function fileNameFor(g) {
  var us = state.data.config.teamName || "gameday";
  var other = (g.home === us ? g.away : g.home) || "game";

  return (us + "-vs-" + other + "-" + g.date)
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() + ".png";
}

/**
 * Whether this browser can hand a PNG file to another app.
 *
 * Matters because a download link for a generated image does nothing useful
 * on an iPhone. Where the share sheet exists it is the only route that ends
 * in Instagram.
 *
 * @returns {boolean}
 */
function canShareFiles() {
  try {
    return !!(navigator.canShare && navigator.share && window.File);
  } catch (e) {
    return false;
  }
}

/**
 * Saves or shares the drawn card.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {Object} g
 */
function savePost(canvas, g) {
  var name = fileNameFor(g);

  canvas.toBlob(function (blob) {
    if (!blob) {
      note("The image could not be made on this browser. Try a screenshot.");
      return;
    }

    if (canShareFiles()) {
      var file = new File([blob], name, { type: "image/png" });

      if (navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file] }).catch(function () {});
        return;
      }
    }

    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");

    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();

    // Long enough for the download to start, short enough not to leak.
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 20000);
  }, "image/png");
}

/**
 * Replaces the line under the buttons.
 *
 * @param {string} msg
 */
function note(msg) {
  if (!panel) {
    return;
  }

  var el = panel.querySelector(".postnote");

  if (el) {
    el.textContent = msg;
  }
}

/**
 * Opens the panel for a game and draws it.
 *
 * @param {string} key - The row's data-g.
 */
function openPost(key) {
  var g = gameByKey(key);

  if (!g) {
    return;
  }

  closePost();
  current = g;

  panel = document.createElement("div");
  panel.className = "postwrap";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", "Gameday post");

  panel.innerHTML =
    '<div class="postcard">' +
      '<div class="posthead">' +
        '<span class="eyebrow">Gameday post</span>' +
        '<button type="button" data-act="postclose">Close</button>' +
      "</div>" +
      '<canvas class="postcanvas" width="' + SIZE + '" height="' + SIZE + '"></canvas>' +
      '<div class="postacts">' +
        '<button type="button" data-act="postsave">' +
          (canShareFiles() ? "Share image" : "Save image") +
        "</button>" +
      "</div>" +
      '<p class="postnote">Drawing&hellip;</p>' +
    "</div>";

  document.body.appendChild(panel);
  document.body.classList.add("post-open");

  var canvas = panel.querySelector(".postcanvas");

  Promise.all([loadFonts(), loadCrest()]).then(function (res) {
    if (!panel) {
      return;
    }

    draw(canvas, g, res[1]);
    note(
      canShareFiles()
        ? "1080 x 1080. Share sends it straight to Instagram."
        : "1080 x 1080 PNG. Saves to your downloads."
    );
  });
}

/** Closes the panel, if one is open. */
function closePost() {
  if (panel) {
    panel.remove();
    panel = null;
    current = null;
    document.body.classList.remove("post-open");
  }
}

/** Saves whatever the open panel is showing. */
function saveOpenPost() {
  if (!panel || !current) {
    return;
  }

  savePost(panel.querySelector(".postcanvas"), current);
}

export { openPost, closePost, saveOpenPost, postKey };
