/**
 * Shared drawing tools for the gameday post templates.
 *
 * Each template (blueline.js, echo.js, faceoff.js) draws one design onto a
 * canvas. What they have in common lives here: the sizes, the club colors,
 * fitting type to a width, painting the photo, the crest and the chips.
 * See ARCHITECTURE.md, "Gameday post card".
 */

/** Every template is 1080 wide. These are the heights Instagram takes. */
var SIZES = {
  feed: { label: "Feed 4:5", h: 1350 },
  square: { label: "Square", h: 1080 },
  story: { label: "Story 9:16", h: 1920 }
};

/** Canvas width, whatever the size. */
var W = 1080;

/** The display face on every template. */
var ANTON = '"Anton", "Barlow Condensed", "Arial Narrow", sans-serif';

/** The text face on every template. */
var BARLOW = '"Barlow Condensed", "Arial Narrow", sans-serif';

/**
 * Mixes two hex colors.
 *
 * @param {string} a - "#RRGGBB".
 * @param {string} b - "#RRGGBB".
 * @param {number} t - 0 is all a, 1 is all b.
 * @returns {string} "#RRGGBB".
 */
function mix(a, b, t) {
  var pa = parseInt(a.slice(1), 16);
  var pb = parseInt(b.slice(1), 16);
  var out = 0;

  [16, 8, 0].forEach(function (shift) {
    var ca = (pa >> shift) & 255;
    var cb = (pb >> shift) & 255;

    out += Math.round(ca + (cb - ca) * t) << shift;
  });

  return "#" + (out + 0x1000000).toString(16).slice(1).toUpperCase();
}

/**
 * The colors a post is drawn in.
 *
 * They come from the club's two colors in teams.js, worked out by theme.js
 * (window.CHECK_THE_RINK_CLUB.card). Without a club the Wings' navy and gold
 * stand in.
 *
 * main     the club's main color, the dark ground
 * accent   the second color, for bands and chips
 * onAccent type set on the accent
 * onMain   type set on the main color (white on the Wings)
 * pop      the accent where it is legible on the main color
 * tint     a lighter main, laid over photos so they sit in club colors
 *
 * @returns {Object}
 */
function colors() {
  var club = window.CHECK_THE_RINK_CLUB;
  var c = club && club.card;

  var main = c ? c.ground : "#003087";

  return {
    main: main,
    accent: c ? c.band : "#FCD51E",
    onAccent: c ? c.onBand : "#003087",
    onMain: c ? c.onGround : "#FFFFFF",
    pop: c ? c.accentOnGround : "#FCD51E",
    tint: mix(main, "#FFFFFF", 0.14)
  };
}

/**
 * Sets a font, with letter spacing where the browser has it.
 *
 * ctx.letterSpacing is recent. Where it is missing the type sits a little
 * tighter, which beats not drawing.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} font - CSS font shorthand.
 * @param {number} [spacing] - Letter spacing in px.
 */
function setFont(ctx, font, spacing) {
  ctx.font = font;

  try {
    ctx.letterSpacing = (spacing || 0) + "px";
  } catch (e) {}
}

/**
 * Width of a line of text in the current font.
 *
 * Letter spacing adds a trailing gap after the last letter. It is taken off
 * here so right and centered type lines up with its box.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} [spacing] - The letter spacing the font was set with.
 * @returns {number}
 */
function widthOf(ctx, text, spacing) {
  return ctx.measureText(text).width - (spacing || 0);
}

/**
 * Height of capital letters in the current font.
 *
 * All the type on a post is capitals, so layout works from cap height, not
 * the font size. That keeps gaps looking the same across faces.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @returns {number}
 */
