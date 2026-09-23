/**
 * Check The Rink: landing page.
 *
 * Draws the masthead, the parent's own teams, the finder, and every club
 * with its teams, from the data in teams.js. Plain script; everything
 * hangs off window.CheckTheRinkLanding.
 *
 *   CheckTheRinkLanding.mount(element, site, options)
 *
 * site     window.CHECK_THE_RINK from teams.js (orgs + teams)
 * options  onPick(folder, event)  optional; called when a team is tapped,
 *          after it is remembered, for a page that handles the tap itself.
 */
(function () {

  /** How many teams before the search box appears. */
  var FIND_AT = 8;

  /** Browser storage key for the teams this phone picked, newest first. */
  var RECENT_KEY = "checktherink.recent";

  /** How many picked teams to remember and show. */
  var RECENT_MAX = 3;

  /** Age group names parents use, in age order, for sorting. */
  var AGE_NAMES = {
    "mite": 8,
    "squirt": 10,
    "peewee": 12,
    "pee wee": 12,
    "bantam": 14,
    "midget": 18
  };


  /**
   * Escapes text for safe use inside HTML.
   * @param {string} s
   * @returns {string}
   */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }


  /**
   * Reads and writes browser storage without ever throwing.
   * Private windows and blocked storage just act as "nothing saved".
   */
  var store = {
    get: function (key) {
      try {
        return localStorage.getItem(key);
      } catch (e) {
        return null;
      }
    },

    set: function (key, value) {
      try {
        localStorage.setItem(key, value);
      } catch (e) {
        /* nothing to do */
      }
    }
  };


  /**
   * The folders this phone picked, newest first.
   * @returns {string[]}
   */
  function recent() {
    try {
      var list = JSON.parse(store.get(RECENT_KEY) || "[]");

      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }


  /**
   * Puts a folder at the front of the recent list.
   * @param {string} folder
   */
  function remember(folder) {
    var list = recent().filter(function (f) {
      return f !== folder;
    });

    list.unshift(folder);
    store.set(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
  }


  /**
   * A sort number for an age group, so 8U comes before 10U and
   * Squirt before Peewee. Unknown labels sort last, by name.
   * @param {string} program
   * @returns {number}
   */
  function ageRank(program) {
    var p = String(program || "").toLowerCase();
    var n = /(\d+)\s*u\b/.exec(p);

    if (n) {
      return parseInt(n[1], 10);
    }

    for (var name in AGE_NAMES) {
      if (p.indexOf(name) !== -1) {
        return AGE_NAMES[name];
      }
    }

    return 99;
  }


  /**
   * The link for a team. Always ends in a slash so the team page's
   * relative paths resolve inside its folder.
   * @param {{folder:string}} t
   * @returns {string}
   */
  function hrefFor(t) {
    return t.folder.replace(/^\/+|\/+$/g, "") + "/";
  }


  /**
   * The words a search can match for a team: name, club, age group,
   * league, and any other names parents use (the aka list).
   * @param {object} t
   * @param {object} orgs
   * @returns {string}
   */
  function searchText(t, orgs) {
    var org = orgs[t.org];

    return [t.name, org && org.name, t.program, t.league]
      .concat(t.aka || [])
      .join(" ")
      .toLowerCase();
  }


  /**
   * True when every word typed starts one of the team's words, so
   * "wings 12u" and "red team 14" find what they should, and "8u" finds
   * 8U without also finding 18U.
   * @param {string} text
   * @param {string} query
   * @returns {boolean}
   */
  function matches(text, query) {
    var words = text.split(/[^a-z0-9]+/);
    var typed = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

    var starts = function (q) {
      return words.some(function (w) {
        return w.indexOf(q) === 0;
      });
    };

    // "pee wee" should still find a team whose age group is typed "Peewee".
    return typed.every(starts) || starts(typed.join(""));
  }


  /**
   * A team's crest, or its initials in a box when there is none or
   * the file fails to load.
   * @param {object} t
   * @returns {string} HTML
   */
  function crest(t) {
    var initials = t.name.split(/\s+/).map(function (w) {
      return w.charAt(0);
    }).join("").slice(0, 3);

    var box = '<span class="crest none" aria-hidden="true"' + (t.crest ? " hidden" : "") + ">"
      + esc(initials) + "</span>";

    if (!t.crest) {
      return box;
    }

    return '<img class="crest" src="' + esc(t.crest) + '" alt="" '
      + 'onerror="this.nextSibling.hidden=false;this.remove()">' + box;
  }


  /**
   * One team row.
   * @param {object} t
   * @param {object} orgs
   * @param {string[]} mine folders this phone picked
   * @returns {string} HTML
   */
  function teamRow(t, orgs, mine) {
    var meta = (t.program ? '<span class="tag">' + esc(t.program) + "</span>" : "")
      + esc(t.league || "");

    var label = t.name + (t.program ? ", " + t.program : "");

    return '<li class="team' + (mine.indexOf(t.folder) !== -1 ? " us" : "") + '"'
      + ' data-find="' + esc(searchText(t, orgs)) + '">'
      + '<a href="' + esc(hrefFor(t)) + '" data-folder="' + esc(t.folder) + '" aria-label="' + esc(label) + '">'
      + crest(t)
      + '<span class="words"><span class="name">' + esc(t.name) + "</span>"
      + (meta ? '<span class="meta">' + meta + "</span>" : "")
      + "</span>"
      + '<span class="go" aria-hidden="true">&rarr;</span>'
      + "</a></li>";
  }


  /**
   * The parent's own teams: the most recent as the accent panel in its
   * club's colors (with its next game when the data has one), and up to
   * two more as plain rows under it.
   * @param {object[]} teams
   * @returns {string} HTML
   */
  function mineBlock(teams) {
    var mine = recent().map(function (f) {
      return teams.filter(function (t) {
        return t.folder === f;
      })[0];
    }).filter(Boolean);

    if (!mine.length) {
      return "";
    }

    var first = mine[0];

    var next = first.next
      ? '<span class="next"><b>' + esc(first.next.when) + "</b> vs " + esc(first.next.vs)
        + (first.next.where ? ", " + esc(first.next.where) : "") + "</span>"
      : "";

    var html = '<section class="mine" aria-labelledby="mine-h">'
      + '<h2 class="sr-only" id="mine-h">Your teams</h2>'
      + '<a class="back" href="' + esc(hrefFor(first)) + '" data-folder="' + esc(first.folder) + '" data-org="' + esc(first.org) + '">'
      + '<span class="top"><span class="eyebrow">Your team</span>'
      + (first.next ? '<span class="eyebrow">Next game</span>' : "") + "</span>"
      + '<span class="name">' + esc(first.name) + " "
      + (first.program ? '<span class="tag">' + esc(first.program) + "</span>" : "")
      + '<span aria-hidden="true">&nbsp;&rarr;</span></span>'
      + next
      + "</a>";

    if (mine.length > 1) {
      html += '<ul class="also">' + mine.slice(1).map(function (t) {
        return '<li data-org="' + esc(t.org) + '"><a href="' + esc(hrefFor(t)) + '" data-folder="' + esc(t.folder) + '">'
          + "<span>" + esc(t.name) + (t.program ? '<span class="tag">' + esc(t.program) + "</span>" : "") + "</span>"
          + '<span class="go" aria-hidden="true">&rarr;</span></a></li>';
      }).join("") + "</ul>";
    }

    return html + "</section>";
  }


  /**
   * Every club, with its teams sorted by age group then name. Clubs sort
   * by name; a team whose club is missing from teams.js goes under
   * "Other teams" in plain ink.
   * @param {object} site
   * @returns {string} HTML
   */
  function clubs(site) {
    var orgs = site.orgs || {};
    var mine = recent();
    var byOrg = {};

    site.teams.forEach(function (t) {
      var id = orgs[t.org] ? t.org : "";

      (byOrg[id] = byOrg[id] || []).push(t);
    });

    var name = function (id) {
      return id ? orgs[id].name : "Other teams";
    };

    // Clubs by name, with "Other teams" (teams whose club is missing) last.
    return Object.keys(byOrg).sort(function (a, b) {
      return (a === "") - (b === "") || name(a).localeCompare(name(b));
    }).map(function (id) {
      var teams = byOrg[id].slice().sort(function (a, b) {
        return ageRank(a.program) - ageRank(b.program)
          || String(a.program || "").localeCompare(String(b.program || ""))
          || a.name.localeCompare(b.name);
      });

      var count = teams.length === 1 ? "1 team" : teams.length + " teams";

      return '<section class="org"' + (id ? ' data-org="' + esc(id) + '"' : "") + ">"
        + '<h2 class="org-head"><span>' + esc(name(id)) + '</span><span class="eyebrow">' + count + "</span></h2>"
        + "<ul>" + teams.map(function (t) { return teamRow(t, orgs, mine); }).join("") + "</ul>"
        + "</section>";
    }).join("");
  }


  /**
   * Hides team rows that don't match, and clubs left empty. Updates the
   * count line, which screen readers announce.
   * @param {Element} root
   * @param {string} query
   */
  function filter(root, query) {
    var shown = 0;

    Array.prototype.forEach.call(root.querySelectorAll(".org"), function (section) {
      var visible = 0;

      Array.prototype.forEach.call(section.querySelectorAll(".team"), function (row) {
        var hit = matches(row.getAttribute("data-find"), query);

        row.hidden = !hit;
        visible += hit ? 1 : 0;
      });

      section.hidden = visible === 0;
      shown += visible;
    });

    var count = root.querySelector(".find .count");

    count.textContent = !query.trim()
      ? ""
      : shown === 0
        ? "No team matches that. Try the club or the age group."
        : shown === 1 ? "1 team" : shown + " teams";
  }


  /**
   * Draws the landing page into an element and wires it up.
   * @param {Element} el
   * @param {object} site window.CHECK_THE_RINK
   * @param {{onPick?: function(string, Event)}} [options]
   */
  function mount(el, site, options) {
    options = options || {};

    var html = '<header class="mast">'
      + '<p class="eyebrow">Youth hockey standings</p>'
      + "<h1>Check The Rink</h1>"
      + '<p class="sub">Standings, scores and the next game. Pick your team.</p>'
      + "</header>";

    if (!site || !Array.isArray(site.teams)) {
      el.innerHTML = html + '<main><p class="empty">Can\'t load the team list right now. Try again in a minute.</p></main>';

      return;
    }

    var teams = site.teams.filter(function (t) {
      return t && t.folder && t.name;
    });

    html += "<main>" + mineBlock(teams);

    if (teams.length >= FIND_AT) {
      html += '<div class="find" role="search">'
        + '<label class="eyebrow" for="q">Find a team</label>'
        + '<input id="q" type="search" autocomplete="off" placeholder="Team, club or age group">'
        + '<p class="count" aria-live="polite"></p>'
        + "</div>";
    }

    html += teams.length
      ? clubs({ orgs: site.orgs, teams: teams })
      : '<p class="empty">No teams yet.</p>';

    html += "</main>"
      + '<footer class="foot">'
      + "<p>Each team's page is kept by that team's manager, from their own spreadsheet.</p>"
      + "<p>Add your team's page to your home screen to skip this step next time.</p>"
      + "<p>&copy; 2026 Minted Moose LLC. All rights reserved.</p>"
      + "</footer>";

    el.innerHTML = html;

    var q = el.querySelector("#q");

    if (q) {
      q.addEventListener("input", function () {
        filter(el, q.value);
      });
    }

    // Keyboard focus moving up the list can land on a row hidden behind
    // the sticky search box; nudge the page so the row shows below it.
    var finder = el.querySelector(".find");

    if (finder) {
      el.addEventListener("focusin", function (e) {
        var row = e.target.closest && e.target.closest(".team a, .also a");

        if (!row) {
          return;
        }

        var cover = finder.getBoundingClientRect().bottom;
        var top = row.getBoundingClientRect().top;

        if (top < cover) {
          window.scrollBy(0, top - cover - 8);
        }
      });
    }

    el.addEventListener("click", function (e) {
      var link = e.target.closest && e.target.closest("a[data-folder]");

      if (!link || !el.contains(link)) {
        return;
      }

      remember(link.getAttribute("data-folder"));

      if (options.onPick) {
        options.onPick(link.getAttribute("data-folder"), e);
      }
    });
  }


  window.CheckTheRinkLanding = {
    mount: mount,
    remember: remember,
    matches: matches,
    ageRank: ageRank
  };

})();
