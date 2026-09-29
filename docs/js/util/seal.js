/**
 * Sealing and unlocking the Coaches report.
 *
 * The report names players and the repo is public, so the copy in the repo
 * is sealed: scrambled with a key made from a passphrase. tools/seal.mjs
 * seals the report on the manager's Mac; the staff page unlocks it in the
 * browser. Both run this same file, so the two sides cannot drift apart.
 *
 * A sealed file, all bytes:
 *
 *   "CTR1" (4)  |  salt (16)  |  nonce (12)  |  the scrambled report
 *
 * The key is PBKDF2 over the passphrase (SHA-256, 210,000 rounds, the
 * file's own salt). The scramble is AES-256-GCM, which checks itself: a
 * wrong passphrase fails cleanly instead of coming out as garbage.
 *
 * Runs anywhere Web Crypto exists: every current browser, and Node 20+.
 * See ARCHITECTURE.md, "Coaches report".
 */

/** The first four bytes of every sealed file: "CTR1". */
var MAGIC = [67, 84, 82, 49];

/** PBKDF2 rounds. About a tenth of a second on a phone. */
var ROUNDS = 210000;

var SALT_BYTES = 16;
var NONCE_BYTES = 12;
var HEADER_BYTES = MAGIC.length + SALT_BYTES + NONCE_BYTES;

var subtle = globalThis.crypto.subtle;

/**
 * The AES key for a passphrase and a salt.
 *
 * @param {string} passphrase
 * @param {Uint8Array} salt
 * @returns {Promise<CryptoKey>}
 */
function keyFor(passphrase, salt) {
  var raw = new TextEncoder().encode(passphrase.normalize("NFKC"));

  return subtle
    .importKey("raw", raw, "PBKDF2", false, ["deriveKey"])
    .then(function (base) {
      return subtle.deriveKey(
        { name: "PBKDF2", hash: "SHA-256", salt: salt, iterations: ROUNDS },
        base,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
      );
    });
}

/**
 * Whether some bytes look like a sealed file: long enough, and starting
 * with the magic.
 *
 * @param {Uint8Array} bytes
 * @returns {boolean}
 */
function isSealed(bytes) {
  if (!bytes || bytes.length < HEADER_BYTES + 16) {
    return false;
  }

  for (var i = 0; i < MAGIC.length; i++) {
    if (bytes[i] !== MAGIC[i]) {
      return false;
    }
  }

  return true;
}

/**
 * Seals text with a passphrase. A fresh salt and nonce every time, so
 * sealing the same report twice gives two different files.
 *
 * @param {string} text - The report.
 * @param {string} passphrase
 * @returns {Promise<Uint8Array>} The sealed file's bytes.
 */
function seal(text, passphrase) {
  var salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  var nonce = globalThis.crypto.getRandomValues(new Uint8Array(NONCE_BYTES));

  return keyFor(passphrase, salt)
    .then(function (key) {
      return subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, new TextEncoder().encode(text));
    })
    .then(function (scrambled) {
      var body = new Uint8Array(scrambled);
      var out = new Uint8Array(HEADER_BYTES + body.length);

      out.set(MAGIC, 0);
      out.set(salt, MAGIC.length);
      out.set(nonce, MAGIC.length + SALT_BYTES);
      out.set(body, HEADER_BYTES);

      return out;
    });
}

/**
 * Unlocks a sealed file.
 *
 * @param {Uint8Array} bytes - The sealed file.
 * @param {string} passphrase
 * @returns {Promise<string>} The report. Rejects with an Error whose
 *   message is "not sealed" when the bytes are not a sealed file, and
 *   "wrong passphrase" when the passphrase does not open it.
 */
function unlock(bytes, passphrase) {
  if (!isSealed(bytes)) {
    return Promise.reject(new Error("not sealed"));
  }

  var salt = bytes.slice(MAGIC.length, MAGIC.length + SALT_BYTES);
  var nonce = bytes.slice(MAGIC.length + SALT_BYTES, HEADER_BYTES);
  var body = bytes.slice(HEADER_BYTES);

  return keyFor(passphrase, salt)
    .then(function (key) {
      return subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, body);
    })
    .then(
      function (plain) {
        return new TextDecoder().decode(plain);
      },
      function () {
        throw new Error("wrong passphrase");
      }
    );
}

export { seal, unlock, isSealed };
