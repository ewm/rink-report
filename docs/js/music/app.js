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
  open: null,          // id of the song (or "p:<number>" player) being edited
  goalSheet: false,
  lastPlayed: {},      // moment id -> song id, for rotation
  armedDelete: null,   // id waiting for its second "delete" tap
  message: null,       // { kind: "error" | "info", text }
  adding: null         // "Saving 3 of 19..." while files are being stored
};

const player = new FilePlayer(store.getAudio, () => render());

/** Small line icons, drawn in the current text color. */
const ICON = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>',
  stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none"/></svg>',
  minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
  flag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V4M6 4h11l-2 4 2 4H6" stroke="currentColor" stroke-width="2" stroke-linejoin="round" fill="none"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg>'
};

/** Animated bars shown on whatever is playing. */
const BARS = '<span class="mb-bars" aria-hidden="true"><i></i><i></i><i></i></span>';

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
 * Short words for a length setting, for the chips.
 *
 * @param {number} value
 * @param {string} momentId
 * @returns {string}
 */
function lengthWords(value, momentId) {
  if (value === -1) {
    return "Whole song";
  }

  if (value > 0) {
    return value + "s";
  }

  const m = momentById(momentId);

  if (m && m.length > 0) {
    return "Default " + m.length + "s";
  }

  return "Default (whole)";
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
      <div class="mb-titles">
        <span class="mb-eyebrow">Wings staff</span>
        <h1 class="mb-title">Rink Music</h1>
      </div>
      <nav class="mb-seg" role="tablist">
        ${tab("game", "Game")}
        ${tab("setup", "Setup")}
        ${tab("players", "Players")}
      </nav>
    </header>
    ${state.message ? messageHtml() : ""}
    <main class="mb-main">
      ${state.view === "game" ? gameView(now) : ""}
      ${state.view === "setup" ? setupView(now) : ""}
      ${state.view === "players" ? playersView(now) : ""}
    </main>
    ${state.goalSheet ? goalSheet() : ""}
    <footer class="mb-now${now ? " is-live" : ""}">
      <div class="mb-progress"><span id="now-bar"></span></div>
      <div class="mb-now-row">
        <p class="mb-now-line" id="now-line">${nowLine(now)}</p>
        <button class="mb-stop" data-action="stop">${ICON.stop}<span>Stop</span></button>
      </div>
    </footer>
  `;

  tick();
}

/**
 * The message banner. Tap anywhere on it to dismiss.
 *
 * @returns {string}
 */
function messageHtml() {
  return `
    <p class="mb-msg mb-msg-${state.message.kind}" data-action="dismiss">
      <span>${esc(state.message.text)}</span>
      <span class="mb-msg-x">${ICON.close}</span>
    </p>
  `;
}

/**
 * One segment of the Game / Setup / Players switch.
 *
 * @param {string} id
 * @param {string} label
 * @returns {string}
 */
function tab(id, label) {
  const on = state.view === id ? " is-on" : "";

  return `<button class="mb-tab${on}" role="tab" data-action="view" data-id="${id}">${label}</button>`;
}

/**
 * The footer's "what's playing" text.
 *
 * @param {object | null} now
 * @returns {string}
 */
function nowLine(now) {
  if (!now) {
    return `<span class="mb-now-label">Ready</span><span class="mb-now-song mb-quiet">Nothing playing</span>`;
  }

  let left = "";

  if (now.length > 0) {
    const gone = (Date.now() - now.startedAt) / 1000;

    left = `<span class="mb-left">${clock(now.length - gone)}</span>`;
  }

  return `<span class="mb-now-label">${esc(now.label)}${left}</span><span class="mb-now-song">${esc(now.song.name)}</span>`;
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
        <p class="mb-empty-title">No songs on this phone yet</p>
        <p class="mb-quiet">Add a few in Setup and give each one a moment.</p>
        <button class="mb-btn mb-btn-primary" data-action="view" data-id="setup">${ICON.plus}<span>Add songs</span></button>
      </section>
    `;
  }

  const tiles = MOMENTS.map((m) => {
    const count = songsForMoment(state.songs, m.id).length;
    const playing = now && now.momentId === m.id;
    const scorers = state.players.filter((p) => p.songId).length;

    let sub = count + (count === 1 ? " song" : " songs");

    if (m.id === "goal" && scorers > 0) {
      sub += " · " + scorers + (scorers === 1 ? " player song" : " player songs");
    }

    const cls = [
      "mb-tile",
      m.id === "goal" ? "mb-tile-goal" : "",
      playing ? "is-playing" : "",
      count === 0 && !(m.id === "goal" && scorers > 0) ? "is-empty" : ""
    ].join(" ");

    return `
      <button class="${cls}" data-action="moment" data-id="${m.id}">
        ${playing ? BARS : ""}
        <span class="mb-tile-name">${m.label}</span>
        <span class="mb-tile-sub">${sub}</span>
      </button>
    `;
  });

  return `<section class="mb-board">${tiles.join("")}</section>`;
}

