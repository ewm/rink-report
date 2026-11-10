/**
 * Keeps the music board's songs and setup on this phone, in IndexedDB.
 *
 * Two stores so editing a song's hook never rewrites its audio:
 *   songs  { id, name, moment, start, length, addedAt }   small, edited often
 *   audio  { id, blob }                                   big, written once
 * plus `players` (jersey number -> song id) under the "settings" store.
 *
 * Concept-test version: everything lives on this one phone. The plan moves
 * the setup to a Music tab in the team sheet later; the audio stays here.
 */

const DB_NAME = "rink-music";
const DB_VERSION = 1;

let dbPromise = null;

/**
 * Opens (and on first use creates) the database.
 *
 * @returns {Promise<IDBDatabase>}
 */
function open() {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      db.createObjectStore("songs", { keyPath: "id" });
      db.createObjectStore("audio", { keyPath: "id" });
      db.createObjectStore("settings");
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return dbPromise;
}

/**
 * Runs one request against a store and resolves with its result.
 *
 * @param {string} storeName
 * @param {"readonly" | "readwrite"} mode
 * @param {(store: IDBObjectStore) => IDBRequest} make
 * @returns {Promise<any>}
 */
async function run(storeName, mode, make) {
  const db = await open();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const req = make(tx.objectStore(storeName));

    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/**
 * Asks the browser not to clear this site's storage when space runs low.
 * Safari may still say no; the answer is returned so the page can warn.
 *
 * @returns {Promise<boolean>}
 */
export async function askToKeep() {
  if (!navigator.storage || !navigator.storage.persist) {
    return false;
  }

  // Some browsers sit on this question forever; give up after 2 seconds.
  const giveUp = new Promise((resolve) => setTimeout(() => resolve(false), 2000));

  try {
    return await Promise.race([navigator.storage.persist(), giveUp]);
  } catch (e) {
    return false;
  }
}

/**
 * Every song's details (no audio), oldest first.
 *
 * @returns {Promise<Array>}
 */
export async function allSongs() {
  const list = await run("songs", "readonly", (s) => s.getAll());

  return list.sort((a, b) => a.addedAt - b.addedAt);
}

/**
 * Saves a song file. A file with the same name and size is the same song
 * and is skipped, so picking the folder twice doesn't make duplicates.
 *
 * @param {File} file
 * @param {string} title display name
 * @returns {Promise<boolean>} true if it was new
 */
export async function addSong(file, title) {
  const id = file.name + "|" + file.size;
  const existing = await run("songs", "readonly", (s) => s.get(id));

  if (existing) {
    return false;
  }

  // Copy into a plain Blob: some Safari versions lose a File's data once
  // the picker that produced it is gone.
  const blob = new Blob([await file.arrayBuffer()], { type: file.type || "audio/mp4" });

  await run("audio", "readwrite", (s) => s.put({ id, blob }));

  await run("songs", "readwrite", (s) => s.put({
    id,
    name: title,
    moment: "",
    start: 0,
    length: 0,
    addedAt: Date.now()
  }));

  return true;
}

/**
 * Saves changes to a song's details (moment, start, length).
 *
 * @param {object} song the full song record
 * @returns {Promise<void>}
 */
export async function saveSong(song) {
  await run("songs", "readwrite", (s) => s.put(song));
}

/**
 * Removes a song and its audio. Player songs pointing at it are cleared.
 *
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteSong(id) {
  await run("songs", "readwrite", (s) => s.delete(id));
  await run("audio", "readwrite", (s) => s.delete(id));

  const players = await getPlayers();
  const kept = players.map((p) => (p.songId === id ? { ...p, songId: "" } : p));

  await savePlayers(kept);
}

/**
 * The audio for one song.
 *
 * @param {string} id
 * @returns {Promise<Blob | null>}
 */
export async function getAudio(id) {
  const row = await run("audio", "readonly", (s) => s.get(id));

  return row ? row.blob : null;
}

/**
 * Players with goal songs: [{ number, songId, start, length }].
 * `start` and `length` here are the player's own hook, so one song can be
 * used by two kids with different start points.
 *
 * @returns {Promise<Array>}
 */
export async function getPlayers() {
  const list = await run("settings", "readonly", (s) => s.get("players"));

  return Array.isArray(list) ? list : [];
}

/**
 * Saves the player list, sorted by jersey number.
 *
 * @param {Array} players
 * @returns {Promise<void>}
 */
export async function savePlayers(players) {
  const sorted = [...players].sort((a, b) => Number(a.number) - Number(b.number));

  await run("settings", "readwrite", (s) => s.put(sorted, "players"));
}
