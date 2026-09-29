/**
 * CONFIG: the only file a team manager edits.
 *
 * Read by both pages of this team: index.html (parents) and staff/index.html
 * (the staff view). Sheet ID, tab names and IDs, the poll interval, and the
 * feature switches. Everything else lives in ../js/ and never changes.
 */
window.RINK_CONFIG = {

  // Paste the long ID from your Google Sheet's normal URL, the part between
  // /d/ and /edit :  docs.google.com/spreadsheets/d/THIS_PART_HERE/edit
  sheetId: "1HE3rTPmDsGSDqUN7p20wW9MIWQrbSTpNcaGHCWXHlmI",

  // Tab names in the sheet. Change only if you renamed the tabs.
  // "stats" is the Player Stats tab. It is optional: when the page can't read
  // it, the Stats tab simply doesn't appear and nothing else is affected.
  // "rinks" is the Rinks tab. Also optional: give a rink a street address there
  // and the page shows a Directions link for its games.
  // "sponsors" is the Sponsors tab (Sponsor / Tier / Website). Also optional:
  // without it, the sponsors block at the foot of the page simply isn't there.
  tabs: { settings: "Settings", teams: "Teams", schedule: "Schedule", stats: "Player Stats", rinks: "Rinks", sponsors: "Sponsors" },

  // Optional but worth 60 seconds. Click each tab in the sheet and copy the
  // number after "gid=" in the address bar. With these filled in the page uses
  // Google's raw export, which never re-types a column and so never throws away
  // text that shares a column with numbers. Left blank, it reads by tab name.
  gids: { settings: "1160090892", teams: "239776309", schedule: "1739208952", stats: "703037060", rinks: "1202177208", sponsors: "95128319" },

  // How often the page re-checks the sheet, in seconds, while it's on screen.
  refreshSeconds: 120,

  // Feature switches. Every one is on unless you set it to false. A switch
  // you delete from this list counts as on, so an older index.html keeps
  // working. Turning a switch off hides that piece of the page; nothing else
  // moves. Standings and the schedule are the page and have no switch.
  features: {
    nextGame:       true,   // the gold "Next game" card at the top
    sponsors:       true,   // the "Our sponsors" block (needs the Sponsors tab)
    stats:          true,   // the Stats tab (needs the Player Stats tab)
    events:         true,   // tournament and showcase views: the featured event button, the Events tab, and the pre-season event lines. Off = league play only.
    preseason:      true,   // the "League play starts ..." card before the first league score (off = the table of zeros)
    directions:     true,   // Directions links on the next-game card and rink names (needs addresses on the Rinks tab)
    calendar:       true,   // "Add to calendar" and "Google Calendar" links on the next-game card
    seasonCalendar: true,   // "Add our remaining N games to your calendar" under the schedule
    mhrLinks:       true,   // team names link to MyHockey Rankings (needs the MyHockey link column on the Teams tab)
    monoNumbers:    true,   // standings figures, scores, times and the record chip set in Chivo Mono. Off = Barlow, the way the page looked before.
    rating:         true,   // the Rtg column in the standings: goals better or worse than an average team, adjusted for opponents
    coachNotes:     true    // the Coaches report card on the staff page (needs data/coaches-corner.enc, made by tools/seal.mjs)
  }
};