/**
 * The "who scored?" sheet that slides up from GOAL.
 *
 * @returns {string}
 */
function goalSheet() {
  const numbers = state.players
    .filter((p) => p.songId)
    .map((p) => `<button class="mb-num" data-action="scorer" data-id="${esc(p.number)}">${esc(p.number)}</button>`);

  return `
    <div class="mb-scrim" data-action="close-goal"></div>
    <div class="mb-sheet" role="dialog" aria-label="Who scored?">
      <span class="mb-grab"></span>
      <h2 class="mb-sheet-title">Who scored?</h2>
      <div class="mb-nums">${numbers.join("")}</div>
      <button class="mb-btn mb-btn-primary mb-wide" data-action="team-goal">Team goal</button>
      <button class="mb-btn mb-btn-ghost mb-wide" data-action="close-goal">Cancel</button>
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
  const groups = [{ id: "", label: "Needs a moment" }].concat(MOMENTS).map((m) => {
    const list = state.songs.filter((s) => (s.moment || "") === m.id);

    if (list.length === 0) {
      return "";
    }

    return `
      <h2 class="mb-group-title">${m.label} <span class="mb-quiet">${list.length}</span></h2>
      <ul class="mb-list">${list.map((s) => songRow(s, now)).join("")}</ul>
    `;
  });

  return `
    <section class="mb-add">
      <label class="mb-btn mb-btn-primary mb-wide" for="mb-file">
        ${ICON.plus}<span>${state.adding ? esc(state.adding) : "Add songs"}</span>
      </label>
      <p class="mb-hint">${state.songs.length} ${state.songs.length === 1 ? "song" : "songs"} on this phone. MP3s and iTunes purchases work. Songs downloaded in Apple Music won't open here.</p>
    </section>
    ${groups.join("")}
  `;
}

/**
 * The shared hook editor: big time, minus and plus, play buttons, mark.
 *
 * @param {object} o
 * @param {number} o.start
 * @param {boolean} o.playing whether this song is the one playing now
 * @param {boolean} o.ready whether there is a song to play
 * @param {string} o.prefix "" for songs, "player-" for players
 * @param {string} o.id
 * @returns {string}
 */
function hookEditor(o) {
  const id = esc(o.id);
  const off = o.ready ? "" : " disabled";

  return `
    <div class="mb-hook">
      <div class="mb-hook-read">
        <span class="mb-label">Starts at</span>
        <span class="mb-hook-time">${hookClock(o.start)}</span>
      </div>
      <button class="mb-round" data-action="${o.prefix}nudge" data-id="${id}" data-by="-1" aria-label="1 second earlier">${ICON.minus}</button>
      <button class="mb-round" data-action="${o.prefix}nudge" data-id="${id}" data-by="1" aria-label="1 second later">${ICON.plus}</button>
    </div>
    <div class="mb-pair">
      <button class="mb-btn" data-action="${o.prefix}preview" data-id="${id}"${off}>${ICON.play}<span>From start</span></button>
      <button class="mb-btn" data-action="${o.prefix}test" data-id="${id}"${off}>${ICON.play}<span>From hook</span></button>
    </div>
    <button class="mb-btn mb-btn-primary mb-wide" data-action="${o.prefix}mark" data-id="${id}"${o.playing ? "" : " disabled"}>
      ${ICON.flag}<span class="mb-mark-text">${o.playing ? "Mark hook at " + hookClock(player.position()) : "Play it, then mark the hook"}</span>
    </button>
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
  const open = state.open === s.id;
  const playingThis = now && now.song.id === s.id && !now.playerKey;

  const meta = s.moment
    ? `${hookClock(s.start)} · ${lengthWords(s.length, s.moment)}`
    : "Tap to set up";

  const head = `
    <button class="mb-row${open ? " is-open" : ""}" data-action="open" data-id="${esc(s.id)}">
      <span class="mb-row-text">
        <span class="mb-row-name">${esc(s.name)}</span>
        <span class="mb-row-meta">${meta}</span>
      </span>
      ${playingThis ? BARS : `<span class="mb-chev">${ICON.chevron}</span>`}
    </button>
  `;

  if (!open) {
    return `<li>${head}</li>`;
  }

  const moments = MOMENTS.map((m) => {
    const on = s.moment === m.id ? " is-on" : "";

    return `<button class="mb-chip${on}" data-action="set-moment" data-id="${esc(s.id)}" data-value="${m.id}">${m.label}</button>`;
  });

  // Skip the plain chip that matches the moment's default ("25s" next to
  // "Default 25s" is the same thing twice).
  const moment = momentById(s.moment);
  const shown = LENGTH_CHOICES.filter((v) => !(moment && v > 0 && v === moment.length));

  const lengths = shown.map((v) => {
    const on = s.length === v ? " is-on" : "";

    return `<button class="mb-chip${on}" data-action="set-length" data-id="${esc(s.id)}" data-value="${v}">${lengthWords(v, s.moment)}</button>`;
  });

  const deleteLabel = state.armedDelete === s.id ? "Tap again to delete" : "Delete song";

  return `
    <li class="is-open">
      ${head}
      <div class="mb-edit">
        <span class="mb-label">Moment</span>
        <div class="mb-chips">${moments.join("")}</div>
        ${hookEditor({ start: s.start, playing: playingThis, ready: true, prefix: "", id: s.id })}
        <span class="mb-label">Plays for</span>
        <div class="mb-chips">${lengths.join("")}</div>
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
    return `
      <section class="mb-empty">
        <p class="mb-empty-title">Add songs first</p>
        <p class="mb-quiet">Then give each player a goal song here.</p>
      </section>
    `;
  }

  const rows = state.players.map((p) => {
    const key = "p:" + p.number;
    const song = state.songs.find((s) => s.id === p.songId);
    const open = state.open === key;
    const playingThis = now && now.playerKey === key;

    const options = [`<option value="">Pick a song</option>`]
      .concat(state.songs.map((s) => `<option value="${esc(s.id)}"${p.songId === s.id ? " selected" : ""}>${esc(s.name)}</option>`));

    const meta = song ? `${esc(song.name)} · ${hookClock(p.start || 0)}` : "No song yet";

    const edit = !open ? "" : `
      <div class="mb-edit">
        <label class="mb-label" for="ps-${esc(p.number)}">Goal song</label>
        <select class="mb-select" id="ps-${esc(p.number)}" data-action="player-song" data-id="${esc(p.number)}">${options.join("")}</select>
        ${hookEditor({ start: p.start || 0, playing: playingThis, ready: Boolean(song), prefix: "player-", id: p.number })}
        <button class="mb-link" data-action="player-remove" data-id="${esc(p.number)}">${state.armedDelete === key ? "Tap again to remove" : "Remove player"}</button>
      </div>
    `;

    return `
      <li class="${open ? "is-open" : ""}">
        <button class="mb-row${open ? " is-open" : ""}" data-action="open" data-id="${esc(key)}">
          <span class="mb-jersey">${esc(p.number)}</span>
          <span class="mb-row-text">
            <span class="mb-row-name">#${esc(p.number)}</span>
            <span class="mb-row-meta">${meta}</span>
          </span>
          ${playingThis ? BARS : `<span class="mb-chev">${ICON.chevron}</span>`}
        </button>
        ${edit}
      </li>
    `;
  });

  return `
    <section class="mb-add">
      <form class="mb-addplayer" data-action="add-player">
        <input type="number" inputmode="numeric" min="0" max="99" placeholder="Jersey #" name="number" aria-label="Jersey number" required>
        <button class="mb-btn mb-btn-primary" type="submit">${ICON.plus}<span>Add</span></button>
      </form>
    </section>
    ${state.players.length ? `<h2 class="mb-group-title">Goal songs <span class="mb-quiet">${state.players.length}</span></h2><ul class="mb-list">${rows.join("")}</ul>` : ""}
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
  } else if (action === "set-moment") {
    await updateSong(id, { moment: el.dataset.value });
  } else if (action === "set-length") {
    await updateSong(id, { length: Number(el.dataset.value) });
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

  if (action === "player-song") {
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
 * Keeps the countdown, the progress bar and the "Mark hook" time moving
 * while a song plays.
 */
function tick() {
  const bar = document.getElementById("now-bar");
  const now = player.now;

  if (!now) {
    if (bar) {
      bar.style.width = "0%";
    }

    return;
  }

  const line = document.getElementById("now-line");

  if (line) {
    line.innerHTML = nowLine(now);
  }

  if (bar) {
    bar.style.width = (progress(now) * 100).toFixed(1) + "%";
  }

  const mark = app.querySelector('[data-action$="mark"]:not([disabled]) .mb-mark-text');

  if (mark) {
    mark.textContent = "Mark hook at " + hookClock(player.position());
  }
}

/**
 * How far through its play time the current song is, 0 to 1. Uses the
 * song's length when it has one, else the rest of the song.
 *
 * @param {object} now
 * @returns {number}
 */
function progress(now) {
  const gone = (Date.now() - now.startedAt) / 1000;

  if (now.length > 0) {
    return Math.min(1, gone / now.length);
  }

  const total = player.duration() - now.start;

  return total > 0 ? Math.min(1, gone / total) : 0;
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
