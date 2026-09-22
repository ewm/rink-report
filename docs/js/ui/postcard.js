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
import { countdownText, daysUntil, dateObj } from "../util/dates.js";

/** The square Instagram wants. Everything below is in these pixels. */
var SIZE = 1080;

/** Page margin. The gold bands run full width; type stays inside this. */
var PAD = 84;

/*
 * The card's colors. They start as the Wings' and are swapped for the
 * team's club colors (from theme.js, via teams.js) each time a card is
 * drawn. GROUND is the square, BAND the stripes and diamond, ON_BAND the
 * type set on a stripe, ON_GROUND the team names, ACCENT_ON_GROUND the
 * club name and event tag set straight on the square.
 */
var GROUND = "#003087";
var BAND = "#FCD51E";
var ON_BAND = "#003087";
var ON_GROUND = "#FFFFFF";
var ACCENT_ON_GROUND = "#FCD51E";

/**
 * Picks up this team's club colors, when theme.js found the team in
 * teams.js. Otherwise the card keeps the Wings' navy and gold.
 */
function useClubColors() {
  var club = window.ONE_TIMER_CLUB;

  if (!club || !club.card) {
    return;
  }

  GROUND = club.card.ground;
  BAND = club.card.band;
  ON_BAND = club.card.onBand;
  ON_GROUND = club.card.onGround;
  ACCENT_ON_GROUND = club.card.accentOnGround;
}

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
  ctx.fillStyle = GROUND;
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
 * @returns {number} Where the header ends, which is where the bar starts.
 */
function drawHeader(ctx, crest, club) {
  var ruleY = 176;
  var left = PAD;

  if (crest && crest.naturalWidth) {
    var h = 108;
    var w = (crest.naturalWidth / crest.naturalHeight) * h;

    ctx.drawImage(crest, PAD, (ruleY - h) / 2, w, h);
    left = PAD + w + 30;
  }

  ctx.fillStyle = ACCENT_ON_GROUND;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  var size = fitSize(ctx, club, SIZE - left - PAD, 54, 24, function (s) {
    return '700 ' + s + 'px "Barlow Condensed", sans-serif';
  });

  setFont(ctx, '700 ' + size + 'px "Barlow Condensed", sans-serif', "0.12em");
  ctx.fillText(club, left, ruleY / 2);

  return ruleY;
}

/**
 * The line across the top of the hype bar.
 *
 * "GAMEDAY TODAY" reads badly, and "GAMEDAY" on its own is wrong for a game
 * three weeks out, so the wording follows how far off the game is.
 *
 * @param {Object} g - The game.
 * @returns {string}
 */
function hypeText(g) {
  var n = daysUntil(g.date);

  if (n === null || n < 0 || n === 0) {
    return "GAMEDAY";
  }

  if (n === 1) {
    return "GAMEDAY TOMORROW";
  }

  return "GAMEDAY " + countdownText(g.date);
}

/**
 * The sheared gold bar under the header, carrying the hype line.
 *
 * Full bleed and tilted. A level band would just be a second header; the
 * tilt is what makes the square read as a poster instead of a notice.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @returns {number} The lowest y the bar reaches.
 */
function drawHypeBar(ctx, text) {
  var lift = 26;
  var top = 176;
  var height = 124;

  ctx.fillStyle = BAND;
  ctx.beginPath();
  ctx.moveTo(0, top);
  ctx.lineTo(SIZE, top - lift);
  ctx.lineTo(SIZE, top - lift + height);
  ctx.lineTo(0, top + height);
  ctx.closePath();
  ctx.fill();

  var size = fitSize(ctx, text, SIZE - PAD * 2, 76, 34, function (s) {
    return '700 ' + s + 'px "Barlow Condensed", sans-serif';
  });
  var tracking = 0.16;

  setFont(ctx, '700 ' + size + 'px "Barlow Condensed", sans-serif', tracking + "em");
  ctx.fillStyle = ON_BAND;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, SIZE / 2 + (size * tracking) / 2, top + height / 2 - lift / 2);

  return top + height;
}

