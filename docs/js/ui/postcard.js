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
 * Paints the ground: navy, with a faint diagonal hatch.
 *
 * Flat navy across 1080 square reads as a placeholder. The hatch is barely
 * there at full size and gives the square some weave in a feed.
 *
 * @param {CanvasRenderingContext2D} ctx
 */
function drawGround(ctx) {
  ctx.fillStyle = NAVY;
  ctx.fillRect(0, 0, SIZE, SIZE);

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 3;

  for (var x = -SIZE; x < SIZE * 2; x += 28) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + SIZE, SIZE);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * The header: crest on the left, club name beside it, gold rule under.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLImageElement|null} crest
 * @param {string} club
 * @returns {number} The y the rule sits on.
 */
function drawHeader(ctx, crest, club) {
  var ruleY = 190;
  var left = PAD;

  if (crest && crest.naturalWidth) {
    var h = 116;
    var w = (crest.naturalWidth / crest.naturalHeight) * h;

    ctx.drawImage(crest, PAD, (ruleY - h) / 2, w, h);
    left = PAD + w + 30;
  }

  ctx.fillStyle = GOLD;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  var size = fitSize(ctx, club, SIZE - left - PAD, 58, 26, function (s) {
    return '700 ' + s + 'px "Barlow Condensed", sans-serif';
  });

  setFont(ctx, '700 ' + size + 'px "Barlow Condensed", sans-serif', "0.12em");
  ctx.fillText(club, left, ruleY / 2);

  ctx.fillStyle = GOLD;
  ctx.fillRect(0, ruleY, SIZE, 6);

  return ruleY;
}

/**
 * A small outlined tag, centered. Used for the showcase or tournament name.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} y - Middle of the tag.
 */
function drawTag(ctx, text, y) {
  setFont(ctx, '700 26px "Barlow", sans-serif', "0.18em");

  var w = ctx.measureText(text).width + 40;
  var h = 50;

  ctx.strokeStyle = "rgba(252,213,30,0.75)";
  ctx.lineWidth = 2;
  ctx.strokeRect((SIZE - w) / 2, y - h / 2, w, h);

  ctx.fillStyle = GOLD;
  ctx.textAlign = "center";
  ctx.fillText(text, SIZE / 2 + 9, y + 1);
}

/**
 * The VS or AT divider: the word in gold with a rule running out either side.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} word
 * @param {number} y
 */
function drawDivider(ctx, word, y) {
  var size = 58;
  var tracking = 0.18;

  setFont(ctx, '700 ' + size + 'px "Barlow Condensed", sans-serif', tracking + "em");

  // Letter spacing adds a gap after the last letter that measureText counts,
  // so centred tracked text drifts left by half of it. Take it off the width
  // used for the rules, and nudge the word back by the same half.
  var trail = size * tracking;
  var visible = Math.max(0, ctx.measureText(word).width - trail);
  var gap = visible / 2 + 42;

  ctx.fillStyle = GOLD;
  ctx.fillRect(PAD, y - 3, SIZE / 2 - gap - PAD, 5);
  ctx.fillRect(SIZE / 2 + gap, y - 3, SIZE - PAD - (SIZE / 2 + gap), 5);

  ctx.textAlign = "center";
  ctx.fillText(word, SIZE / 2 + trail / 2, y);
}

/**
 * Works out how a team name wants to be set, without drawing it.
 *
 * Layout has to be measured before anything is painted. The first version of
 * this file drew each name at a fixed y, and a name that wrapped to two lines
 * ran straight through the VS divider.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} name - Already uppercased.
 * @param {number} maxSize - Largest size to try.
 * @returns {{lines: string[], size: number, lineH: number, height: number}}
 */
function measureTeam(ctx, name, maxSize) {
  var inner = SIZE - PAD * 2;

  setFont(ctx, '700 ' + maxSize + 'px "Barlow Condensed", sans-serif', "0.01em");

  var lines = twoLines(ctx, name, inner);
  var size = maxSize;

  lines.forEach(function (l) {
    size = Math.min(
      size,
      fitSize(ctx, l, inner, maxSize, 40, function (s) {
        return '700 ' + s + 'px "Barlow Condensed", sans-serif';
      })
    );
  });

  var lineH = size * 0.92;

  return { lines: lines, size: size, lineH: lineH, height: lines.length * lineH };
}

