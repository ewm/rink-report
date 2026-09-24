/**
 * Component: the gameday post panel.
 *
 * Opened from a schedule row when the page is in admin mode (?admin), so a
 * parent never sees the button. The manager picks a template and a size,
 * adds a photo from their phone if they want one, edits the hype line, and
 * shares or saves a PNG for Instagram.
 *
 * The three templates live in ui/post/ and each draws onto a canvas. This
 * file owns the panel, the choices, the fonts, the crest and the photo.
 *
 * The panel lives outside #app on purpose. render() writes #app in one go
 * and would throw away a canvas mid-draw on the next poll, so this module
 * owns its own node and its own lifecycle.
 * See ARCHITECTURE.md, "Gameday post card".
 */
import { state } from "../state.js";
import { dateObj } from "../util/dates.js";
import { esc } from "../util/text.js";
import * as kit from "./post/kit.js";
import blueline from "./post/blueline.js";
import echo from "./post/echo.js";
import faceoff from "./post/faceoff.js";

/** The templates, in the order the picker shows them. */
var TEMPLATES = [blueline, echo, faceoff];

/** Where the last template and size picked are remembered, per phone. */
var PREFS_KEY = "checktherink.post";

/**
 * The fonts the templates draw with. The page itself only loads Barlow
 * Condensed 700, so these are fetched the first time a panel opens and a
 * parent never downloads them.
 */
var FONT_CSS =
  "https://fonts.googleapis.com/css2?family=Anton" +
  "&family=Barlow+Condensed:ital,wght@0,600;0,700;0,800;1,800&display=swap";

/** The open panel, or null. One at a time. */
var panel = null;

/** The game the open panel is drawing. */
var current = null;

/** The panel's choices. Template and size carry over between posts. */
var choice = { tpl: "blueline", size: "feed", hype: "", showHype: true };

/**
 * The photo picked for this visit, as {img, url, name}, or null.
 *
 * It stays on the phone: it is read from the file picker and drawn, never
 * sent anywhere. It carries over to the next post until removed, since a
 * manager making posts for a weekend usually wants the same one.
 */
var photo = null;

/** The crest, once loaded, so it is fetched once per visit. */
var crestLoad = null;

/** The font load, so the stylesheet is added once per visit. */
var fontLoad = null;

/**
 * Reads the remembered template and size.
 */
function loadPrefs() {
  try {
    var saved = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");

    if (templateByKey(saved.tpl)) {
      choice.tpl = saved.tpl;
    }

    if (kit.SIZES[saved.size]) {
      choice.size = saved.size;
    }
  } catch (e) {}
}

/**
 * Remembers the template and size for next time.
 */
function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ tpl: choice.tpl, size: choice.size }));
  } catch (e) {}
}

/**
 * @param {string} key
 * @returns {Object|null} The template module with that key.
 */
function templateByKey(key) {
  return (
    TEMPLATES.filter(function (t) {
      return t.key === key;
    })[0] || null
  );
}

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
 * Whether we are the home team in this game.
 *
 * @param {Object} g
 * @returns {boolean}
 */
function atHome(g) {
  return g.home === (state.data.config.teamName || "");
}

/**
 * The hype line a game starts with, before the manager edits it.
 *
 * @param {Object} g
 * @returns {string}
 */
function defaultHype(g) {
  return atHome(g) ? "Protect the barn." : "Take their ice.";
}

/**
 * Loads the fonts the templates need, then waits for the ones they use.
 *
 * Canvas does not wait for a webfont the way the DOM does: draw too early
 * and the post comes out in a fallback face. document.fonts.load only knows
 * a family once its stylesheet has arrived, so this waits for the
 * stylesheet first. Never rejects; a missing font means a fallback, not a
 * broken panel.
 *
 * @returns {Promise}
 */
function loadFonts() {
  if (fontLoad) {
    return fontLoad;
  }

  fontLoad = new Promise(function (resolve) {
    var link = document.createElement("link");

    link.rel = "stylesheet";
    link.href = FONT_CSS;
    link.onload = resolve;
    link.onerror = resolve;
    document.head.appendChild(link);

    // Slow network: give up waiting and draw with what is there.
    setTimeout(resolve, 4000);
  }).then(function () {
    if (!document.fonts || !document.fonts.load) {
      return;
    }

    var wanted = [
      '400 100px "Anton"',
      '600 100px "Barlow Condensed"',
      '700 100px "Barlow Condensed"',
      '800 100px "Barlow Condensed"',
      'italic 800 100px "Barlow Condensed"'
    ];

    return Promise.all(
      wanted.map(function (f) {
        return document.fonts.load(f).catch(function () {});
      })
    );
  });

  return fontLoad;
}