/**
 * A small outlined tag, centered. Used for the showcase or tournament name.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} y - Middle of the tag.
 */
function drawTag(ctx, text, y) {
  var tracking = 0.18;

  setFont(ctx, '700 26px "Barlow", sans-serif', tracking + "em");

  var trail = 26 * tracking;
  var w = ctx.measureText(text).width - trail + 44;
  var h = 50;

  ctx.save();
  ctx.globalAlpha = 0.8;
  ctx.strokeStyle = BAND;
  ctx.lineWidth = 2;
  ctx.strokeRect((SIZE - w) / 2, y - h / 2, w, h);
  ctx.restore();

  ctx.fillStyle = ACCENT_ON_GROUND;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, SIZE / 2 + trail / 2, y + 1);
}

/** How tall drawDivider draws, for the layout to budget with. */
var DIVIDER_H = 156;

/**
 * The VS or AT divider: a gold diamond between two rules.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} word
 * @param {number} y - Middle of the diamond.
 */
function drawDivider(ctx, word, y) {
  var half = 55;
  var reach = half * Math.SQRT2 + 30;

  ctx.fillStyle = BAND;
  ctx.fillRect(PAD, y - 3, SIZE / 2 - reach - PAD, 6);
  ctx.fillRect(SIZE / 2 + reach, y - 3, SIZE - PAD - (SIZE / 2 + reach), 6);

  ctx.save();
  ctx.translate(SIZE / 2, y);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = BAND;
  ctx.fillRect(-half, -half, half * 2, half * 2);
  ctx.restore();

  var size = 62;
  var tracking = 0.1;

  setFont(ctx, '700 ' + size + 'px "Barlow Condensed", sans-serif', tracking + "em");
  ctx.fillStyle = ON_BAND;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(word, SIZE / 2 + (size * tracking) / 2, y + 2);
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
  var dividerH = DIVIDER_H;
  var gap = 26;
  var ourMax = 116;
  var theirMax = 132;
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

  paintTeam(ctx, a, y, ON_GROUND);
  y += a.height + gap;

  drawDivider(ctx, word, y + dividerH / 2);
  y += dividerH + gap;

  paintTeam(ctx, b, y, ON_GROUND);
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

  ctx.fillStyle = BAND;
  ctx.beginPath();
  ctx.moveTo(0, leftY);
  ctx.lineTo(SIZE, rightY);
  ctx.lineTo(SIZE, SIZE);
  ctx.lineTo(0, SIZE);
  ctx.closePath();
  ctx.fill();

  var inner = SIZE - PAD * 2;

  ctx.fillStyle = ON_BAND;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  var dateText = longDate(g.date);
  var dateSize = fitSize(ctx, dateText, inner, 78, 34, function (s) {
    return '700 ' + s + 'px "Barlow Condensed", sans-serif';
  });

  setFont(ctx, '700 ' + dateSize + 'px "Barlow Condensed", sans-serif', "0.04em");
  ctx.fillText(dateText, SIZE / 2, 945);

  var bits = [];

  if (g.time) {
    bits.push("PUCK DROP " + g.time);
  }

  if (g.rink) {
    bits.push(g.rink);
  }

  var detail = bits.join("  \u00b7  ").toUpperCase();

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

  useClubColors();
  drawGround(ctx);
  drawHeader(ctx, crest, us.toUpperCase());

  var barBottom = drawHypeBar(ctx, hypeText(g));
  var heroTop = barBottom + 34;

  if (g.event) {
    drawTag(ctx, g.event.toUpperCase(), barBottom + 54);
    heroTop = barBottom + 108;
  }

  drawMatchup(ctx, us.toUpperCase(), opponent.toUpperCase(), atHome ? "VS" : "AT", heroTop, 766);

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
