/**
 * Plays one song at a time from a start point, with fades.
 *
 * This is the one piece that changes when the board moves to Apple Music:
 * swap this file for one built on MusicKit that has the same methods
 * (unlock, play, fadeOut, stop, preview, position) and nothing else moves.
 *
 * Fades go through the Web Audio API because iPhone Safari ignores
 * audio.volume (it is read-only on iOS).
 */

/** Seconds to fade out the old song when a new button is tapped. */
const SWITCH_FADE = 0.7;

/** Seconds to fade out when STOP is tapped. */
const STOP_FADE = 0.3;

/** Seconds to fade out when a song reaches its length on its own. */
const END_FADE = 2;

/** Seconds to fade in, so the hook doesn't start with a click. */
const START_FADE = 0.08;

export class FilePlayer {

  /**
   * @param {(id: string) => Promise<Blob | null>} loadAudio gets a song's audio
   * @param {(state: object) => void} onChange called whenever what's playing changes
   */
  constructor(loadAudio, onChange) {
    this.loadAudio = loadAudio;
    this.onChange = onChange;

    this.el = new Audio();
    this.el.preload = "auto";
    this.el.setAttribute("playsinline", "");

    this.ctx = null;
    this.gain = null;
    this.url = null;

    // Bumped on every play/stop so an old timer can't touch a newer song.
    this.token = 0;
    this.endTimer = null;

    this.now = null;
    this.primed = false;

    this.el.addEventListener("ended", () => this.finish(this.token));
  }

  /**
   * Starts the audio engine. Must run inside a tap: iPhone won't make
   * sound from a page until the person has touched it.
   */
  unlock() {
    if (navigator.audioSession) {
      // Plays even with the ringer switch on silent (Safari 16.4+).
      navigator.audioSession.type = "playback";
    }

    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;

      this.ctx = new Ctx();
      this.gain = this.ctx.createGain();
      this.ctx.createMediaElementSource(this.el).connect(this.gain);
      this.gain.connect(this.ctx.destination);
    }

    if (this.ctx.state !== "running") {
      this.ctx.resume();
    }

    // iPhone only lets an audio element play later, after awaits, if it
    // has already played once inside a tap. A blip of silence does that.
    if (!this.primed) {
      this.primed = true;
      this.el.src = silentWav();
      this.el.play().catch(() => {});
    }
  }

  /**
   * Plays a song from its hook. Fades out whatever is playing first.
   *
   * @param {{id: string, name: string}} song
   * @param {number} start seconds into the song to begin
   * @param {number} length seconds to play before fading, 0 = to the end
   * @param {string} label what to show as the moment (e.g. "Whistle", "#12")
   * @returns {Promise<void>}
   */
  async play(song, start, length, label) {
    this.unlock();

    const token = ++this.token;

    clearTimeout(this.endTimer);

    if (this.now) {
      await this.ramp(0, SWITCH_FADE);

      if (token !== this.token) {
        return;
      }
    }

    const blob = await this.loadAudio(song.id);

    if (!blob) {
      throw new Error("The audio for \"" + song.name + "\" is missing on this phone. Add the song again in Setup.");
    }

    await this.load(blob);

    if (token !== this.token) {
      return;
    }

    this.el.currentTime = start;
    this.gain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.gain.gain.setValueAtTime(0, this.ctx.currentTime);

    await this.el.play();

    this.gain.gain.linearRampToValueAtTime(1, this.ctx.currentTime + START_FADE);

    this.now = { song, label, start, length, startedAt: Date.now() };
    this.onChange(this.now);

    if (length > 0) {
      this.endTimer = setTimeout(() => this.fadeOut(END_FADE, token), length * 1000);
    }
  }

  /**
   * Plays a song from 0 at full volume, for finding the hook in Setup.
   *
   * @param {{id: string, name: string}} song
   * @param {number} [from] seconds to start at
   * @returns {Promise<void>}
   */
  async preview(song, from) {
    await this.play(song, from || 0, 0, "Setup");
  }

  /**
   * Fast fade, for the puck drop.
   *
   * @returns {Promise<void>}
   */
  async stop() {
    await this.fadeOut(STOP_FADE, this.token);
  }

  /**
   * Fades the current song out and stops it.
   *
   * @param {number} seconds
   * @param {number} token only acts if no newer song has started
   * @returns {Promise<void>}
   */
  async fadeOut(seconds, token) {
    if (token !== this.token || !this.now) {
      return;
    }

    await this.ramp(0, seconds);
    this.finish(token);
  }

  /**
   * Seconds into the current song, for "Mark hook here".
   *
   * @returns {number}
   */
  position() {
    return this.el.currentTime || 0;
  }

  /**
   * Clears the playing state once a song has stopped.
   *
   * @param {number} token
   */
  finish(token) {
    if (token !== this.token || !this.now) {
      return;
    }

    clearTimeout(this.endTimer);
    this.el.pause();
    this.now = null;
    this.onChange(null);
  }

  /**
   * Moves the volume to a level over a number of seconds.
   *
   * @param {number} to 0 to 1
   * @param {number} seconds
   * @returns {Promise<void>}
   */
  ramp(to, seconds) {
    if (!this.gain) {
      return Promise.resolve();
    }

    const g = this.gain.gain;
    const t = this.ctx.currentTime;

    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(to, t + seconds);

    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }

  /**
   * Points the audio element at a song and waits until it can seek.
   *
   * @param {Blob} blob
   * @returns {Promise<void>}
   */
  load(blob) {
    if (this.url) {
      URL.revokeObjectURL(this.url);
    }

    this.url = URL.createObjectURL(blob);

    return new Promise((resolve, reject) => {
      const ok = () => {
        cleanup();
        resolve();
      };

      const bad = () => {
        cleanup();
        reject(new Error("This phone couldn't open that song file."));
      };

      const cleanup = () => {
        this.el.removeEventListener("loadedmetadata", ok);
        this.el.removeEventListener("error", bad);
      };

      this.el.addEventListener("loadedmetadata", ok);
      this.el.addEventListener("error", bad);
      this.el.src = this.url;
      this.el.load();
    });
  }
}

/**
 * A tenth of a second of silence as a WAV data URL, used to unlock audio.
 *
 * @returns {string}
 */
function silentWav() {
  const rate = 8000;
  const samples = rate / 10;
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);

  const text = (offset, str) => {
    for (let i = 0; i < str.length; i++) {
      bytes[offset + i] = str.charCodeAt(i);
    }
  };

  text(0, "RIFF");
  view.setUint32(4, 36 + samples, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  text(36, "data");
  view.setUint32(40, samples, true);
  bytes.fill(128, 44);

  let binary = "";

  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return "data:audio/wav;base64," + btoa(binary);
}
