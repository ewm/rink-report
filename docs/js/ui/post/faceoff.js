/**
 * Gameday template "Faceoff": an accent-color card built around the matchup.
 *
 * From 1c in the Claude Design file (Gameday Post.dc.html). Crest and tag
 * across the top, GAME DAY centered, the photo in a slanted band, then the
 * two teams either side of a round vs badge and a club-color strip with the
 * date, puck drop and rink.
 */
import * as k from "./kit.js";

/** Side margin, as in the design. */
var PAD = 64;

/** The vs badge's diameter. */
var BADGE = 110;

/**
 * Measures one side of the matchup: a team name in Anton, one or two lines.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} name
 * @param {number} maxWidth
 * @param {number} size - Size to start from.
 * @returns {{size: number, lines: string[], height: number}}
 */
function side(ctx, name, maxWidth, size) {
  var fit = k.fitLines(ctx, name, maxWidth, 2, size, 40, function (s) {
    return "400 " + s + "px " + k.ANTON;
  });

  k.setFont(ctx, "400 " + fit.size + "px " + k.ANTON);

  var cap = k.capOf(ctx);

  return {
    size: fit.size,
    lines: fit.lines,
    cap: cap,
    lead: fit.size,
    height: cap + fit.size * (fit.lines.length - 1)
  };
}

/**
 * Paints a measured side, its block centered on cy.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} m - From side().
 * @param {number} x - The edge the text is aligned to.
 * @param {number} cy - Vertical middle of the matchup row.
 * @param {string} align - "left" or "right".
 * @param {string} ink
 */
function paintSide(ctx, m, x, cy, align, ink) {
  k.setFont(ctx, "400 " + m.size + "px " + k.ANTON);
  ctx.fillStyle = ink;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";

  var top = cy - m.height / 2;

  m.lines.forEach(function (l, i) {
    ctx.fillText(l, x, top + m.cap + m.lead * i);
  });
}

/**
 * Draws the Faceoff post.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} card - See postcard.js cardFor().
 */
function draw(ctx, card) {
  var c = card.colors;
  var H = card.h;

  ctx.fillStyle = c.accent;
  ctx.fillRect(0, 0, k.W, H);

  // Top row: crest on the left, the home or away tag on the right.
  var crestH = k.crest(ctx, card.crest, PAD, 48, 230, false);
  var rowH = Math.max(crestH, 70);

  k.setFont(ctx, "800 34px " + k.BARLOW, 5);

  var tagH = k.capOf(ctx) + 36;

  k.chip(ctx, card.label, {
    x: k.W - PAD,
    y: 48 + (rowH - tagH) / 2,
    align: "right",
    size: 34,
    spacing: 5,
    padX: 26,
    padY: 18,
    maxWidth: k.W - PAD * 2 - (crestH ? 230 + 32 : 0),
    fill: c.main,
    ink: c.pop
  });

  // GAME DAY, centered under the top row.
  var gdSize = k.fitSize(ctx, "GAME DAY", k.W - PAD * 2, 258, 120, function (s) {
    return "400 " + s + "px " + k.ANTON;
  }, 2);

  var gdCap = k.capOf(ctx);
  var gdBase = 48 + rowH + 36 + gdCap;

  ctx.fillStyle = c.main;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("GAME DAY", k.W / 2 + 1, gdBase);

  // The strip across the foot: date, puck drop, rink.
  k.setFont(ctx, "700 42px " + k.BARLOW, 1);

  var stripCap = k.capOf(ctx);
  var stripH = stripCap + 60;
  var stripTop = H - stripH;

  ctx.fillStyle = c.main;
  ctx.fillRect(0, stripTop, k.W, stripH);

  var runs = [{ text: card.date, ink: c.pop }];

  if (card.time) {
    runs.push({ text: card.time, ink: c.onMain });
  }

  if (card.rink) {
    runs.push({ text: card.rink, ink: c.onMain });
  }

  k.dotRow(ctx, runs, {
    cx: k.W / 2,
    baseline: stripTop + 30 + stripCap,
    size: 42,
    maxWidth: k.W - PAD * 2,
    gap: 30,
    dot: 12,
    dotInk: c.pop
  });

  // The matchup row, sitting on the strip.
  var colW = (k.W - PAD * 2 - BADGE - 56) / 2;
  var us = side(ctx, card.us, colW, 78);
  var them = side(ctx, card.opponent, colW, 78);
  var size = Math.min(us.size, them.size);

  // Both names at the same size, so neither team looks like the lesser one.
  us = side(ctx, card.us, colW, size);
  them = side(ctx, card.opponent, colW, size);

  var rowInner = Math.max(BADGE, us.height, them.height);
  var matchBottom = stripTop - 36;
  var matchTop = matchBottom - rowInner;
  var cy = matchTop + rowInner / 2;

  paintSide(ctx, us, k.W / 2 - BADGE / 2 - 28, cy, "right", c.main);
  paintSide(ctx, them, k.W / 2 + BADGE / 2 + 28, cy, "left", c.main);

  ctx.fillStyle = c.main;
  ctx.beginPath();
  ctx.arc(k.W / 2, cy, BADGE / 2, 0, Math.PI * 2);
  ctx.fill();

  k.setFont(ctx, "800 48px " + k.BARLOW);
  ctx.fillStyle = c.pop;
  ctx.textAlign = "center";
  ctx.fillText(card.vsWord, k.W / 2, cy + k.capOf(ctx) / 2);

  // The photo, in a slanted band between GAME DAY and the matchup.
  var photoTop = gdBase + 28;
  var photoBottom = matchTop - 28;
  var ph = Math.max(80, photoBottom - photoTop);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, photoTop + ph * 0.12);
  ctx.lineTo(k.W, photoTop);
  ctx.lineTo(k.W, photoTop + ph * 0.88);
  ctx.lineTo(0, photoTop + ph);
  ctx.closePath();
  ctx.clip();

  ctx.fillStyle = c.main;
  ctx.fillRect(0, photoTop, k.W, ph);
  k.photoArea(ctx, card, 0, photoTop, k.W, ph, 0.45);
  ctx.restore();

  if (card.quote) {
    var q = k.quoteBox(ctx, card.quote, {
      size: 50,
      maxWidth: 760,
      padX: 28,
      padY: 18,
      fill: c.main,
      ink: c.pop,
      degrees: -3,
      align: "right",
      shadow: true
    });

    q.paint(k.W - 56, photoTop + 36);
  }
}

export default {
  key: "faceoff",
  name: "Faceoff",
  draw: draw
};
