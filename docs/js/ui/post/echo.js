/**
 * Gameday template "Echo": a full-bleed photo with GAME DAY stacked on it.
 *
 * From 1b in the Claude Design file (Gameday Post.dc.html). GAME DAY is set
 * huge with two faint outline copies behind it, the hype line sits on a
 * tilted white strip, and an accent-color bar across the foot carries the
 * matchup, the puck drop and the rink.
 */
import * as k from "./kit.js";

/** Side margin, as in the design. */
var PAD = 64;

/**
 * The accent bar across the foot, drawn from the bottom edge up.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} card
 * @returns {number} Top of the bar.
 */
function footBar(ctx, card) {
  var c = card.colors;
  var H = card.h;
  var inner = k.W - PAD * 2;

  var detail = [card.time ? "PUCK DROP " + card.time : "", card.rink].filter(Boolean);

  k.setFont(ctx, "700 40px " + k.BARLOW, 1);

  var detailCap = k.capOf(ctx);
  var detailBase = H - 48;

  // The matchup: both names in Anton, the vs word smaller in Barlow.
  var big = 84;
  var gap = 20;
  var parts;
  var total;

  while (true) {
    parts = [
      { text: card.us, font: "400 " + big + "px " + k.ANTON },
      { text: card.vsWord, font: "700 " + Math.round(big * 0.62) + "px " + k.BARLOW },
      { text: card.opponent, font: "400 " + big + "px " + k.ANTON }
    ];

    total = gap * 2;

    parts.forEach(function (p) {
      k.setFont(ctx, p.font);
      p.w = k.widthOf(ctx, p.text);
      total += p.w;
    });

    if (total <= inner || big <= 40) {
      break;
    }

    big -= 2;
  }

  k.setFont(ctx, parts[0].font);

  var matchCap = k.capOf(ctx);
  var matchBase = detailBase - detailCap - 26;
  var top = matchBase - matchCap - 40;

  ctx.fillStyle = c.accent;
  ctx.fillRect(0, top, k.W, H - top);

  var x = PAD;

  ctx.fillStyle = c.onAccent;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  parts.forEach(function (p) {
    k.setFont(ctx, p.font);
    ctx.fillText(k.clip(ctx, p.text, PAD + inner - x), x, matchBase);
    x += p.w + gap;
  });

  if (detail.length) {
    k.dotRow(
      ctx,
      detail.map(function (d) {
        return { text: d, ink: c.onAccent };
      }),
      {
        x: PAD,
        baseline: detailBase,
        size: 40,
        maxWidth: inner,
        gap: 28,
        dot: 12,
        dotInk: c.onAccent
      }
    );
  }

  return top;
}

/**
 * Draws the Echo post.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} card - See postcard.js cardFor().
 */
function draw(ctx, card) {
  var c = card.colors;
  var H = card.h;

  k.photoArea(ctx, card, 0, 0, k.W, H, 0.7);

  // Darkens the left side so the type reads over any photo.
  var shade = ctx.createLinearGradient(0, 0, k.W, 0);

  shade.addColorStop(0, c.main + "D9");
  shade.addColorStop(0.6, c.main + "33");
  shade.addColorStop(1, c.main + "00");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, k.W, H);

  var barTop = footBar(ctx, card);

  // Top row: the home or away tag and the date, the crest on the right.
  var crestW = 280;
  var crestH = k.crest(ctx, card.crest, k.W - PAD - crestW, PAD, crestW, true);

  k.setFont(ctx, "800 40px " + k.BARLOW, 6);

  var tagCap = k.capOf(ctx);
  var room = k.W - PAD * 2 - crestW - 32;

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = c.pop;
  ctx.fillText(k.clip(ctx, card.label, room), PAD, PAD + tagCap);
  ctx.fillStyle = c.onMain;
  ctx.fillText(k.clip(ctx, card.date, room), PAD, PAD + tagCap * 2 + 22);

  var headBottom = Math.max(PAD + crestH, PAD + tagCap * 2 + 22);

  // GAME / DAY, stacked, sized off the height like the design's 24cqh.
  var size = Math.min(300, Math.round(H * 0.24));
  var quote = null;

  if (card.quote) {
    quote = k.quoteBox(ctx, card.quote, {
      size: 54,
      maxWidth: 900,
      padX: 28,
      padY: 20,
      fill: "#FFFFFF",
      ink: c.main,
      degrees: -2
    });
  }

  // On the square there is less height; shrink GAME DAY before it collides
  // with the crest or the hype line.
  var need = function (s) {
    k.setFont(ctx, "400 " + s + "px " + k.ANTON);

    return k.capOf(ctx) + s * 0.84 + 48 + (quote ? quote.h + 44 : 0) + 30;
  };

  while (size > 160 && barTop - need(size) < headBottom) {
    size -= 4;
  }

  k.setFont(ctx, "400 " + size + "px " + k.ANTON);

  var cap = k.capOf(ctx);
  var lead = size * 0.84;
  var dayBase = barTop - 48;
  var gameBase = dayBase - lead;

  // The two echoes: outline copies up and to the right, fainter each step.
  [
    { dx: 24, alpha: 0.35 },
    { dx: 12, alpha: 0.65 }
  ].forEach(function (e) {
    ctx.save();
    ctx.globalAlpha = e.alpha;
    ctx.strokeStyle = c.pop;
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.strokeText("GAME", PAD + e.dx, gameBase - e.dx);
    ctx.strokeText("DAY", PAD + e.dx, dayBase - e.dx);
    ctx.restore();
  });

  ctx.textAlign = "left";
  ctx.fillStyle = c.pop;
  ctx.fillText("GAME", PAD, gameBase);
  ctx.fillStyle = c.onMain;
  ctx.fillText("DAY", PAD, dayBase);

  if (quote) {
    quote.paint(PAD, gameBase - cap - 44 - quote.h);
  }
}

export default {
  key: "echo",
  name: "Echo",
  draw: draw
};
