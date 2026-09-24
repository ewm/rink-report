/**
 * Gameday template "Blueline": the photo on top, a club-color panel below.
 *
 * From 1a in the Claude Design file (Gameday Post.dc.html). The photo fades
 * into the panel; the panel carries the hype line, GAME DAY with DAY in
 * outline, the matchup, and a ruled row of date, puck drop and rink.
 */
import * as k from "./kit.js";

/** Side margin, as in the design. */
var PAD = 64;

/**
 * Sets the matchup line: "WINGS vs AMHERST", shrunk together to fit.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} card
 * @param {number} baseline
 */
function matchup(ctx, card, baseline) {
  var c = card.colors;
  var inner = k.W - PAD * 2;
  var big = 68;
  var gap = 22;
  var parts;
  var total;

  // Shrink the names and the vs word together until the line fits.
  while (true) {
    var small = Math.round(big * 0.7);

    parts = [
      { text: card.us, font: "800 " + big + "px " + k.BARLOW, ink: c.onMain },
      { text: card.vsWord, font: "600 " + small + "px " + k.BARLOW, ink: c.pop },
      { text: card.opponent, font: "800 " + big + "px " + k.BARLOW, ink: c.onMain }
    ];

    total = gap * 2;

    parts.forEach(function (p) {
      k.setFont(ctx, p.font);
      p.w = k.widthOf(ctx, p.text);
      total += p.w;
    });

    if (total <= inner || big <= 36) {
      break;
    }

    big -= 2;
  }

  var x = PAD;

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  parts.forEach(function (p) {
    k.setFont(ctx, p.font);
    ctx.fillStyle = p.ink;
    ctx.fillText(k.clip(ctx, p.text, PAD + inner - x), x, baseline);
    x += p.w + gap;
  });
}

/**
 * The ruled row along the foot: DATE | PUCK DROP | RINK.
 *
 * The rink takes whatever width is left and is cut with an ellipsis, the
 * way the design does it.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} card
 * @param {number} baseline - Baseline of the values.
 * @returns {number} Where the gold rule above the row sits.
 */
function infoRow(ctx, card, baseline) {
  var c = card.colors;
  var cols = [{ label: "DATE", value: card.date }, { label: "PUCK DROP", value: card.time }];

  if (card.rink) {
    cols.push({ label: "RINK", value: card.rink });
  }

  var valueFont = "700 48px " + k.BARLOW;
  var labelFont = "700 26px " + k.BARLOW;

  k.setFont(ctx, valueFont);

  var valueCap = k.capOf(ctx);

  k.setFont(ctx, labelFont, 4);

  var labelCap = k.capOf(ctx);
  var labelBase = baseline - valueCap - 18;
  var ruleY = labelBase - labelCap - 28;
  var x = PAD;
  var right = k.W - PAD;
  var sep = 44;

  ctx.fillStyle = c.pop;
  ctx.fillRect(PAD, ruleY, right - PAD, 4);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  cols.forEach(function (col, i) {
    var last = i === cols.length - 1;

    k.setFont(ctx, valueFont);

    var w = k.widthOf(ctx, col.value);

    k.setFont(ctx, labelFont, 4);
    w = Math.max(w, k.widthOf(ctx, col.label, 4));

    if (i > 0) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = c.pop;
      ctx.fillRect(x, ruleY + 26, 2, baseline - ruleY - 20);
      ctx.restore();
      x += sep;
    }

    var room = last ? right - x : w;

    ctx.fillStyle = c.pop;
    ctx.fillText(col.label, x, labelBase);

    k.setFont(ctx, valueFont);
    ctx.fillStyle = c.onMain;
    ctx.fillText(k.clip(ctx, col.value, room), x, baseline);

    x += w + sep;
  });

  return ruleY;
}

/**
 * Draws the Blueline post.
 *
 * Laid out from the foot up, because the panel's height depends on how
 * many lines the hype line takes; the photo gets what is left.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} card - See postcard.js cardFor().
 */
function draw(ctx, card) {
  var c = card.colors;
  var H = card.h;
  var inner = k.W - PAD * 2;

  ctx.fillStyle = c.main;
  ctx.fillRect(0, 0, k.W, H);

  // Measure the panel from the bottom up.
  var ruleY = infoRow(ctx, card, H - 72);

  // The info row is drawn again after the photo; this pass only measured it.
  k.setFont(ctx, "800 68px " + k.BARLOW);

  var matchBase = ruleY - 34;
  var matchCap = k.capOf(ctx);

  k.setFont(ctx, "400 250px " + k.ANTON);

  var gameCap = k.capOf(ctx);
  var gameBase = matchBase - matchCap - 40;
  var panelTop = gameBase - gameCap;
  var quote = null;
  var quoteBase = 0;

  if (card.quote) {
    quote = k.fitLines(ctx, card.quote, inner, 3, 60, 34, function (s) {
      return "italic 800 " + s + "px " + k.BARLOW;
    });

    k.setFont(ctx, "italic 800 " + quote.size + "px " + k.BARLOW);

    var qCap = k.capOf(ctx);
    var lead = quote.size;

    quoteBase = panelTop - 36;
    panelTop = quoteBase - lead * (quote.lines.length - 1) - qCap;
  }

  // The photo runs down behind the top of the panel and fades into it.
  var photoH = Math.max(160, panelTop + 40);

  k.photoArea(ctx, card, 0, 0, k.W, photoH, 0.55);

  var fadeTop = photoH * 0.55;
  var fade = ctx.createLinearGradient(0, fadeTop, 0, photoH);

  // "#RRGGBB00" is the main color at no opacity, so the fade has no grey cast.
  fade.addColorStop(0, c.main + "00");
  fade.addColorStop(1, c.main);
  ctx.fillStyle = fade;
  ctx.fillRect(0, fadeTop, k.W, photoH - fadeTop + 1);

  ctx.fillStyle = c.main;
  ctx.fillRect(0, photoH, k.W, H - photoH);

  // The top of the square: the home or away tag, and the crest.
  var crestW = 300;

  k.chip(ctx, card.label, {
    x: PAD,
    y: 56,
    size: 36,
    spacing: 4,
    padX: 26,
    padY: 18,
    maxWidth: k.W - PAD - crestW - 48 - 32,
    fill: c.accent,
    ink: c.onAccent
  });

  k.crest(ctx, card.crest, k.W - 48 - crestW, 40, crestW, true);

  // The panel.
  if (quote) {
    k.setFont(ctx, "italic 800 " + quote.size + "px " + k.BARLOW);
    ctx.fillStyle = c.onMain;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    quote.lines.forEach(function (l, i) {
      ctx.fillText(l, PAD, quoteBase - quote.size * (quote.lines.length - 1 - i));
    });
  }

  k.setFont(ctx, "400 250px " + k.ANTON);
  ctx.textAlign = "left";
  ctx.fillStyle = c.pop;
  ctx.fillText("GAME", PAD, gameBase);

  var dayX = PAD + k.widthOf(ctx, "GAME") + 28;

  ctx.strokeStyle = c.onMain;
  ctx.lineWidth = 5;
  ctx.lineJoin = "round";
  ctx.strokeText("DAY", dayX, gameBase);

  matchup(ctx, card, matchBase);
  infoRow(ctx, card, H - 72);
}

export default {
  key: "blueline",
  name: "Blueline",
  draw: draw
};
