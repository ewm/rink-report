/**
 * The music board: Game, Setup and Players screens.
 *
 * Rendering is one innerHTML write per screen; every button carries a
 * data-action and one click handler on #app routes it. The audio lives in
 * player.js, the saved songs in store.js, the moment rules in moments.js.
 */

import {
  MOMENTS,
  LENGTH_CHOICES,
  PLAYER_SONG_LENGTH,
  momentById,
  songsForMoment,
  nextSong,
  playLength,
  songTitle,
  clock
} from "./moments.js";

import * as store from "./store.js";
import { FilePlayer } from "./player.js";

const app = document.getElementById("app");

const state = {
  view: "game",
  songs: [],
  players: [],
  open: null,          // id of the song (or "p:<number>" player) being edited in Setup
  goalSheet: false,
  lastPlayed: {},      // moment id -> song id, for rotation
  armedDelete: null,   // id waiting for its second "delete" tap
  message: null,       // { kind: "error" | "info", text }
  adding: null         // "Saving 3 of 19..." while files are being stored
};

const player = new FilePlayer(store.getAudio, () => render());

/**
 * Escapes text for HTML.
 *
 * @param {string} text
 * @returns {string}
 */
function esc(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Seconds as m:ss.t, for hooks (a tenth of a second matters on a hook).
 *
 * @param {number} seconds
 * @returns {string}
 */
function hookClock(seconds) {
  const tenths = Math.round((seconds % 1) * 10) % 10;

  return clock(seconds) + "." + tenths;
}

/**
 * Words for a song's length setting.
 *
 * @param {number} value
 * @param {string} momentId
 * @returns {string}
 */
function lengthWords(value, momentId) {
  if (value === -1) {
    return "whole song";
  }

  if (value > 0) {
    return value + "s";
  }

  const m = momentById(momentId);

  if (m && m.length > 0) {
    return m.length + "s (default)";
  }

  return "whole song (default)";
}

/**
 * Shows a message at the top of the screen.
 *
 * @param {"error" | "info"} kind
 * @param {string} text
 */
function say(kind, text) {
  state.message = { kind, text };
  render();
}

/* ------------------------------------------------------------------ */
/* Screens                                                              */
/* ------------------------------------------------------------------ */

/**
 * The whole page.
 */
function render() {
  const now = player.now;

  app.innerHTML = `
    <header class="mb-top">
      <h1 class="mb-title">Rink Music</h1>
      <nav class="mb-tabs">
        ${tab("game", "Game")}
        ${tab("setup", "Setup")}
        ${tab("players", "Players")}
      </nav>
    </header>
    ${state.message ? `<p class="mb-msg mb-msg-${state.message.kind}" data-action="dismiss">${esc(state.message.text)}</p>` : ""}
    <main class="mb-main">
      ${state.view === "game" ? gameView(now) : ""}
      ${state.view === "setup" ? setupView(now) : ""}
      ${state.view === "players" ? playersView(now) : ""}
    </main>
    ${state.goalSheet ? goalSheet() : ""}
    <footer class="mb-now">
      <p class="mb-now-line" id="now-line">${nowLine(now)}</p>
      <button class="mb-stop" data-action="stop">Stop</button>
    </footer>
  `;
}

/**
 * One tab button.
 *
 * @param {string} id
 * @param {string} label
 * @returns {string}
 */
function tab(id, label) {
  const on = state.view === id ? " is-on" : "";

  return `<button class="mb-tab${on}" data-action="view" data-id="${id}">${label}</button>`;
}

/**
 * The footer's "what's playing" line.
 *
 * @param {object | null} now
 * @returns {string}
 */
function nowLine(now) {
  if (!now) {
    return `<span class="mb-quiet">Nothing playing</span>`;
  }

  let left = "";

  if (now.length > 0) {
    const gone = (Date.now() - now.startedAt) / 1000;

    left = ` <span class="mb-left">${clock(now.length - gone)}</span>`;
  }

  return `<b>${esc(now.label)}</b> ${esc(now.song.name)}${left}`;
}

/**
 * Game screen: GOAL across the top, the other moments in a grid.
 *
 * @param {object | null} now
 * @returns {string}
 */
function gameView(now) {
  if (state.songs.length === 0) {
    return `
      <section class="mb-empty">
        <p>No songs on this phone yet.</p>
        <button class="mb-btn mb-btn-gold" data-action="view" data-id="setup">Go to Setup to add songs</button>
      </section>
    `;
  }

  const buttons = MOMENTS.map((m) => {
    const count = songsForMoment(state.songs, m.id).length;
    const playing = now && now.momentId === m.id ? " is-playing" : "";
    const empty = count === 0 ? " is-empty" : "";
    const big = m.id === "goal" ? " mb-moment-goal" : "";
    const scorers = state.players.filter((p) => p.songId).length;
    const extra = m.id === "goal" && scorers > 0 ? " · " + scorers + (scorers === 1 ? " player song" : " player songs") : "";

    return `
      <button class="mb-moment${big}${playing}${empty}" data-action="moment" data-id="${m.id}">
        <span class="mb-moment-name">${m.label}</span>
        <span class="mb-moment-count">${count} ${count === 1 ? "song" : "songs"}${extra}</span>
      </button>
    `;
  });

  return `<section class="mb-board">${buttons.join("")}</section>`;
}

/**
 * The "who scored?" sheet that opens from GOAL.
 *
 * @returns {string}
 */
function goalSheet() {
  const numbers = state.players
    .filter((p) => p.songId)
    .map((p) => `<button class="mb-num" data-action="scorer" data-id="${esc(p.number)}">${esc(p.number)}</button>`);

  return `
    <div class="mb-sheet">
      <h2 class="mb-sheet-title">Who scored?</h2>
      <div class="mb-nums">${numbers.join("")}</div>
      <button class="mb-btn mb-btn-gold mb-wide" data-action="team-goal">Team goal</button>
      <button class="mb-btn mb-wide" data-action="close-goal">Cancel</button>
    </div>
  `;
}

/**
 * Setup screen: add songs, then give each a moment and a hook.
 *
 * @param {object | null} now
 * @returns {string}
 */
function setupView(now) {
  const groups = [{ id: "", label: "No moment yet" }].concat(MOMENTS).map((m) => {
    const list = state.songs.filter((s) => (s.moment || "") === m.id);

    if (list.length === 0) {
      return "";
    }

    return `
      <h2 class="mb-rule"><span>${m.label}</span></h2>
      <ul class="mb-list">${list.map((s) => songRow(s, now)).join("")}</ul>
    `;
  });

  return `
    <section class="mb-add">
      <label class="mb-btn mb-btn-gold mb-wide" for="mb-file">
        ${state.adding ? esc(state.adding) : "Add songs"}
      </label>
      <p class="mb-hint">${state.songs.length} songs on this phone. Pick song files from the Files app. Songs downloaded in Apple Music won't open here; MP3s and iTunes purchases will.</p>
    </section>
    ${groups.join("")}
  `;
}

/**
 * One song in Setup. Tapping it opens the editor under it.
 *
 * @param {object} s
 * @param {object | null} now
 * @returns {string}
 */
function songRow(s, now) {
  const meta = s.moment
    ? `starts ${hookClock(s.start)} · ${lengthWords(s.length, s.moment)}`
    : "tap to set it up";

  const head = `
    <button class="mb-row" data-action="open" data-id="${esc(s.id)}">
      <span class="mb-row-name">${esc(s.name)}</span>
      <span class="mb-row-meta">${meta}</span>
    </button>
  `;

  if (state.open !== s.id) {
    return `<li>${head}</li>`;
  }

  const playingThis = now && now.song.id === s.id;

  const moments = [`<option value="">Pick a moment</option>`]
    .concat(MOMENTS.map((m) => `<option value="${m.id}"${s.moment === m.id ? " selected" : ""}>${m.label}</option>`));

  const lengths = LENGTH_CHOICES.map((v) => {
    return `<option value="${v}"${s.length === v ? " selected" : ""}>${lengthWords(v, s.moment)}</option>`;
  });

  const deleteLabel = state.armedDelete === s.id ? "Tap again to delete" : "Delete song";

  return `
    <li class="is-open">
      ${head}
      <div class="mb-edit">
        <label class="mb-field">Moment
          <select data-action="set-moment" data-id="${esc(s.id)}">${moments.join("")}</select>
        </label>
        <div class="mb-hook">
          <span class="mb-hook-label">Hook</span>
          <span class="mb-hook-time">${hookClock(s.start)}</span>
          <button class="mb-btn mb-small" data-action="nudge" data-id="${esc(s.id)}" data-by="-1">-1s</button>
          <button class="mb-btn mb-small" data-action="nudge" data-id="${esc(s.id)}" data-by="1">+1s</button>
        </div>
        <div class="mb-pair">
          <button class="mb-btn" data-action="preview" data-id="${esc(s.id)}">Play from start</button>
          <button class="mb-btn" data-action="test" data-id="${esc(s.id)}">Play from hook</button>
        </div>
        <button class="mb-btn mb-btn-gold mb-wide" data-action="mark" data-id="${esc(s.id)}"${playingThis ? "" : " disabled"}>
          ${playingThis ? "Mark hook here (" + hookClock(player.position()) + ")" : "Play the song, then mark the hook"}
        </button>
        <label class="mb-field">Plays for
          <select data-action="set-length" data-id="${esc(s.id)}">${lengths.join("")}</select>
        </label>
        <button class="mb-link" data-action="delete" data-id="${esc(s.id)}">${deleteLabel}</button>
      </div>
    </li>
  `;
}

/**
 * Players screen: jersey number, song, and the player's own hook.
 *
 * @param {object | null} now
 * @returns {string}
 */
function playersView(now) {
  if (state.songs.length === 0) {
    return `<section class="mb-empty"><p>Add songs in Setup first, then give players their goal songs here.</p></section>`;
  }

  const rows = state.players.map((p) => {
    const key = "p:" + p.number;
    const song = state.songs.find((s) => s.id === p.songId);
    const open = state.open === key;
    const playingThis = now && now.playerKey === key;

    const options = [`<option value="">Pick a song</option>`]
      .concat(state.songs.map((s) => `<option value="${esc(s.id)}"${p.songId === s.id ? " selected" : ""}>${esc(s.name)}</option>`));

    const meta = song ? `${esc(song.name)} · starts ${hookClock(p.start || 0)}` : "no song yet";

    const edit = !open ? "" : `
      <div class="mb-edit">
        <label class="mb-field">Goal song
          <select data-action="player-song" data-id="${esc(p.number)}">${options.join("")}</select>
        </label>
        <div class="mb-hook">
          <span class="mb-hook-label">Hook</span>
          <span class="mb-hook-time">${hookClock(p.start || 0)}</span>
          <button class="mb-btn mb-small" data-action="player-nudge" data-id="${esc(p.number)}" data-by="-1">-1s</button>
          <button class="mb-btn mb-small" data-action="player-nudge" data-id="${esc(p.number)}" data-by="1">+1s</button>
        </div>
        <div class="mb-pair">
          <button class="mb-btn" data-action="player-preview" data-id="${esc(p.number)}"${song ? "" : " disabled"}>Play from start</button>
          <button class="mb-btn" data-action="player-test" data-id="${esc(p.number)}"${song ? "" : " disabled"}>Play from hook</button>
        </div>
        <button class="mb-btn mb-btn-gold mb-wide" data-action="player-mark" data-id="${esc(p.number)}"${playingThis ? "" : " disabled"}>
          ${playingThis ? "Mark hook here (" + hookClock(player.position()) + ")" : "Play the song, then mark the hook"}
        </button>
        <button class="mb-link" data-action="player-remove" data-id="${esc(p.number)}">${state.armedDelete === key ? "Tap again to remove" : "Remove player"}</button>
      </div>
    `;

    return `
      <li class="${open ? "is-open" : ""}">
        <button class="mb-row" data-action="open" data-id="${esc(key)}">
          <span class="mb-row-name"><span class="mb-jersey">#${esc(p.number)}</span></span>
          <span class="mb-row-meta">${meta}</span>
        </button>
        ${edit}
      </li>
    `;
  });

  return `
    <section class="mb-add">
      <form class="mb-addplayer" data-action="add-player">
        <input type="number" inputmode="numeric" min="0" max="99" placeholder="Jersey #" name="number" required>
        <button class="mb-btn mb-btn-gold" type="submit">Add player</button>
      </form>
    </section>
    <h2 class="mb-rule"><span>Goal songs</span></h2>
    <ul class="mb-list">${rows.join("")}</ul>
  `;
}

/* ------------------------------------------------------------------ */
/* Actions                                                              */
/* ------------------------------------------------------------------ */

/**
 * Plays the next song for a moment.
 *
 * @param {string} momentId
 */
async function playMoment(momentId) {
  const moment = momentById(momentId);
  const song = nextSong(state.songs, momentId, state.lastPlayed[momentId] || null);

  if (!song) {
    say("error", `No songs on ${moment.label} yet. In Setup, open a song and pick ${moment.label} as its moment.`);
    return;
  }

  state.lastPlayed[momentId] = song.id;

  await safePlay(song, song.start, playLength(song), moment.label, { momentId });
}

/**
 * Plays a player's goal song from their hook.
 *
 * @param {string} number
 */
async function playScorer(number) {
  const p = state.players.find((x) => String(x.number) === String(number));
  const song = p && state.songs.find((s) => s.id === p.songId);

  if (!song) {
    say("error", `#${number} has no goal song. Pick one on the Players screen.`);
    return;
  }

  await safePlay(song, p.start || 0, PLAYER_SONG_LENGTH, "Goal #" + number, { momentId: "goal", playerKey: "p:" + number });
}

/**
 * Plays, and turns any failure into a message instead of silence.
 *
 * @param {object} song
 * @param {number} start
 * @param {number} length
 * @param {string} label
 * @param {object} [extra] fields copied onto player.now (momentId, playerKey)
 */
async function safePlay(song, start, length, label, extra) {
  try {
    await player.play(song, start, length, label);

    if (player.now && extra) {
      Object.assign(player.now, extra);
    }

    state.message = null;
    render();
  } catch (e) {
    say("error", `Couldn't play "${song.name}": ${e.message}`);
  }
}

/**
 * Saves picked files one at a time, showing progress.
 *
 * @param {FileList} files
 */
async function addFiles(files) {
  const list = Array.from(files);
  let added = 0;
  const failed = [];

  for (let i = 0; i < list.length; i++) {
    state.adding = `Saving ${i + 1} of ${list.length}...`;
    render();

    try {
      if (await store.addSong(list[i], songTitle(list[i].name))) {
        added++;
      }
    } catch (e) {
      failed.push(list[i].name);
    }
  }

  state.adding = null;
  state.songs = await store.allSongs();

  const kept = await store.askToKeep();
  const skipped = list.length - added - failed.length;
  let text = `Added ${added} ${added === 1 ? "song" : "songs"}.`;

  if (skipped > 0) {
    text += ` ${skipped} were already on this phone.`;
  }

  if (failed.length > 0) {
    text += ` Couldn't save: ${failed.join(", ")}. The phone may be out of space.`;
  }

  if (!kept) {
    text += " Add this page to your Home Screen so Safari doesn't clear the songs.";
  }

  say(failed.length > 0 ? "error" : "info", text);
}

/**
 * Updates one song's details and saves them.
 *
 * @param {string} id
 * @param {object} changes
 */
async function updateSong(id, changes) {
  const song = state.songs.find((s) => s.id === id);

  if (!song) {
    return;
  }

  // Draw first so the tap feels instant; the save finishes behind it.
  Object.assign(song, changes);
  render();
  await store.saveSong(song);
}

/**
 * Updates one player and saves the list.
 *
 * @param {string} number
 * @param {object} changes
 */
async function updatePlayer(number, changes) {
  const p = state.players.find((x) => String(x.number) === String(number));

  if (!p) {
    return;
  }

  Object.assign(p, changes);
  render();
  await store.savePlayers(state.players);
}

/**
 * Routes every button tap.
 *
 * @param {MouseEvent} event
 */
async function onClick(event) {
  const el = event.target.closest("[data-action]");

  if (!el || el.tagName === "SELECT" || el.tagName === "INPUT" || el.tagName === "FORM") {
    return;
  }

  const action = el.dataset.action;
  const id = el.dataset.id;

  // Any tap unlocks iPhone audio; it has to happen inside the tap itself.
  player.unlock();

  if (action !== "delete" && action !== "player-remove") {
    state.armedDelete = null;
  }

  if (action === "view") {
    state.view = id;
    state.open = null;
    state.message = null;
    render();
  } else if (action === "dismiss") {
    state.message = null;
    render();
  } else if (action === "stop") {
    await player.stop();
  } else if (action === "moment") {
    if (id === "goal" && state.players.some((p) => p.songId)) {
      state.goalSheet = true;
      render();
    } else {
      await playMoment(id);
    }
  } else if (action === "scorer") {
    state.goalSheet = false;
    await playScorer(id);
  } else if (action === "team-goal") {
    state.goalSheet = false;
    await playMoment("goal");
  } else if (action === "close-goal") {
    state.goalSheet = false;
    render();
  } else if (action === "open") {
    state.open = state.open === id ? null : id;
    render();
  } else if (action === "preview") {
    await safePlay(state.songs.find((s) => s.id === id), 0, 0, "Setup");
  } else if (action === "test") {
    const s = state.songs.find((x) => x.id === id);

    await safePlay(s, s.start, playLength(s), "Setup");
  } else if (action === "mark") {
    await updateSong(id, { start: Math.round(player.position() * 10) / 10 });
  } else if (action === "nudge") {
    const s = state.songs.find((x) => x.id === id);

    await updateSong(id, { start: Math.max(0, s.start + Number(el.dataset.by)) });
  } else if (action === "delete") {
    if (state.armedDelete === id) {
      state.armedDelete = null;
      state.open = null;
      state.songs = state.songs.filter((s) => s.id !== id);
      render();

      await store.deleteSong(id);
      state.players = await store.getPlayers();
    } else {
      state.armedDelete = id;
      render();
    }
  } else if (action === "player-preview" || action === "player-test") {
    const p = state.players.find((x) => String(x.number) === id);
    const s = state.songs.find((x) => x.id === p.songId);
    const from = action === "player-test" ? (p.start || 0) : 0;

    await safePlay(s, from, 0, "Setup", { playerKey: "p:" + id });
  } else if (action === "player-mark") {
    await updatePlayer(id, { start: Math.round(player.position() * 10) / 10 });
  } else if (action === "player-nudge") {
    const p = state.players.find((x) => String(x.number) === id);

    await updatePlayer(id, { start: Math.max(0, (p.start || 0) + Number(el.dataset.by)) });
  } else if (action === "player-remove") {
    const key = "p:" + id;

    if (state.armedDelete === key) {
      state.armedDelete = null;
      state.players = state.players.filter((x) => String(x.number) !== id);
      await store.savePlayers(state.players);
      render();
    } else {
      state.armedDelete = key;
      render();
    }
  }
}

/**
 * Handles the selects and the file picker.
 *
 * @param {Event} event
 */
async function onChange(event) {
  const el = event.target;
  const action = el.dataset.action;
  const id = el.dataset.id;

  if (action === "set-moment") {
    await updateSong(id, { moment: el.value });
    state.open = id;
    render();
  } else if (action === "set-length") {
    await updateSong(id, { length: Number(el.value) });
  } else if (action === "player-song") {
    await updatePlayer(id, { songId: el.value });
  }
}

/**
 * Adds a player from the jersey number form.
 *
 * @param {SubmitEvent} event
 */
async function onSubmit(event) {
  event.preventDefault();

  const input = event.target.elements.number;
  const number = String(Number(input.value));

  if (input.value === "" || Number.isNaN(Number(input.value))) {
    say("error", "Type a jersey number, like 12.");
    return;
  }

  if (state.players.some((p) => String(p.number) === number)) {
    say("error", `#${number} is already on the list. Tap it to change the song.`);
    return;
  }

  state.players.push({ number, songId: "", start: 0 });
  state.players.sort((a, b) => Number(a.number) - Number(b.number));
  state.open = "p:" + number;
  state.message = null;
  input.value = "";
  render();

  await store.savePlayers(state.players);
}

/**
 * Keeps the countdown and the "Mark hook here" time moving while a song plays.
 */
function tick() {
  if (!player.now) {
    return;
  }

  const line = document.getElementById("now-line");

  if (line) {
    line.innerHTML = nowLine(player.now);
  }

  const mark = app.querySelector('[data-action="mark"]:not([disabled]), [data-action="player-mark"]:not([disabled])');

  if (mark) {
    mark.textContent = "Mark hook here (" + hookClock(player.position()) + ")";
  }
}

/**
 * Loads saved songs and players, then draws the page.
 */
async function boot() {
  try {
    state.songs = await store.allSongs();
    state.players = await store.getPlayers();
  } catch (e) {
    state.message = { kind: "error", text: "This browser won't let the page save songs (private browsing?). Open it in a normal Safari tab." };
  }

  // The file picker lives outside #app so a redraw while the picker is
  // open (a song ending, say) can't throw away the files being picked.
  const picker = document.createElement("input");

  picker.type = "file";
  picker.id = "mb-file";
  picker.accept = "audio/*,.m4a,.mp3";
  picker.multiple = true;
  picker.hidden = true;

  picker.addEventListener("change", async () => {
    if (picker.files.length > 0) {
      await addFiles(picker.files);
    }

    picker.value = "";
  });

  document.body.appendChild(picker);

  app.addEventListener("click", onClick);
  app.addEventListener("change", onChange);
  app.addEventListener("submit", onSubmit);

  setInterval(tick, 250);
  render();
}

boot();
