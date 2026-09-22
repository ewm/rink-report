/**
 * Check The Rink: club color themes.
 *
 * A club gives two colors, a main color and an accent (the Wings give
 * navy #003087 and gold #FCD51E). This file works out every other color
 * the design system needs from those two, for light and dark mode, and
 * makes sure everything stays readable and visible.
 *
 * Colors are adjusted in OKLCH, a color space where "lighter" and "darker"
 * keep the hue and don't wash out to grey or pastel the way mixing with
 * white does.
 *
 * Plain script, no modules, so it loads anywhere with one <script> tag
 * and runs before the page paints. Everything hangs off window.CheckTheRinkTheme.
 */
(function () {

  /** Page grounds and ink in each mode. Must match the base tokens. */
  var PAPER_LIGHT = "#FFFFFF";
  var PAPER_DARK = "#0A111C";
  var INK_LIGHT = "#0B1220";
  var INK_DARK = "#EDF2F9";

  /** Contrast targets (WCAG): 4.5 for text, 7 for text we want to feel solid, 3 for marks. */
  var TEXT = 4.5;
  var STRONG = 7;
  var MARK = 3;

  /** An accent has to stand this far apart from the page and from the main color to be used as-is. */
  var ACCENT_VS_LIGHT_PAPER = 1.2;
  var ACCENT_VS_DARK_PAPER = 3;
  var ACCENT_VS_MAIN = 1.6;

  /** Chroma cap when a color is lightened for dark mode, so it doesn't go neon. */
  var MAX_LIGHT_CHROMA = 0.14;

  /** Old Rink Report names, written alongside the new ones so rink.css keeps working. */
  var ALIASES = {
    "navy": "main",
    "navy-ink": "main-ink",
    "on-navy": "on-main",
    "gold": "accent",
    "on-gold": "on-accent",
    "on-gold-2": "on-accent-2"
  };


  /* ------------------------------------------------------------
     Color math
     ------------------------------------------------------------ */

  /**
   * Parses "#abc" or "#aabbcc" into [r, g, b] (0 to 255).
   * @param {string} hex
   * @returns {number[]|null} null when it isn't a hex color
   */
  function parse(hex) {
    var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || "").trim());

    if (!m) {
      return null;
    }

    var h = m[1].length === 3
      ? m[1].replace(/./g, "$&$&")
      : m[1];

    return [0, 2, 4].map(function (i) {
      return parseInt(h.substr(i, 2), 16);
    });
  }


  /**
   * Turns [r, g, b] (0 to 255) back into "#RRGGBB".
   * @param {number[]} rgb
   * @returns {string}
   */
  function hex(rgb) {
    return "#" + rgb.map(function (v) {
      var s = Math.round(Math.max(0, Math.min(255, v))).toString(16);

      return s.length === 1 ? "0" + s : s;
    }).join("").toUpperCase();
  }


  /**
   * One sRGB channel (0 to 1) to linear light.
   * @param {number} c
   * @returns {number}
   */
  function toLinear(c) {
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }


  /**
   * One linear-light channel back to sRGB (0 to 1).
   * @param {number} c
   * @returns {number}
   */
  function fromLinear(c) {
    return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  }


  /**
   * Relative luminance, the brightness number contrast is computed from.
   * @param {string} color hex
   * @returns {number} 0 (black) to 1 (white)
   */
  function luminance(color) {
    var c = parse(color).map(function (v) {
      return toLinear(v / 255);
    });

    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }


  /**
   * Contrast ratio between two colors, 1 (none) to 21 (black on white).
   * @param {string} a hex
   * @param {string} b hex
   * @returns {number}
   */
  function contrast(a, b) {
    var la = luminance(a);
    var lb = luminance(b);

    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }


  /**
   * Hex to OKLCH [L 0-1, C, H degrees].
   * @param {string} color
   * @returns {number[]}
   */
  function toOklch(color) {
    var c = parse(color).map(function (v) {
      return toLinear(v / 255);
    });

    var l = Math.cbrt(0.4122214708 * c[0] + 0.5363325363 * c[1] + 0.0514459929 * c[2]);
    var m = Math.cbrt(0.2119034982 * c[0] + 0.6806995451 * c[1] + 0.1073969566 * c[2]);
    var s = Math.cbrt(0.0883024619 * c[0] + 0.2817188376 * c[1] + 0.6299787005 * c[2]);

    var L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
    var a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
    var b = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;

    return [L, Math.sqrt(a * a + b * b), Math.atan2(b, a) * 180 / Math.PI];
  }


  /**
   * OKLCH to linear sRGB, which may fall outside 0 to 1 (out of gamut).
   * @param {number[]} lch
   * @returns {number[]}
   */
  function oklchToLinear(lch) {
    var hr = lch[2] * Math.PI / 180;
    var a = lch[1] * Math.cos(hr);
    var b = lch[1] * Math.sin(hr);

    var l = Math.pow(lch[0] + 0.3963377774 * a + 0.2158037573 * b, 3);
    var m = Math.pow(lch[0] - 0.1055613458 * a - 0.0638541728 * b, 3);
    var s = Math.pow(lch[0] - 0.0894841775 * a - 1.2914855480 * b, 3);

    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    ];
  }


  /**
   * OKLCH to hex. When the color can't be shown on a screen, chroma is
   * lowered until it can, keeping lightness and hue.
   * @param {number[]} lch
   * @returns {string}
   */
  function fromOklch(lch) {
    var inGamut = function (rgb) {
      return rgb.every(function (v) {
        return v >= -0.0005 && v <= 1.0005;
      });
    };

    var rgb = oklchToLinear(lch);

    if (!inGamut(rgb)) {
      var lo = 0;
      var hi = lch[1];

      for (var i = 0; i < 20; i++) {
        var mid = (lo + hi) / 2;

        if (inGamut(oklchToLinear([lch[0], mid, lch[2]]))) {
          lo = mid;
        } else {
          hi = mid;
        }
      }

      rgb = oklchToLinear([lch[0], lo, lch[2]]);
    }

    return hex(rgb.map(function (v) {
      return fromLinear(Math.max(0, Math.min(1, v))) * 255;
    }));
  }


  /**
   * A club color written the one way CSS and canvas both accept: "#RRGGBB".
   * "003087" and "#abc" come out as "#003087" and "#AABBCC".
   * @param {string} color
   * @returns {string}
   */
  function normal(color) {
    return hex(parse(color));
  }


  /**
   * True when both of a club's colors are hex codes this file can use.
   * @param {string} main
   * @param {string} accent
   * @returns {boolean}
   */
  function valid(main, accent) {
    return !!parse(main) && !!parse(accent);
  }


  /**
   * Mixes a color toward another in plain sRGB. Used only for washes.
   * @param {string} from hex
   * @param {string} to hex
   * @param {number} t 0 = from, 1 = to
   * @returns {string} hex
   */
  function mix(from, to, t) {
    var a = parse(from);
    var b = parse(to);

    return hex(a.map(function (v, i) {
      return v + (b[i] - v) * t;
    }));
  }


  /**
   * Moves a color lighter or darker in OKLCH, in small steps, until it
   * reaches the contrast target against a ground. Returns the first step
   * that passes, so it stays as close to the club's color as it can.
   *
   * @param {string} color hex
   * @param {string} ground hex
   * @param {number} target contrast ratio
   * @param {string} [direction] "darker" or "lighter"; defaults to away from the ground
   * @returns {string} hex
   */
  function reach(color, ground, target, direction) {
    if (contrast(color, ground) >= target) {
      return color;
    }

    var lighter = direction
      ? direction === "lighter"
      : luminance(ground) < 0.5;

    var lch = toOklch(color);
    var chroma = lighter ? Math.min(lch[1], MAX_LIGHT_CHROMA) : lch[1];

    for (var L = lch[0]; L >= 0 && L <= 1; L += lighter ? 0.01 : -0.01) {
      var c = fromOklch([L, chroma, lch[2]]);

      if (contrast(c, ground) >= target) {
        return c;
      }
    }

    return lighter ? "#FFFFFF" : "#000000";
  }


  /* ------------------------------------------------------------
     Picking colors for jobs
     ------------------------------------------------------------ */

  /**
   * Readable type for a solid panel. White when white reads; otherwise a
   * very dark shade of the club's main color, so type on a gold panel
   * reads as "deep navy" rather than plain black.
   * @param {string} panel hex
   * @param {string} main hex
   * @returns {string} hex
   */
  function typeOn(panel, main) {
    var white = contrast("#FFFFFF", panel);

    if (white >= TEXT) {
      return "#FFFFFF";
    }

    var dark = reach(main, panel, STRONG, "darker");

    return contrast(dark, panel) >= white ? dark : "#FFFFFF";
  }


  /**
   * A softer second line of type on a panel: the type color eased toward
   * the panel, but never below 4.5:1.
   * @param {string} type hex
   * @param {string} panel hex
   * @returns {string} hex
   */
  function softer(type, panel) {
    for (var t = 0.25; t > 0; t -= 0.01) {
      var c = mix(type, panel, t);

      if (contrast(c, panel) >= TEXT) {
        return c;
      }
    }

    return type;
  }


  /**
   * Whether the accent can do its job as given: visible against the page
   * and clearly different from the main color.
   * @param {string} accent hex
   * @param {string} main hex, as shown in this mode
   * @param {string} paper hex
   * @param {number} vsPaper minimum contrast against the page
   * @returns {boolean}
   */
  function accentWorks(accent, main, paper, vsPaper) {
    return contrast(accent, paper) >= vsPaper
      && contrast(accent, main) >= ACCENT_VS_MAIN;
  }


  /**
   * Every themed slot for one mode.
   *
   * When the accent can't do its job (white on a white page, black on a
   * dark page, too close to the main color), two stand-ins take over:
   * the accent panel is filled with the main color, and the thin marks
   * (5px masthead rule, inset bars) are drawn in ink. Nothing vanishes.
   *
   * @param {string} main hex, as shown in this mode
   * @param {string} accent hex, as the club gave it
   * @param {boolean} dark
   * @returns {Object<string,string>}
   */
  function slots(main, accent, dark) {
    var paper = dark ? PAPER_DARK : PAPER_LIGHT;
    var ink = dark ? INK_DARK : INK_LIGHT;
    var works = accentWorks(accent, main, paper, dark ? ACCENT_VS_DARK_PAPER : ACCENT_VS_LIGHT_PAPER);

    var panel = works ? accent : main;
    var mark = works ? accent : ink;
    var color = works ? accent : main;
    var onPanel = typeOn(panel, main);

    var mainInk = reach(main, paper, STRONG);

    // The "your team" wash. A pale tint of a bright accent reads as a
    // highlight; a tint of a dark accent reads as a greyed-out row, so
    // those use a tint of the main color instead.
    var usBg = dark
      ? mix(paper, mainInk, 0.09)
      : (works && luminance(accent) >= 0.2 ? mix(paper, accent, 0.16) : mix(paper, main, 0.12));

    var focus = reach(reach(color, paper, MARK), usBg, MARK);

    return {
      "main": main,
      "main-ink": mainInk,
      "on-main": typeOn(main, main),
      "accent-on-main": contrast(accent, main) >= TEXT ? accent : typeOn(main, main),
      "accent": panel,
      "mark": mark,
      "accent-ink": reach(color, paper, TEXT),
      "on-accent": onPanel,
      "on-accent-2": softer(onPanel, panel),
      "us-ink": reach(dark ? color : main, usBg, STRONG),
      "us-bg": usBg,
      "focus": focus
    };
  }


  /**
   * Every themed slot for a club, in light and dark.
   * @param {string} main the club's main color, hex
   * @param {string} accent the club's accent color, hex
   * @returns {{light: Object<string,string>, dark: Object<string,string>}}
   */
  function tokens(main, accent) {
    main = normal(main);
    accent = normal(accent);

    // A near-black main is lifted a little in dark mode so the masthead
    // still reads as a panel on the dark page.
    var darkMain = contrast(main, PAPER_DARK) < 1.25
      ? fromOklch([toOklch(main)[0] + 0.08, toOklch(main)[1], toOklch(main)[2]])
      : main;

    return {
      light: slots(main, accent, false),
      dark: slots(darkMain, accent, true)
    };
  }


  /**
   * Plain-words notes about a color pair, for whoever adds the club.
   * They never block anything: the stand-ins already keep the page
   * readable. They say where the club's accent won't appear as given.
   * @param {string} main hex
   * @param {string} accent hex
   * @returns {string[]}
   */
  function check(main, accent) {
    if (!parse(main) || !parse(accent)) {
      return ["Both colors have to be hex codes, like #003087."];
    }

    main = normal(main);
    accent = normal(accent);

    var out = [];
    var darkMain = tokens(main, accent).dark.main;

    if (!accentWorks(accent, main, PAPER_LIGHT, ACCENT_VS_LIGHT_PAPER)) {
      out.push("In light mode the accent is too close to white or to the main color, so the highlight panel uses the main color and the thin rules are drawn in black.");
    }

    if (!accentWorks(accent, darkMain, PAPER_DARK, ACCENT_VS_DARK_PAPER)) {
      out.push("In dark mode the accent is too dark or too close to the main color, so the highlight panel uses the main color and the thin rules are drawn in white.");
    }

    return out;
  }


  /**
   * Colors for the gameday post, a 1080 square that is always drawn the
   * same way whatever mode the phone is in: the main color as the ground,
   * the accent as the stripes. When the accent is too close to the main
   * color to show on it, the stripes go white or black, whichever stands out.
   * @param {string} main hex
   * @param {string} accent hex
   * @returns {{ground: string, band: string, onBand: string, onGround: string, accentOnGround: string}}
   */
  function card(main, accent) {
    main = normal(main);
    accent = normal(accent);

    var band = accent;

    if (contrast(accent, main) < ACCENT_VS_MAIN) {
      band = contrast("#FFFFFF", main) >= contrast(INK_LIGHT, main) ? "#FFFFFF" : INK_LIGHT;
    }

    var onGround = typeOn(main, main);

    return {
      ground: main,
      band: band,
      onBand: typeOn(band, main),
      onGround: onGround,
      accentOnGround: contrast(band, main) >= TEXT ? band : onGround
    };
  }


  /* ------------------------------------------------------------
     Writing it to the page
     ------------------------------------------------------------ */

  /**
   * CSS text that applies a club's slots to a selector, in light mode,
   * dark mode by phone setting, and dark mode by manual toggle.
   * @param {string} selector e.g. ':root' or '[data-org="wsyha"]'
   * @param {string} main hex
   * @param {string} accent hex
   * @returns {string}
   */
  function css(selector, main, accent) {
    var t = tokens(main, accent);
    var scoped = selector === ":root" ? "" : " " + selector;

    function block(sel, set) {
      var lines = Object.keys(set).map(function (k) {
        return "--" + k + ":" + set[k];
      });

      Object.keys(ALIASES).forEach(function (old) {
        lines.push("--" + old + ":" + set[ALIASES[old]]);
      });

      return sel + "{" + lines.join(";") + "}";
    }

    return block(selector, t.light)
      + "@media (prefers-color-scheme:dark){"
      + block(":root:not([data-theme=\"light\"])" + scoped, t.dark)
      + "}"
      + block(":root[data-theme=\"dark\"]" + scoped, t.dark);
  }


  /**
   * Adds a <style> tag with a club's theme for a selector.
   * @param {string} selector
   * @param {string} main hex
   * @param {string} accent hex
   */
  function apply(selector, main, accent) {
    var style = document.createElement("style");

    style.textContent = css(selector, main, accent);
    document.head.appendChild(style);
  }


  /**
   * The folder this page lives in, from its address: "wswings12u" for
   * /wswings12u/ or /rink-report/wswings12u/index.html.
   * @returns {string}
   */
  function currentFolder() {
    var parts = location.pathname.split("/").filter(function (p) {
      return p && !/\.html?$/i.test(p);
    });

    return parts.length ? parts[parts.length - 1] : "";
  }


  /**
   * Themes a team page in its club's colors, before it paints.
   *
   * Finds the team in teams.js by folder (RINK_CONFIG.folder wins when a
   * page sets it, which local testing does), puts the club's slots on the
   * whole page, and points the phone's browser bar at the club's main
   * color. With no match the page keeps the colors in rink.css.
   *
   * @param {object} [site] window.CHECK_THE_RINK from teams.js
   * @returns {{team: object, org: object}|null} what was applied
   */
  function applyTeamPage(site) {
    site = site || window.CHECK_THE_RINK;

    var cfg = window.RINK_CONFIG || {};
    var folder = cfg.folder || currentFolder();

    if (!site || !Array.isArray(site.teams)) {
      return null;
    }

    var team = site.teams.filter(function (t) {
      return t && t.folder === folder;
    })[0];

    var org = team && site.orgs && site.orgs[team.org];

    // The "All teams" row only needs to know this page is part of The One
    // Timer, which teams.js loading already says, club or no club.
    window.CHECK_THE_RINK_HOME = true;

    if (!org || !valid(org.primary, org.accent)) {
      return null;
    }

    apply(":root", org.primary, org.accent);

    var meta = document.querySelector('meta[name="theme-color"]');

    if (meta) {
      meta.setAttribute("content", normal(org.primary));
    }

    window.CHECK_THE_RINK_CLUB = {
      team: team,
      org: org,
      light: tokens(org.primary, org.accent).light,
      card: card(org.primary, org.accent)
    };

    return { team: team, org: org };
  }


  window.CheckTheRinkTheme = {
    tokens: tokens,
    check: check,
    css: css,
    apply: apply,
    applyTeamPage: applyTeamPage,
    valid: valid,
    card: card,
    contrast: contrast
  };

})();
