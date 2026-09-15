/**
 * The Settings tab -> the config object.
 *
 * Rows are matched by label PREFIX, and the order of SETTINGS_ROWS
 * disambiguates labels that share a prefix. The block ends at the first
 * blank label or at the readiness panel's headings.
 * See ARCHITECTURE.md, "Settings tab".
 */
import { state } from "../state.js";
import { locateHeader } from "../util/csv.js";
import { clean, norm, num } from "../util/text.js";

var SPEC_SETTINGS = {
  field: ["field", "setting"],
  value: ["youranswer", "answer", "value"],
  notes: ["notes", "note"]
};

/**
 * Settings rows, matched by label prefix, in priority order.
 *
 * Prefix matching keeps the readiness panel's labels ("Your team is filled
 * in") from reading as settings. Order matters: "tiebreak rules" also starts
 * with "tie", so it sits above the points rows. Add a new setting here, in
 * the right place rather than at the end.
 * See ARCHITECTURE.md, "Settings tab".
 */
var SETTINGS_ROWS = [
  {
    match: ["tiebreak"],
    apply: function (c, v) {
      c.rules = norm(v);
    }
  },
  {
    match: ["ourteam", "myteam", "teamname"],
    apply: function (c, v) {
      c.teamName = v;
    }
  },
  {
    match: ["whichview", "viewopens", "showcaseweekend", "seasonorshowcase"],
    apply: function (c, v) {
      c.mode = norm(v).indexOf("showcase") !== -1 ? "showcase" : "season";
    }
  },
  {
    match: ["league", "showcase", "eventname", "event"],
    apply: function (c, v) {
      c.leagueName = v;
    }
  },
  {
    match: ["pointsforawin", "win"],
    apply: function (c, v) {
      c.ptsWin = num(v) === null ? 2 : num(v);
    }
  },
  {
    match: ["pointsforatie", "tie"],
    apply: function (c, v) {
      c.ptsTie = num(v) === null ? 1 : num(v);
    }
  },
  {
    match: ["pointsforaloss", "loss"],
    apply: function (c, v) {
      c.ptsLoss = num(v) === null ? 0 : num(v);
    }
  },
  {
    match: ["sponsorcontact", "sponsorship"],
    apply: function (c, v) {
      c.sponsorContact = v;
    }
  }
];

/**
 * Applies one settings row to the config: the first SETTINGS_ROWS entry
 * whose prefix matches the label wins.
 *
 * @param {Object} cfg - The config object being built.
 * @param {string} label - The normalised Field cell.
 * @param {string} val - The cleaned answer cell.
 */
function applySetting(cfg, label, val) {
  for (var i = 0; i < SETTINGS_ROWS.length; i++) {
    var pats = SETTINGS_ROWS[i].match;

    for (var j = 0; j < pats.length; j++) {
      if (label.indexOf(pats[j]) === 0) {
        SETTINGS_ROWS[i].apply(cfg, val);
        return;
      }
    }
  }
}

/**
 * Headings of the readiness panel under the settings block. The tab-name
 * route drops the blank row that separates them, so the block stops here too.
 */
var PANEL_HEADINGS = ["beforeyousend", "requirement", "theseupdatethemselves"];

/**
 * Whether a normalised label starts a readiness panel heading.
 *
 * @param {string} label
 * @returns {boolean}
 */
function isPanelHeading(label) {
  for (var i = 0; i < PANEL_HEADINGS.length; i++) {
    if (label.indexOf(PANEL_HEADINGS[i]) === 0) {
      return true;
    }
  }

  return false;
}

/**
 * Reads the Settings tab rows into the config object.
 *
 * The "Your answer" column is read by position when the header row is found;
 * collapsing non-empty cells instead would slide Notes into an unanswered
 * row. Without a header row, the first two non-empty cells of each row are
 * label and value.
 *
 * @param {string[][]} rows
 * @returns {Object}
 */
function shapeSettings(rows) {
  var c = {
    leagueName: "",
    teamName: "",
    mode: "season",
    ptsWin: 2,
    ptsTie: 1,
    ptsLoss: 0,
    rules: "",
    sponsorContact: ""
  };

  var hdr = locateHeader(rows, SPEC_SETTINGS);

  // When the answer column gets typed numeric its own header is nulled too,
  // so fall back to the column just right of Field rather than collapsing the row.
  var valCol;

  if (hdr && hdr.map.field !== undefined) {
    valCol = hdr.map.value !== undefined ? hdr.map.value : hdr.map.field + 1;

    if (valCol === hdr.map.notes) {
      valCol = undefined;
    }
  }

  var byCol = valCol !== undefined;

  if (byCol) {
    hdr.map.value = valCol;
  }

  var blanks = 0;
  var blankFields = [];

  for (var r = byCol ? hdr.headerIndex + 1 : 0; r < rows.length; r++) {
    var label;
    var val;

    if (byCol) {
      label = norm(rows[r][hdr.map.field]);

      // The block ends at the first empty Field cell or at the readiness panel.
      if (!label || isPanelHeading(label)) {
        break;
      }

      val = clean(rows[r][valCol]);

      if (val === "") {
        blanks++;
        blankFields.push(label);
      }
    } else {
      var cells = rows[r].map(clean).filter(function (x) {
        return x !== "";
      });

      if (cells.length < 2) {
        continue;
      }

      label = norm(cells[0]);
      val = cells[1];
    }

    if (!label || val === "") {
      continue;
    }

    applySetting(c, label, val);
  }

  // Google types each column. An answer column holding both words and the
  // points numbers comes back numeric, with the words silently blank.
  if (
    byCol &&
    blanks >= 2 &&
    !c.teamName &&
    !c.leagueName &&
    (c.ptsWin !== 2 || c.ptsTie !== 1 || c.ptsLoss !== 0 || rowsHaveNumbers(rows, hdr))
  ) {
    state.problems.push(
      "Google dropped the text in the Settings answer column because that column also holds numbers. Clear the 2 / 1 / 0 in the points rows and the names will come through. The page uses 2 / 1 / 0 by default anyway."
    );
  } else if (byCol && blankFields.length) {
    // Points and tiebreak rules may be left blank; only nag about the two
    // that change what a parent sees.
    var needed = [];

    blankFields.forEach(function (f) {
      if (f.indexOf("ourteam") !== -1) {
        needed.push("Our team");
      } else if (f.indexOf("leaguename") !== -1 || f.indexOf("showcaseorleague") !== -1) {
        needed.push("League or showcase name");
      }
    });

    if (needed.length) {
      state.problems.push("Not filled in on the Settings tab: " + needed.join(", ") + ".");
    }
  }

  return c;
}

/**
 * Whether any answer cell below the header holds a number.
 *
 * @param {string[][]} rows
 * @param {Object} hdr - The locateHeader() result.
 * @returns {boolean}
 */
function rowsHaveNumbers(rows, hdr) {
  for (var r = hdr.headerIndex + 1; r < rows.length; r++) {
    if (num(rows[r][hdr.map.value]) !== null) {
      return true;
    }
  }

  return false;
}

export { shapeSettings };
