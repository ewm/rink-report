/**
 * Check The Rink: every club and team on the site.
 *
 * This is the only file you edit to add a club or a team. The landing page
 * reads it, and each team page reads it for its club's colors.
 *
 * orgs    One entry per club, keyed by a short id (lowercase, no spaces).
 *           name     the club as parents know it
 *           primary  the club's main color, as a hex code
 *           accent   the club's second color, as a hex code
 *         Two colors are all a club gives. theme.js works out the rest,
 *         and swaps in stand-ins when a color would disappear.
 *
 * teams   One entry per team.
 *           folder   the team's folder on the site, lowercase, no spaces
 *           name     the team name as parents know it
 *           short    optional, the one word for the next-game line ("Wings")
 *           org      the id of its club, from the list above
 *           program  age group, shown as a tag ("12U", "Squirt")
 *           league   optional, shown after the tag
 *           aka      optional, other names parents search for (["Pee Wee"])
 *           crest    optional, path to the team's logo
 *
 * leagues One entry per league page: a whole league's standings and
 *         schedule with no home team. Same fields as a team (folder, name,
 *         short, org, program, aka) and the org gives the league its two
 *         colors. Leagues sit in their own list so the landing page can
 *         show a league with its teams under it.
 *
 * To pull a team, delete its entry (and its folder).
 */
window.CHECK_THE_RINK = {

  orgs: {
    wsyha: {
      name: "West Seneca Youth Hockey",
      primary: "#003087",
      accent: "#FCD51E"
    },
    testleague: {
      name: "Test League",
      primary: "#0B1620",
      accent: "#4FD1FF"
    }
  },

  teams: [
    {
      folder: "wswings12u",
      name: "West Seneca Wings",
      short: "Wings",
      org: "wsyha",
      program: "12U",
      league: "WNYAHL",
      crest: "wswings12u/logo.png"
    }
  ],

  leagues: [
    {
      folder: "testleague",
      name: "Test League 12U",
      short: "Test League",
      org: "testleague",
      program: "12U"
    }
  ]
};
