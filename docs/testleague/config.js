/**
 * CONFIG: the only file a league commissioner edits.
 *
 * Read by both pages of this league: index.html (parents) and
 * staff/index.html (the staff view, with the scheduling tool). Sheet ID,
 * tab names and IDs, the poll interval, and the feature switches.
 * Everything else lives in ../js/ and never changes.
 *
 * This is a LEAGUE page: the Settings tab says "Page type: league", so
 * there is no home team. The page shows every division's standings and the
 * whole schedule. Set it up from Test-League-12U-Sheet.xlsx (see
 * SETUP-LEAGUE.md at the repo root).
 */
window.RINK_CONFIG = {

  // Paste the long ID from your Google Sheet's normal URL, the part between
  // /d/ and /edit :  docs.google.com/spreadsheets/d/THIS_PART_HERE/edit
  sheetId: "1j2V5e7kzUz3IrudTN3rEdg9UfuV30z_YRsYZDkD1YHc",

  // Tab names in the sheet. Change only if you renamed the tabs.
  // "slots" is the Ice slots tab (Home team / Rink / Date / Face-off): the
  // hours of ice each club brings. Read on the staff page only, for the
  // scheduling tool. "rinks" and "sponsors" are optional, as on a team page.
  // There is no Player Stats tab on a league page.
  tabs: { settings: "Settings", teams: "Teams", schedule: "Schedule", rinks: "Rinks", sponsors: "Sponsors", slots: "Ice slots" },

  // Click each tab in the sheet and copy the number after "gid=" in the
  // address bar. With these filled in the page uses Google's raw export,
  // which never re-types a column.
  gids: { settings: "560272049", teams: "1574794579", schedule: "1402291474", rinks: "1489084264", sponsors: "1641985135", slots: "1745516389" },

  // How often the page re-checks the sheet, in seconds, while it's on screen.
  refreshSeconds: 120,

  // Feature switches. Every one is on unless you set it to false. The
  // home-team pieces (next game, stats, coaches cards) never show on a
  // league page whatever these say; they are listed so one config.js shape
  // serves every folder.
  features: {
    sponsors:       true,   // the "Our sponsors" block (needs the Sponsors tab)
    events:         true,   // tournament and showcase views, if the league runs any
    preseason:      true,   // the "League play starts ..." card before the first score
    directions:     true,   // Directions links on rink names (needs addresses on the Rinks tab)
    calendar:       true,   // "Add to calendar" links on schedule rows
    mhrLinks:       true,   // team names link to MyHockey Rankings (needs the MyHockey link column)
    monoNumbers:    true,   // figures set in Chivo Mono
    rating:         true,   // the Rtg column in the standings
    scheduler:      true    // the Ice slots card and the scheduling tool on the staff page
  }
};
