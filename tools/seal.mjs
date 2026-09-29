/**
 * Seals the Coaches report for the staff page.
 *
 *   node tools/seal.mjs <report.txt>
 *   node tools/seal.mjs <report.txt> --out docs/<team>/data/coaches-corner.enc
 *   node tools/seal.mjs --check                (unlocks the sealed file and prints its first line)
 *
 * The passphrase comes from a file that is NOT in the repo. By default that
 * is staff-passphrase.txt one folder above the repo (the Youth Hockey
 * folder on Eric's Mac); --key <file> or SEAL_KEY_FILE points elsewhere.
 * The plain-text report never goes into the repo either: seal it, upload
 * the .enc, keep the .txt where it was.
 *
 * Needs Node 20 or newer (for Web Crypto). No packages.
 * See ARCHITECTURE.md, "Coaches report".
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { seal, unlock } from "../docs/js/util/seal.js";

var REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
var DEFAULT_OUT = path.join(REPO, "docs", "wswings12u", "data", "coaches-corner.enc");
var DEFAULT_KEY = process.env.SEAL_KEY_FILE || path.join(REPO, "..", "staff-passphrase.txt");

/**
 * The command line, picked apart.
 *
 * @param {string[]} argv
 * @returns {{report: string|null, out: string, key: string, check: boolean}}
 */
function parseArgs(argv) {
  var opts = { report: null, out: DEFAULT_OUT, key: DEFAULT_KEY, check: false };

  for (var i = 0; i < argv.length; i++) {
    var a = argv[i];

    if (a === "--out") {
      opts.out = path.resolve(argv[++i] || "");
    } else if (a === "--key") {
      opts.key = path.resolve(argv[++i] || "");
    } else if (a === "--check") {
      opts.check = true;
    } else {
      opts.report = path.resolve(a);
    }
  }

  return opts;
}

/**
 * Stops with a message that says what is wrong and what to do.
 *
 * @param {string} msg
 */
function fail(msg) {
  console.error("seal: " + msg);
  process.exit(1);
}

/**
 * The passphrase from the key file, trimmed.
 *
 * @param {string} file
 * @returns {string}
 */
function readPassphrase(file) {
  if (!fs.existsSync(file)) {
    fail(
      "no passphrase file at " +
        file +
        ". Put the staff passphrase on one line in that file (it stays out of the repo), or point at it with --key <file>."
    );
  }

  var pass = fs.readFileSync(file, "utf8").trim();

  if (pass.length < 8) {
    fail("the passphrase in " + file + " is under 8 characters. Use something longer.");
  }

  return pass;
}

var opts = parseArgs(process.argv.slice(2));
var pass = readPassphrase(opts.key);

if (opts.check) {
  if (!fs.existsSync(opts.out)) {
    fail("nothing to check: " + opts.out + " does not exist yet. Seal a report first.");
  }

  unlock(new Uint8Array(fs.readFileSync(opts.out)), pass)
    .then(function (text) {
      var first = text.split(/\r?\n/)[0];

      console.log("seal: " + opts.out + " unlocks with the passphrase in " + opts.key);
      console.log("seal: first line is: " + first);
    })
    .catch(function (e) {
      fail(
        opts.out +
          " does not unlock (" +
          e.message +
          "). Either the passphrase file changed since it was sealed, or the file is not a sealed report. Seal the current report again."
      );
    });
} else {
  if (!opts.report) {
    fail("say which report to seal: node tools/seal.mjs <report.txt>");
  }

  if (!fs.existsSync(opts.report)) {
    fail("no such file: " + opts.report);
  }

  var text = fs.readFileSync(opts.report, "utf8");

  if (!text.trim()) {
    fail(opts.report + " is empty. Nothing to seal.");
  }

  seal(text, pass).then(function (bytes) {
    fs.mkdirSync(path.dirname(opts.out), { recursive: true });
    fs.writeFileSync(opts.out, bytes);

    console.log("seal: wrote " + opts.out + " (" + bytes.length + " bytes)");
    console.log("seal: first line sealed: " + text.split(/\r?\n/)[0]);
    console.log("seal: upload docs/<team>/data/coaches-corner.enc with the other files. The .txt stays here.");
  });
}