/**
 * Loads one image from this site. Resolves null when it is not there.
 *
 * @param {string} src
 * @returns {Promise<HTMLImageElement|null>}
 */
function loadImage(src) {
  return new Promise(function (resolve) {
    var img = new Image();

    img.onload = function () {
      resolve(img);
    };

    img.onerror = function () {
      resolve(null);
    };

    img.src = src;
  });
}

/**
 * Loads the club crest.
 *
 * A team folder can hold a post-logo.png, a larger copy of the crest for
 * the posts; the page's logo.png is sized for the masthead and goes soft at
 * 300px wide. Without one, logo.png is used. Both are same-origin, so the
 * canvas stays exportable. No crest at all is not an error.
 *
 * @returns {Promise<HTMLImageElement|null>}
 */
function loadCrest() {
  if (crestLoad) {
    return crestLoad;
  }

  crestLoad = loadImage("post-logo.png").then(function (big) {
    if (big) {
      return big;
    }

    return state.logoOk ? loadImage("logo.png") : null;
  });

  return crestLoad;
}

/**
 * "SAT · OCT 3", the way the templates set a date.
 *
 * @param {string} iso
 * @returns {string}
 */
function shortDate(iso) {
  var d = dateObj(iso);

  if (!d) {
    return "";
  }

  var days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  var months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

  return days[d.getDay()] + " · " + months[d.getMonth()] + " " + d.getDate();
}

/**
 * Our name as the post sets it: the short name from teams.js ("Wings")
 * when there is one, the full team name otherwise.
 *
 * @returns {string}
 */
function ourName() {
  var club = window.CHECK_THE_RINK_CLUB;

  if (club && club.team && club.team.short) {
    return club.team.short;
  }

  return state.data.config.teamName || "Us";
}

/**
 * Everything a template needs to draw one post.
 *
 * @param {Object} g - The game.
 * @param {HTMLImageElement|null} crest
 * @returns {Object}
 */
function cardFor(g, crest) {
  var home = atHome(g);
  var opponent = (home ? g.away : g.home) || "TBD";
  var label = g.event ? g.event : home ? "Home game" : "Away game";
  var quote = choice.showHype ? choice.hype.trim() : "";

  return {
    h: kit.SIZES[choice.size].h,
    us: ourName().toUpperCase(),
    opponent: opponent.toUpperCase(),
    vsWord: home ? "VS" : "@",
    label: label.toUpperCase(),
    date: shortDate(g.date),
    time: (g.time || "TBD").toUpperCase(),
    rink: (g.rink || "").toUpperCase(),
    quote: quote.toUpperCase(),
    crest: crest,
    photo: photo ? photo.img : null,
    colors: kit.colors()
  };
}

/**
 * Draws the open panel's post with the current choices.
 */
function redraw() {
  if (!panel || !current) {
    return;
  }

  loadCrest().then(function (crest) {
    if (!panel) {
      return;
    }

    var canvas = panel.querySelector(".postcanvas");
    var card = cardFor(current, crest);
    var ctx = canvas.getContext("2d");

    canvas.width = kit.W;
    canvas.height = card.h;
    ctx.clearRect(0, 0, kit.W, card.h);

    templateByKey(choice.tpl).draw(ctx, card);

    canvas.setAttribute(
      "aria-label",
      "Gameday post preview, " + templateByKey(choice.tpl).name + ", " + kit.SIZES[choice.size].label
    );

    note(
      kit.W + " x " + card.h + ". " +
        (canShareFiles() ? "Share sends it straight to Instagram." : "Saves as a PNG to your downloads.")
    );
  });
}

/**
 * The on/off state of a set of picker buttons.
 *
 * @param {string} group - "tpl" or "size".
 */
function markPressed(group) {
  panel.querySelectorAll('[data-post="' + group + '"]').forEach(function (b) {
    b.setAttribute("aria-pressed", b.getAttribute("data-v") === choice[group] ? "true" : "false");
  });
}

/**
 * Shows the photo's name and whether Remove applies.
 */
function showPhotoState() {
  var name = panel.querySelector(".postphotoname");
  var remove = panel.querySelector('[data-post="nophoto"]');

  name.textContent = photo ? photo.name : "No photo. The photo area shows club color.";
  remove.hidden = !photo;
}

/**
 * Takes the file the manager picked and draws with it.
 *
 * @param {File} file
 */
function usePhoto(file) {
  if (!file || !/^image\//.test(file.type)) {
    note("That file is not a photo.");
    return;
  }

  var url = URL.createObjectURL(file);

  loadImage(url).then(function (img) {
    if (!img) {
      URL.revokeObjectURL(url);
      note("That photo could not be opened on this browser. Try a JPEG.");
      return;
    }

    dropPhoto();
    photo = { img: img, url: url, name: file.name || "Photo" };

    if (panel) {
      showPhotoState();
      redraw();
    }
  });
}

