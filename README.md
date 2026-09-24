# Check The Rink

A standings page for a youth hockey team, run off a Google Sheet.

You type scores into a spreadsheet. Parents open a link and see the standings,
the schedule, and when the next game is. No login, no app to install, and
nothing to maintain in February when everyone has stopped caring.

Live: [checktherink.com](https://checktherink.com/)
(West Seneca Wings 12U, 2026-27).

## How it works

```
Google Sheet          you and your co-manager type scores here
      |
      |  read anonymously over https
      v
static files          GitHub Pages. Never change unless the code changes.
      |
      v
parent's phone        no login, no app, works on anything
```

The sheet is the database. The page is a reader. There is no server, no
account system, and no place for it to break at 9pm on a Saturday except
Google, and Google is usually up.

Three things that follow from that:

**Everything is public.** The sheet has to be link-readable and the page is
on the open internet. So the sheet holds no rosters, no full names and no
contact information. Scores, team names, and first name plus last initial on
the stats tab. If a stranger finds the link, they learn that a 12U team lost
4-1.

**The page keeps the last good copy.** A parent in a dead-zone parking lot
gets last night's standings and a line saying how old they are, instead of a
spinner. And if Google Sheets itself cannot be reached, the page falls back
to a copy of the sheet that a small GitHub job saves into the repo every six
hours, with a banner saying so. That copy is also the backup if the sheet is
ever lost.

**Scores never require a deploy.** You change the sheet, the page picks it
up within a couple of minutes. The only reason to touch the code is a code
change.

## What is in this repo

The page lives in `docs/`, which is the folder GitHub Pages serves. Your
working folder and the repository are the same thing, so a change is a
normal commit and push.

The site is Check The Rink: a landing page at the root that lists every
club and team, and one folder per team. Each team's page is this Rink
Report. All teams share the same `js/` and `css/`.

| Path | What it is |
|---|---|
| `docs/index.html` | Check The Rink landing page. Lists every club and team from `teams.js`. Nothing in it to edit. |
| `docs/teams.js` | **Every club and team on the site.** A club is a name and two colors; a team is a folder, name, club and age group. The one file to edit to add a club or team. |
| `docs/theme.js` | Works out every color a page needs from a club's two colors, for light and dark mode, and keeps them readable. Used by the landing page and every team page. |
| `docs/landing.js`, `docs/landing.css` | The landing page's code and styles. |
| `docs/wswings12u/` | The West Seneca Wings 12U page. One folder per team. |
| `docs/wswings12u/index.html` | That team's shell: the config block you edit (sheet ID, tab IDs, feature switches), and the lines that load the shared code. |
| `docs/wswings12u/logo.png` | That team's crest. Optional; delete it and the masthead is text only. |
| `docs/wswings12u/manifest.json` | Names the home-screen shortcut a parent makes from that team's page. |
| `docs/wswings12u/data/` | The saved copy of that team's sheet, one CSV per tab, written by the GitHub job. Do not edit by hand. |
| `docs/js/` | The Rink Report itself, one module per responsibility, shared by every team. Native ES modules, no build step. `ARCHITECTURE.md` is the map. |
| `docs/css/rink.css` | Every Rink Report style, shared by every team. |
| `docs/_headers` | Security headers Netlify would read. Ignored by GitHub Pages; harmless. |
| `docs/.nojekyll` | Tells GitHub Pages to serve the folder as-is. Keep it. |
| `.github/workflows/snapshot.yml` | The job that saves a copy of every team's sheet. Runs once a day; commits only when a tab changed, and writes a plain-English list of what changed to `changes/<team>/<date>.md`. |
| `tests/` | The check suite and its fixture sheets. `npm install`, `npm test`. |
| `ARCHITECTURE.md` | How the code is put together, the reasoning behind each rule, and how to add to it. |
| `DEPLOY.md` | Click-by-click setup, about 20 minutes, once. Also the sheet's rules, the Rinks, Sponsors and MyHockey columns, and troubleshooting. |

## Setup

Read `DEPLOY.md`. Short version:

1. Make a Google Sheet from the schedule template (see `DEPLOY.md`, Part 1).
2. Fill in Settings, Teams, Schedule. The workbook grades itself as you type
   and goes red where it is not happy.
3. Share it as "Anyone with the link, Viewer".
4. Paste the sheet ID and the tab gids into the config block at the top of
   your team's `index.html` (`docs/<team folder>/index.html`).
5. Upload the files to a GitHub repo and turn on Pages (`DEPLOY.md`, Part 3).

## The weekly workflow

Game ends. Open the sheet on your phone, type two numbers, done. Standings,
records, the next-game card and the tiebreakers all recompute from the
scores. There is no separate standings table to keep in sync.

If something looks wrong, open the page with `?check` on the end. That page
shows which route each tab was read through, which spreadsheet column it
decided was which field, every warning in full, and which feature switches
are off. Most problems are one of two things: a missing date in column A, or
a team name on the Schedule tab that does not match the Teams tab.

## What the page does

**League play, showcases, tournaments.** The Event column on the Schedule
tab is the switch. Blank means league play; a name means that event. The bar
shows League, the one event happening now or next, an Events tab listing
every showcase and tournament with your record at each, and Stats. A
tournament (any row marked `Bracket`) gets pool standings; a showcase gets a
round robin table and no seeding.

**Game type.** Scrimmages and exhibitions show on the schedule, tagged, and
stay out of the standings. Bracket games stay on the schedule and out of
the pool table. Standings list only the clubs you actually play in that
competition.

**Renamed clubs.** The "Also known as" column on the Teams tab maps an old
spelling (or a tournament's spelling) to the current name.

**MyHockey Rankings.** The "MyHockey link" column on the Teams tab (a team
number or the full address) turns that club's name into a link.

**Tiebreakers.** Set on the Settings tab from the event's published rules.
Left blank, teams level on points share a rank number rather than getting a
made-up order.

**Directions.** Give a rink a street address on the Rinks tab and its games
get a Directions link on the next-game card and on unplayed schedule rows.
Apple phones open Maps, everything else opens Google Maps.

**Calendar.** The next-game card offers "Add to calendar" (an `.ics` file)
and a Google Calendar link. The bottom of the schedule offers one file with
every remaining game of ours. The phone builds the file; nothing is hosted.

**Sponsors.** Add a Sponsors tab (`Sponsor`, `Tier`, `Website`) and the
businesses paying for the season appear under the next-game card, gold
first. Tapping the heading folds the list for whoever tapped it.

**Player stats.** A Stats tab appears when the sheet has a Player Stats
tab. Skaters by points, and the goalie line with GAA computed on the page
and a wins-losses-ties record counted off the game log, so a tied game is
not lost between the W and L columns on the tab. Saves and save percentage
are left off on purpose: most youth scoresheets never record shots.

**Pre-season.** Before the first league score, the standings card says when
league play starts, shows the showcase record, and lists the division,
instead of a table of zeros.

## Turning pieces off

The config block at the top of `index.html` ends with a `features` list.
Set any one to `false` and that piece leaves the page; everything else stays
where it was.

| Switch | What it hides |
|---|---|
| `nextGame` | the gold next-game card |
| `sponsors` | the sponsors block |
| `stats` | the Stats tab |
| `events` | tournament and showcase views (the page becomes league play only) |
| `preseason` | the pre-season card (a table of zeros shows instead) |
| `directions` | Directions links |
| `calendar` | the two calendar links on the next-game card |
| `seasonCalendar` | the whole-season calendar link under the schedule |
| `mhrLinks` | MyHockey Rankings links on team names |
| `monoNumbers` | Chivo Mono on the figures (they go back to Barlow) |
| `rating` | the Rtg column in the standings |

Add `?admin` to the address for two more things:

- A "Gameday post" button on every game of ours still to be played. Pick a
  template (Blueline, Echo or Faceoff), a size (Instagram feed, square or
  story), add a photo from your phone if you like, and edit the hype line.
  Download saves the PNG; on a phone Share opens the share sheet too. To
  post it, get it into your photos (iPhone: Share, then Save Image) and
  post from the Instagram app.
- A Coaches Corner card on the league view: record, scoring trends by month,
  close games, how much of the scoring comes from the top two, penalty
  minutes, and a "Copy as text" button. It names no player, because anyone
  who adds `?admin` to the address can see it.

Parents never see either one unless they add `?admin` themselves.

Standings, the schedule, the record chip, the All/Ours switch, the Refresh
button, the Setup check link and the warnings banner are the page and have no
switch.

## Changing the code

Read `ARCHITECTURE.md`. Plain JavaScript in native ES modules under `js/`,
one file per responsibility, no dependencies, no build step. Preview locally
with `python3 -m http.server 8000` in this folder (modules will not load from
a `file://` double-click).

House style: one statement per line, blank lines between logical steps, a
JSDoc docblock on every function, and comments that carry only the rule a
reader needs. The reasoning lives in `ARCHITECTURE.md`. No em-dashes.

`tests/` boots the real page in a headless browser with every sheet request
answered from fixture CSVs and runs 378 checks. `npm install` once, then
`npm test` after any change.

To deploy a change, drag the changed files onto the repo's upload page and
write a commit message that says what changed and where. `DEPLOY.md`,
"Changing the page later".

## Cost

| | |
|---|---|
| Google Sheet | free |
| GitHub Pages hosting | free, no deploy meter |
| `<you>.github.io/rink-report` | free |
| Your own domain, optional | about $10 a year |

## What it deliberately does not do

No rosters. No logins. No notifications. No admin panel.

Every one of those adds something that has to be maintained mid-season,
which is exactly when volunteer-run team sites die. The sheet is the admin
panel.

## Copyright

Copyright (c) 2026 Minted Moose LLC. All rights reserved. The code is public
so GitHub Pages can host it, not as a license to reuse it. See `LICENSE`.
Both the team pages and the landing page carry the same notice in their
footers.