function capOf(ctx) {
  var m = ctx.measureText("H");

  return m.actualBoundingBoxAscent || parseFloat(ctx.font) * 0.7;
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
 * @param {number} [spacing] - Letter spacing in px.
 * @returns {number}
 */
function fitSize(ctx, text, maxWidth, start, min, fontAt, spacing) {
  var size = start;

  while (size > min) {
    setFont(ctx, fontAt(size), spacing);

    if (widthOf(ctx, text, spacing) <= maxWidth) {
      return size;
    }

    size -= 2;
  }

  setFont(ctx, fontAt(min), spacing);

  return min;
}

/**
 * Cuts text to fit a width, ending in an ellipsis.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} maxWidth
 * @returns {string}
 */
function clip(ctx, text, maxWidth) {
  if (widthOf(ctx, text) <= maxWidth) {
    return text;
  }

  var cut = text;

  while (cut.length > 1 && widthOf(ctx, cut + "…") > maxWidth) {
    cut = cut.slice(0, -1);
  }

  return cut.trim() + "…";
}

/**
 * Breaks text into lines that fit a width, as evenly as it can.
 *
 * Two lines are split where their widths come out closest, which is what
 * CSS text-wrap: balance does in the design file. Past two, it fills
 * greedily.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} maxWidth
 * @param {number} maxLines
 * @returns {string[]|null} The lines, or null when it will not fit.
 */
function lines(ctx, text, maxWidth, maxLines) {
  var words = text.split(/\s+/).filter(Boolean);

  if (widthOf(ctx, text) <= maxWidth) {
    return [text];
  }

  if (maxLines < 2 || words.length < 2) {
    return null;
  }

  var best = null;
  var bestGap = Infinity;

  for (var i = 1; i < words.length; i++) {
    var a = words.slice(0, i).join(" ");
    var b = words.slice(i).join(" ");
    var wa = widthOf(ctx, a);
    var wb = widthOf(ctx, b);

    if (wa <= maxWidth && wb <= maxWidth && Math.abs(wa - wb) < bestGap) {
      bestGap = Math.abs(wa - wb);
      best = [a, b];
    }
  }

  if (best) {
    return best;
  }

  if (maxLines < 3) {
    return null;
  }

  var out = [];
  var line = "";

  words.forEach(function (w) {
    var next = line ? line + " " + w : w;

    if (widthOf(ctx, next) <= maxWidth || !line) {
      line = next;
    } else {
      out.push(line);
      line = w;
    }
  });

  out.push(line);

  var fits = out.every(function (l) {
    return widthOf(ctx, l) <= maxWidth;
  });

  return fits && out.length <= maxLines ? out : null;
}

/**
 * Finds a size where text breaks into at most maxLines lines of maxWidth.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} maxWidth
 * @param {number} maxLines
 * @param {number} start - Size to try first.
 * @param {number} min - Smallest size worth trying.
 * @param {Function} fontAt - size -> CSS font shorthand.
 * @returns {{size: number, lines: string[]}}
 */
function fitLines(ctx, text, maxWidth, maxLines, start, min, fontAt) {
  var size = start;

  while (size >= min) {
    setFont(ctx, fontAt(size));

    var got = lines(ctx, text, maxWidth, maxLines);

    if (got) {
      return { size: size, lines: got };
    }

    size -= 2;
  }

  setFont(ctx, fontAt(min));

  return { size: min, lines: [clip(ctx, text, maxWidth)] };
}

/**
 * Paints an image to cover a box, cropped from the middle.
 *
 * The same thing CSS object-fit: cover does.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLImageElement} img
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 */
function cover(ctx, img, x, y, w, h) {
  var iw = img.naturalWidth || img.width;
  var ih = img.naturalHeight || img.height;
  var scale = Math.max(w / iw, h / ih);
  var sw = w / scale;
  var sh = h / scale;

  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
}

/**
 * Paints the photo area: the chosen photo tinted to the club, or a
 * hatched block of club color when there is no photo.
 *
 * The hatch is there so an empty photo area still reads as designed rather
 * than as a gap.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} card - What to draw; see postcard.js cardFor().
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number} tintAlpha - How strong the club tint is over a photo.
 */
function photoArea(ctx, card, x, y, w, h, tintAlpha) {
  var c = card.colors;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  if (card.photo) {
    cover(ctx, card.photo, x, y, w, h);

    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = tintAlpha;
    ctx.fillStyle = c.tint;
    ctx.fillRect(x, y, w, h);
  } else {
    ctx.fillStyle = c.tint;
    ctx.fillRect(x, y, w, h);

    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 3;

    for (var i = -h; i < w + h; i += 30) {
      ctx.beginPath();
      ctx.moveTo(x + i, y);
      ctx.lineTo(x + i + h, y + h);
      ctx.stroke();
    }
  }

  ctx.restore();
}

/**
 * Draws the crest at a width, with a soft shadow under it.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLImageElement|null} img
 * @param {number} x - Left edge.
 * @param {number} y - Top edge.
 * @param {number} w - Width; the height follows the image.
 * @param {boolean} shadow
 * @returns {number} The height drawn, 0 without a crest.
 */
function crest(ctx, img, x, y, w, shadow) {
  if (!img || !img.naturalWidth) {
    return 0;
  }

  var h = (img.naturalHeight / img.naturalWidth) * w;

  ctx.save();

  if (shadow) {
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;
  }

  ctx.drawImage(img, x, y, w, h);
  ctx.restore();

  return h;
}

/**
 * A filled chip with one line of type in it: the Home game tag.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {Object} o - {x, y, align ("left"|"right"), size, spacing,
 *                      padX, padY, maxWidth, fill, ink}
 * @returns {{w: number, h: number}}
 */
function chip(ctx, text, o) {
  var size = fitSize(ctx, text, o.maxWidth - o.padX * 2, o.size, 20, function (s) {
    return "800 " + s + "px " + BARLOW;
  }, o.spacing);

  var cap = capOf(ctx);
  var w = widthOf(ctx, text, o.spacing) + o.padX * 2;
  var h = cap + o.padY * 2;
  var left = o.align === "right" ? o.x - w : o.x;

  ctx.fillStyle = o.fill;
  ctx.fillRect(left, o.y, w, h);

  ctx.fillStyle = o.ink;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, left + o.padX, o.y + o.padY + cap);

  return { w: w, h: h, size: size };
}