/**
 * Forgets the photo and frees its memory.
 */
function dropPhoto() {
  if (photo) {
    URL.revokeObjectURL(photo.url);
    photo = null;
  }
}

/**
 * Picker buttons inside the panel: template, size, remove photo.
 *
 * @param {Event} e
 */
function onPanelClick(e) {
  var btn = e.target.closest("[data-post]");

  if (!btn) {
    return;
  }

  var what = btn.getAttribute("data-post");

  if (what === "tpl" || what === "size") {
    choice[what] = btn.getAttribute("data-v");
    savePrefs();
    markPressed(what);
    redraw();
  }

  if (what === "nophoto") {
    dropPhoto();
    showPhotoState();
    redraw();
  }
}

/**
 * The file picker and the show-hype switch.
 *
 * @param {Event} e
 */
function onPanelChange(e) {
  if (e.target.matches(".postfile input")) {
    usePhoto(e.target.files && e.target.files[0]);

    // Clears the picker so choosing the same file again still fires.
    e.target.value = "";
  }

  if (e.target.matches(".posthypeon")) {
    choice.showHype = e.target.checked;
    panel.querySelector(".posthype").disabled = !choice.showHype;
    redraw();
  }
}

/** A redraw waiting for the next frame, while the hype line is typed. */
var typing = 0;

/**
 * The hype line box, redrawn once per frame at most while typing.
 *
 * @param {Event} e
 */
function onPanelInput(e) {
  if (!e.target.matches(".posthype")) {
    return;
  }

  choice.hype = e.target.value;
  cancelAnimationFrame(typing);
  typing = requestAnimationFrame(redraw);
}

/**
 * The picker's buttons for one group.
 *
 * @param {string} group - "tpl" or "size".
 * @param {Array<{v: string, label: string}>} items
 * @returns {string} HTML.
 */
function pickerButtons(group, items) {
  return items
    .map(function (it) {
      return (
        '<button type="button" data-post="' + group + '" data-v="' + it.v + '" aria-pressed="' +
        (choice[group] === it.v) + '">' + esc(it.label) + "</button>"
      );
    })
    .join("");
}

/**
 * A file name a phone's photo roll can live with.
 *
 * @param {Object} g
 * @returns {string}
 */
function fileNameFor(g) {
  var us = ourName();
  var other = (atHome(g) ? g.away : g.home) || "game";

  return (us + "-vs-" + other + "-" + g.date + "-" + choice.size)
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
 * Saves or shares the drawn post.
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
  loadPrefs();
  current = g;
  choice.hype = defaultHype(g);
  choice.showHype = true;

  var templates = TEMPLATES.map(function (t) {
    return { v: t.key, label: t.name };
  });

  var sizes = Object.keys(kit.SIZES).map(function (s) {
    return { v: s, label: kit.SIZES[s].label };
  });

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
      '<div class="postopts">' +
        '<div class="postrow"><span class="postlbl">Template</span>' +
          '<div class="seg postseg">' + pickerButtons("tpl", templates) + "</div></div>" +
        '<div class="postrow"><span class="postlbl">Size</span>' +
          '<div class="seg postseg">' + pickerButtons("size", sizes) + "</div></div>" +
      "</div>" +
      '<div class="poststage"><canvas class="postcanvas" width="' + kit.W + '" height="' +
        kit.SIZES[choice.size].h + '"></canvas></div>' +
      '<div class="postopts">' +
        '<div class="postrow">' +
          '<label class="postfile">Choose photo<input type="file" accept="image/*"></label>' +
          '<button type="button" class="postplain" data-post="nophoto" hidden>Remove photo</button>' +
        "</div>" +
        '<p class="postphotoname"></p>' +
        '<label class="postlbl" for="posthype">Hype line</label>' +
        '<input type="text" id="posthype" class="posthype" maxlength="60" value="' +
          esc(choice.hype) + '">' +
        '<label class="postcheck"><input type="checkbox" class="posthypeon" checked> Show the hype line</label>' +
      "</div>" +
      '<p class="postnote">Drawing&hellip;</p>' +
      '<div class="postacts">' +
        '<button type="button" data-act="postsave">' +
          (canShareFiles() ? "Share image" : "Save image") +
        "</button>" +
      "</div>" +
    "</div>";

  panel.addEventListener("click", onPanelClick);
  panel.addEventListener("change", onPanelChange);
  panel.addEventListener("input", onPanelInput);

  document.body.appendChild(panel);
  document.body.classList.add("post-open");
  showPhotoState();

  loadFonts().then(redraw);
}

/** Closes the panel, if one is open. The photo is kept for the next post. */
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
