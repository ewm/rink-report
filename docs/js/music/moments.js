/**
 * The game moments the music board has a button for, and the rule that
 * picks which song a button plays next.
 *
 * No DOM, no audio: everything here is plain data so the tests can run it
 * in Node.
 */

/**
 * One button per moment, in the order they appear on the Game screen.
 * `length` is the default number of seconds a song plays before it fades
 * out by itself (0 = play to the end). A song can override it in Setup.
 */
export const MOMENTS = [
  { id: "goal",         label: "Goal",          length: 25 },
  { id: "whistle",      label: "Whistle",       length: 25 },
  { id: "warmup",       label: "Warmup",        length: 0 },
  { id: "powerplay",    label: "Power play",    length: 25 },
  { id: "penaltykill",  label: "Penalty kill",  length: 25 },
  { id: "timeout",      label: "Timeout",       length: 45 },
  { id: "intermission", label: "Intermission",  length: 0 },
  { id: "push",         label: "The push",      length: 25 },
  { id: "win",          label: "Win",           length: 0 }
];

/** Seconds a player's goal song plays when no length is set on the song. */
export const PLAYER_SONG_LENGTH = 25;

/** Choices offered for a song's length in Setup. 0 means "default for its moment". */
export const LENGTH_CHOICES = [0, 15, 20, 25, 30, 45, 60, -1];

/**
 * Finds a moment by id.
 *
 * @param {string} id
 * @returns {{id: string, label: string, length: number} | undefined}
 */
export function momentById(id) {
  return MOMENTS.find((m) => m.id === id);
}

/**
 * The songs assigned to a moment, in the order they were added.
 *
 * @param {Array<{id: string, moment: string, addedAt: number}>} songs
 * @param {string} momentId
 * @returns {Array} songs for that moment, oldest first
 */
export function songsForMoment(songs, momentId) {
  return songs
    .filter((s) => s.moment === momentId)
    .sort((a, b) => a.addedAt - b.addedAt);
}

/**
 * Picks the next song for a moment so the same song doesn't play twice in
 * a row. Walks the moment's songs in order and wraps at the end.
 *
 * @param {Array} songs every song in the library
 * @param {string} momentId
 * @param {string | null} lastId id of the song this moment played last time
 * @returns {object | null} the song to play, or null if the moment has none
 */
export function nextSong(songs, momentId, lastId) {
  const list = songsForMoment(songs, momentId);

  if (list.length === 0) {
    return null;
  }

  const lastIndex = list.findIndex((s) => s.id === lastId);

  return list[(lastIndex + 1) % list.length];
}

/**
 * How many seconds a song should play before it fades out by itself.
 * A song's own length wins; -1 means "play to the end"; 0 means use the
 * moment's default.
 *
 * @param {{length?: number, moment?: string}} song
 * @param {number} [fallback] used when the song has no moment (player songs)
 * @returns {number} seconds, or 0 for "play to the end"
 */
export function playLength(song, fallback) {
  if (song.length === -1) {
    return 0;
  }

  if (song.length > 0) {
    return song.length;
  }

  if (fallback !== undefined) {
    return fallback;
  }

  const moment = momentById(song.moment);

  return moment ? moment.length : 0;
}

/**
 * Turns a file name like "05 I Gotta Feeling.m4a" into "I Gotta Feeling".
 *
 * @param {string} fileName
 * @returns {string}
 */
export function songTitle(fileName) {
  return fileName
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/^\d{1,2}(-\d{1,2})?\s+/, "")
    .trim();
}

/**
 * Formats seconds as m:ss.
 *
 * @param {number} seconds
 * @returns {string}
 */
export function clock(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  const m = Math.floor(whole / 60);
  const s = whole % 60;

  return m + ":" + String(s).padStart(2, "0");
}