/**
 * A tilted quote block: the hype line set on a solid box.
 *
 * Measured first, then drawn rotated about its own middle, so the caller
 * can place it by its unrotated box.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {Object} o - {size, maxWidth, padX, padY, fill, ink, degrees,
 *                      align ("left"|"right"), shadow}
 * @returns {{w: number, h: number, paint: Function}} paint(x, y) draws it
 *          with its top-left (or top-right, for align right) at x, y.
 */
function quoteBox(ctx, text, o) {
  var fontAt = function (s) {
    return "italic 800 " + s + "px " + BARLOW;
  };

  var fit = fitLines(ctx, text, o.maxWidth - o.padX * 2, 3, o.size, 28, fontAt);

  setFont(ctx, fontAt(fit.size));

  var cap = capOf(ctx);
  var lead = fit.size * 1.05;
  var textW = 0;

  fit.lines.forEach(function (l) {
    textW = Math.max(textW, widthOf(ctx, l));
  });

  var w = textW + o.padX * 2;
  var h = cap + lead * (fit.lines.length - 1) + o.padY * 2 + fit.size * 0.1;

  return {
    w: w,
    h: h,
    paint: function (x, y) {
      var left = o.align === "right" ? x - w : x;

      ctx.save();
      ctx.translate(left + w / 2, y + h / 2);
      ctx.rotate((o.degrees * Math.PI) / 180);

      if (o.shadow) {
        ctx.shadowColor = "rgba(0,0,0,0.35)";
        ctx.shadowBlur = 30;
        ctx.shadowOffsetY = 10;
      }

      ctx.fillStyle = o.fill;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.shadowColor = "transparent";

      setFont(ctx, fontAt(fit.size));
      ctx.fillStyle = o.ink;
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = o.align === "right" ? "right" : "left";

      var tx = o.align === "right" ? w / 2 - o.padX : -w / 2 + o.padX;

      fit.lines.forEach(function (l, i) {
        ctx.fillText(l, tx, -h / 2 + o.padY + cap + lead * i);
      });

      ctx.restore();
    }
  };
}

/**
 * A small diamond, the separator between the when and the where.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} side
 * @param {string} fill
 */
function diamond(ctx, cx, cy, side, fill) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = fill;
  ctx.fillRect(-side / 2, -side / 2, side, side);
  ctx.restore();
}

/**
 * Sets a row of text runs on one baseline, with a diamond between each run.
 * Shrinks the whole row until it fits.
 *
 * Pass o.x to set the row from a left edge, or o.cx to center it.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{text: string, ink: string}>} runs
 * @param {Object} o - {x or cx, baseline, size, maxWidth, gap, dot, dotInk, weight}
 */
function dotRow(ctx, runs, o) {
  var size = o.size;
  var total;
  var fontAt = function (s) {
    return (o.weight || 700) + " " + s + "px " + BARLOW;
  };

  while (true) {
    setFont(ctx, fontAt(size), 1);
    total = 0;

    runs.forEach(function (r, i) {
      total += widthOf(ctx, r.text, 1);

      if (i > 0) {
        total += o.gap * 2 + o.dot;
      }
    });

    if (total <= o.maxWidth || size <= 22) {
      break;
    }

    size -= 2;
  }

  var cap = capOf(ctx);
  var start = o.x !== undefined ? o.x : o.cx - Math.min(total, o.maxWidth) / 2;
  var end = start + o.maxWidth;
  var x = start;

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  runs.forEach(function (r, i) {
    if (i > 0) {
      diamond(ctx, x + o.gap + o.dot / 2, o.baseline - cap / 2, o.dot, o.dotInk);
      x += o.gap * 2 + o.dot;
    }

    var room = (o.x !== undefined ? end : o.cx + o.maxWidth / 2) - x;
    var text = clip(ctx, r.text, room);

    ctx.fillStyle = r.ink;
    ctx.fillText(text, x, o.baseline);
    x += widthOf(ctx, text, 1);
  });
}

export {
  SIZES,
  W,
  ANTON,
  BARLOW,
  colors,
  mix,
  setFont,
  widthOf,
  capOf,
  fitSize,
  fitLines,
  clip,
  cover,
  photoArea,
  crest,
  chip,
  quoteBox,
  diamond,
  dotRow
};
