/**
 * Checks for the Rink Music board (docs/wswings12u/staff/music/).
 *
 * Runs in headless Chromium against a local server. Songs are made on the
 * fly as WAV tones, so there are no audio fixtures to keep.
 *
 *   cd tests
 *   node music.js
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const DOCS = path.join(__dirname, "..", "docs");

const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json"
};

let passed = 0;
let failed = 0;

/**
 * Records one check.
 *
 * @param {boolean} ok
 * @param {string} name
 */
function check(ok, name) {
  if (ok) {
    passed++;
    console.log("  ok   " + name);
  } else {
    failed++;
    console.log("  FAIL " + name);
  }
}

/**
 * A mono 8-bit WAV tone, as a Buffer.
 *
 * @param {number} seconds
 * @param {number} hz
 * @returns {Buffer}
 */
function tone(seconds, hz) {
  const rate = 8000;
  const n = rate * seconds;
  const buf = Buffer.alloc(44 + n);

  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate, 28);
  buf.writeUInt16LE(1, 32);
  buf.writeUInt16LE(8, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n, 40);

  for (let i = 0; i < n; i++) {
    buf[44 + i] = 128 + Math.round(60 * Math.sin((2 * Math.PI * hz * i) / rate));
  }

  return buf;
}

/**
 * Serves docs/ on a free port.
 *
 * @returns {Promise<{server: http.Server, base: string}>}
 */
function serve() {
  const server = http.createServer((req, res) => {
    let file = path.join(DOCS, decodeURIComponent(req.url.split("?")[0]));

    if (file.endsWith("/")) {
      file += "index.html";
    }

    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end();
        return;
      }

      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
      res.end(data);
    });
  });

  return new Promise((resolve) => {
    server.listen(0, () => resolve({ server, base: "http://localhost:" + server.address().port }));
  });
}

/**
 * Unit checks on the moment rules (no browser).
 */
async function unit() {
  console.log("moments.js");

  const m = await import(path.join(DOCS, "js/music/moments.js"));

  const songs = [
    { id: "a", moment: "whistle", addedAt: 1 },
    { id: "b", moment: "whistle", addedAt: 2 },
    { id: "c", moment: "goal", addedAt: 3 }
  ];

  check(m.nextSong(songs, "whistle", null).id === "a", "first tap plays the first song");
  check(m.nextSong(songs, "whistle", "a").id === "b", "second tap plays the next song");
  check(m.nextSong(songs, "whistle", "b").id === "a", "rotation wraps to the start");
  check(m.nextSong(songs, "timeout", null) === null, "a moment with no songs returns null");
  check(m.nextSong(songs, "whistle", "gone").id === "a", "a deleted last song restarts the rotation");

  check(m.playLength({ moment: "whistle", length: 0 }) === 25, "length 0 uses the moment default");
  check(m.playLength({ moment: "whistle", length: 15 }) === 15, "a song's own length wins");
  check(m.playLength({ moment: "whistle", length: -1 }) === 0, "-1 plays the whole song");
  check(m.playLength({ moment: "warmup", length: 0 }) === 0, "warmup default is the whole song");

  check(m.songTitle("05 I Gotta Feeling.m4a") === "I Gotta Feeling", "track number and extension come off the title");
  check(m.songTitle("2-08 Not Fire, Not Ice.m4a") === "Not Fire, Not Ice", "disc-track numbers come off too");
  check(m.songTitle("Sandstorm.mp3") === "Sandstorm", "a title with no number is left alone");

  check(m.clock(47.9) === "0:47", "clock shows m:ss");
  check(m.clock(-3) === "0:00", "clock never goes negative");
}

/**
 * Browser checks on the page itself.
 *
 * @param {string} base
 */