/**
 * Paints a measured team name, from the top of its block down.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} m - A measureTeam result.
 * @param {number} top
 * @param {string} colour
 */
function paintTeam(ctx, m, top, colour) {
  setFont(ctx, '700 ' + m.size + 'px "Barlow Condensed", sans-serif', "0.01em");
  ctx.fillStyle = colour;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  m.lines.forEach(function (l, i) {
    ctx.fillText(l, SIZE / 2, top + m.lineH * (i + 0.5));
  });
}

/**
 * Sets the matchup between two y bounds: our name, the divider, theirs.
 *
 * Both names are stepped down together until the stack fits the space the
 * header and the foot slab leave. Stepping them together keeps the two teams
 * the same weight, which is the point of a matchup graphic.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} us - Our club, uppercased.
 * @param {string} them - The opponent, uppercased.
 * @param {string} word - "VS" or "AT".
 * @param {number} top - Highest y the stack may use.
 * @param {number} bottom - Lowest y the stack may use.
 */
function drawMatchup(ctx, us, them, word, top, bottom) {
  var room = bottom - top;
  var dividerH = 62;
  var gap = 34;
  var ourMax = 112;
  var theirMax = 126;
  var a;
  var b;
  var total;

  // Step down until it fits, or until shrinking further would not help.
  while (true) {
    a = measureTeam(ctx, us, ourMax);
    b = measureTeam(ctx, them, theirMax);
    total = a.height + b.height + dividerH + gap * 2;

    if (total <= room || ourMax <= 46) {
      break;
    }

    ourMax -= 6;
    theirMax -= 6;
  }

  var y = top + Math.max(0, (room - total) / 2);

  paintTeam(ctx, a, y, WHITE);
  y += a.height + gap;

  drawDivider(ctx, word, y + dividerH / 2);
  y += dividerH + gap;

  paintTeam(ctx, b, y, WHITE);
}

/**
 * The angled gold slab across the foot, and the when and where on it.
 *
 * The slope is the one piece of movement on the square. Straight edges
 * everywhere read as a table; one angle reads as a jersey stripe.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} g - The game.
 */
function drawFoot(ctx, g) {
  var leftY = 838;
  var rightY = 778;

  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.moveTo(0, leftY);
  ctx.lineTo(SIZE, rightY);
  ctx.lineTo(SIZE, SIZE);
  ctx.lineTo(0, SIZE);
  ctx.closePath();
  ctx.fill();

  var inner = SIZE - PAD * 2;

  ctx.fillStyle = NAVY;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  var dateText = longDate(g.date);
  var dateSize = fitSize(ctx, dateText, inner, 78, 34, function (s) {
    return '700 ' + s + 'px "Barlow Condensed", sans-serif';
  });

  setFont(ctx, '700 ' + dateSize + 'px "Barlow Condensed", sans-serif', "0.04em");
  ctx.fillText(dateText, SIZE / 2, 945);

  var detail = [g.time || "", g.rink || ""].filter(Boolean).join("  \u00b7  ").toUpperCase();

  if (!detail) {
    return;
  }

  var detailSize = fitSize(ctx, detail, inner, 44, 22, function (s) {
    return '600 ' + s + 'px "Chivo Mono", monospace';
  });

  setFont(ctx, '600 ' + detailSize + 'px "Chivo Mono", monospace', "0.02em");
  ctx.fillText(detail, SIZE / 2, 1022);
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
  var us = state.data.config.teamName || "";
  var atHome = g.home === us;
  var opponent = (atHome ? g.away : g.home) || "TBD";

  canvas.width = SIZE;
  canvas.height = SIZE;

  drawGround(ctx);
  drawHeader(ctx, crest, us.toUpperCase());

  if (g.event) {
    drawTag(ctx, g.event.toUpperCase(), 244);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = GOLD;
  setFont(ctx, '700 42px "Barlow", sans-serif', "0.38em");
  ctx.fillText("GAMEDAY", SIZE / 2 + 16, g.event ? 330 : 300);

  drawMatchup(
    ctx,
    us.toUpperCase(),
    opponent.toUpperCase(),
    atHome ? "VS" : "AT",
    g.event ? 390 : 356,
    762
  );

  drawFoot(ctx, g);
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