async function page(base) {
  console.log("music page");

  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  const errors = [];

  p.on("pageerror", (e) => errors.push(e.message));

  await p.goto(base + "/wswings12u/staff/music/");
  await p.waitForSelector(".mb-top");

  check(await p.locator(".mb-empty").isVisible(), "an empty phone points to Setup");

  // Add four songs.
  await p.click('[data-action="view"][data-id="setup"]');

  await p.setInputFiles('#mb-file', [1, 2, 3, 4].map((i) => ({
    name: "0" + i + " Test Song " + i + ".wav",
    mimeType: "audio/wav",
    buffer: tone(60, 200 * i)
  })));

  await p.waitForSelector(".mb-msg");

  const msg = await p.textContent(".mb-msg");

  check(/Added 4 songs/.test(msg), "adding four files says Added 4 songs");
  check(await p.locator(".mb-row").count() === 4, "four songs listed");
  check((await p.textContent(".mb-row-name")) === "Test Song 1", "titles are cleaned up");

  // Adding the same files again makes no duplicates.
  await p.setInputFiles('#mb-file', [1].map((i) => ({
    name: "0" + i + " Test Song " + i + ".wav",
    mimeType: "audio/wav",
    buffer: tone(60, 200 * i)
  })));

  await p.waitForFunction(() => document.querySelector(".mb-msg") && /already on this phone/.test(document.querySelector(".mb-msg").textContent));
  check(await p.locator(".mb-row").count() === 4, "re-adding a song doesn't duplicate it");

  // Song 1 and 2 -> Whistle, song 3 -> Goal.
  const setMoment = async (title, moment) => {
    await p.click(`.mb-row:has-text("${title}")`);
    await p.click(`.is-open [data-action="set-moment"][data-value="${moment}"]`);
    await p.click(`.mb-row:has-text("${title}")`);
  };

  await setMoment("Test Song 1", "whistle");
  await setMoment("Test Song 2", "whistle");
  await setMoment("Test Song 3", "goal");

  // Mark a hook on song 1: play from start, wait, mark.
  await p.click('.mb-row:has-text("Test Song 1")');
  await p.click('.is-open [data-action="preview"]');
  await p.waitForTimeout(2200);
  await p.click('.is-open [data-action="mark"]');
  await p.waitForTimeout(200);

  const hook1 = await p.textContent(".is-open .mb-hook-time");

  check(/^0:0[12]\.\d$/.test(hook1), "mark hook saves the play position (" + hook1 + ")");

  await p.click('.is-open [data-action="nudge"][data-by="1"]');

  const hook2 = await p.textContent(".is-open .mb-hook-time");

  check(hook2 !== hook1 && /^0:0[23]\.\d$/.test(hook2), "+1s moves the hook (" + hook2 + ")");

  // Set a hook of 30s on song 2 with the nudge button, from 0.
  await p.click('.mb-row:has-text("Test Song 2")');

  for (let i = 0; i < 30; i++) {
    await p.click('.is-open [data-action="nudge"][data-by="1"]');
  }

  check((await p.textContent(".is-open .mb-hook-time")) === "0:30.0", "nudging thirty times sets 0:30");

  await p.click('[data-action="stop"]');
  await p.waitForTimeout(500);

  // Settings survive a reload.
  await p.reload();
  await p.click('[data-action="view"][data-id="setup"]');
  check(await p.locator(".mb-group-title:has-text('Whistle') + .mb-list .mb-row").count() === 2, "after reload, Whistle still has its two songs");

  // Game: Whistle rotates and starts at the hook.
  await p.click('[data-action="view"][data-id="game"]');
  await p.click('[data-action="moment"][data-id="whistle"]');
  await p.waitForTimeout(400);

  const first = await p.evaluate(() => document.getElementById("now-line").textContent);
  const firstPos = await p.evaluate(() => document.querySelector("audio") ? 0 : null);

  check(/Whistle/.test(first) && /Test Song 1/.test(first), "first Whistle tap plays song 1 (" + first.trim() + ")");

  await p.click('[data-action="moment"][data-id="whistle"]');
  await p.waitForTimeout(1500);

  const second = await p.evaluate(() => document.getElementById("now-line").textContent);

  check(/Test Song 2/.test(second), "second Whistle tap plays song 2");
  check(/0:2[2-5]/.test(second), "Whistle shows the countdown from 25s (" + second.trim() + ")");

  // Moment with no songs says exactly what to do.
  await p.click('[data-action="moment"][data-id="timeout"]');

  const empty = await p.textContent(".mb-msg");

  check(/No songs on Timeout yet/.test(empty), "an empty moment names the fix");

  // STOP clears the now-playing line.
  await p.click('[data-action="stop"]');
  await p.waitForTimeout(600);
  check(/Nothing playing/.test(await p.textContent("#now-line")), "STOP stops the song");

  // Goal with no players plays the team goal song straight away.
  await p.click('[data-action="moment"][data-id="goal"]');
  await p.waitForTimeout(400);
  check(/Test Song 3/.test(await p.textContent("#now-line")), "Goal with no players plays the goal song");
  await p.click('[data-action="stop"]');
  await p.waitForTimeout(500);

  // Players: add #12 with song 4, hook at 0:05.
  await p.click('[data-action="view"][data-id="players"]');
  await p.fill('input[name="number"]', "12");
  await p.click('.mb-addplayer button');
  await p.selectOption(".is-open select[data-action='player-song']", { label: "Test Song 4" });

  for (let i = 0; i < 5; i++) {
    await p.click('.is-open [data-action="player-nudge"][data-by="1"]');
  }

  check((await p.textContent(".is-open .mb-hook-time")) === "0:05.0", "player hook set to 0:05");

  await p.fill('input[name="number"]', "12");
  await p.click('.mb-addplayer button');
  check(/already on the list/.test(await p.textContent(".mb-msg")), "a duplicate jersey number is refused by name");

  // Goal now asks who scored.
  await p.click('[data-action="view"][data-id="game"]');
  await p.click('[data-action="moment"][data-id="goal"]');
  check(await p.locator(".mb-sheet").isVisible(), "Goal opens Who scored?");
  check(await p.locator(".mb-num").count() === 1, "the sheet shows the one player with a song");

  await p.click('.mb-num:has-text("12")');
  await p.waitForTimeout(400);
  check(/Goal #12/.test(await p.textContent("#now-line")) && /Test Song 4/.test(await p.textContent("#now-line")), "tapping #12 plays their song");

  const pos = await p.evaluate(() => {
    // The player module keeps its <audio> off the page; find it through the media session of the document.
    return window.__musicPos ? window.__musicPos() : null;
  });

  await p.click('[data-action="moment"][data-id="goal"]');
  await p.click('[data-action="team-goal"]');
  await p.waitForTimeout(1200);
  check(/Test Song 3/.test(await p.textContent("#now-line")), "Team goal plays the goal song, fading out #12");

  await p.click('[data-action="stop"]');

  // Delete takes two taps.
  await p.click('[data-action="view"][data-id="setup"]');
  await p.click('.mb-row:has-text("Test Song 4")');
  await p.click('.is-open [data-action="delete"]');
  check(await p.locator(".mb-row").count() === 4, "one delete tap doesn't delete");
  await p.click('.is-open [data-action="delete"]');
  check(await p.locator(".mb-row").count() === 3, "the second tap deletes");

  await p.screenshot({ path: path.join(__dirname, "out", "music-setup.png"), fullPage: true });
  await p.click('[data-action="view"][data-id="game"]');
  await p.screenshot({ path: path.join(__dirname, "out", "music-game.png") });

  check(errors.length === 0, "no page errors" + (errors.length ? ": " + errors.join(" | ") : ""));

  await browser.close();
}

(async () => {
  fs.mkdirSync(path.join(__dirname, "out"), { recursive: true });

  const { server, base } = await serve();

  try {
    await unit();
    await page(base);
  } finally {
    server.close();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
