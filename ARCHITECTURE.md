# Rink Report: how the code is put together

One page, no build step, no backend. A Google Sheet is the database and the
page is a reader that runs on a parent's phone. This document is the map and
the design notes. Start here, then open `docs/js/app.js`.

Code comments in `js/` say what a function does and the one rule you need to
change it safely. The reasoning behind those rules lives here, under the
section each comment names.

## Module map

```
docs/
  index.html          Check The Rink landing page (see "Check The Rink" below)
  teams.js            every club (name + two colors) and team (folder, club)
  theme.js            a club's two colors -> every color slot, light and dark
  landing.js/.css     the landing page
  wswings12u/         one folder per team:
    index.html        the shell: fonts, the CONFIG block (the only thing a
                      manager edits), an empty #app, and one module script
    logo.png          the crest, optional
    manifest.json     the home-screen shortcut's name and icon
    data/             the saved copy of this team's sheet, written by the Action
  css/rink.css        every style, shared by every team
  js/
    app.js            entry point: boot, load(), the poll, the cache, clicks
    state.js          RINK_CONFIG, the feature switches, the store, notify()
    render.js         composes components into one innerHTML write
    util/             text.js  dates.js  csv.js  clipboard.js
                      no app knowledge
    sheet/routes.js   read one tab: raw export, tab name, then the saved copy
    shape/            settings.js  teams.js  games.js  stats.js  rinks.js
                      sponsors.js
                      CSV rows -> objects, plus manager warnings
    model/            game.js  standings.js  rating.js  views.js  links.js
                      gamelog.js  coach.js
                      what the data means: records, tiebreaks, tabs,
                      and the directions / calendar links built from a game
    ui/               frame.js (masthead, bar, banners, status, footer) and
                      one component per card, each (state) -> HTML string
    ui/post/          the gameday post templates, drawn on a canvas
.github/workflows/    snapshot.yml, the job that writes each team's data/,
                      and sheet-changes.py, its daily change list
changes/              <team>/<date>.md, what changed in the sheet each day
tests/                Playwright suite + fixtures; see tests/README.md
workbench/            templates, handouts, sheet copies, old builds.
                      git ignores it; see workbench/README.md
```

Modules are native ES modules (`<script type="module">`). Every phone that
can open a Google Sheet can run them. The one consequence: the page has to
come from a web server, not a `file://` double-click. Use
`python3 -m http.server 8000` in `docs/` for local preview, then open
`localhost:8000/` for the landing page or `localhost:8000/wswings12u/` for
the Wings.

## Check The Rink: team folders and club colors

The site is one GitHub Pages repo on one address. The landing page sits at
the root and every team gets a folder: `checktherink.com/wswings12u/`.
All teams run the same `js/` and `css/`; a team's folder holds only what is
its own (config, crest, manifest, saved copy of its sheet). Adding a team is
a folder plus an entry in `teams.js`.

A team page's shell loads `../theme.js` and `../teams.js` in the head,
before the page paints, and calls `CheckTheRinkTheme.applyTeamPage()`. That
finds the team by its folder name (the last part of the address, or
`RINK_CONFIG.folder` if a page sets one), looks up its club, and writes the
club's color slots onto `:root`. `rink.css` still carries the Wings' values
as a fallback, so a folder missing from `teams.js` looks like the Wings and
shows no "All teams" row. `window.CHECK_THE_RINK_CLUB` holds what was applied;
the footer and the gameday post read it.

**The color slots.** A club gives a main color and an accent. `theme.js`
derives `navy` (main), `navy-ink`, `on-navy`, `accent-on-main`, `gold` (the
accent panel), `mark` (the 5px rule and the 4px bars), `on-gold`,
`on-gold-2`, `us-ink`, `us-bg` and `focus`, separately for light and dark.
The names navy and gold are the Wings' history; they mean "main" and
"accent" now. Colors are moved lighter or darker in OKLCH, in small steps,
only until they reach their contrast target (7:1 for main as text, 4.5:1 for
type on a panel, 3:1 for the focus ring), so a club's color changes as
little as readability allows. When an accent can't do its job (white on a
white page, black on a dark page, too close to the main color), the accent
panel is filled with the main color and the thin marks are drawn in ink.
`CheckTheRinkTheme.check()` says so in plain words and the landing page logs it.

**Browser storage is per address, not per folder.** Every team shares one
address, so every key the page stores carries its folder's path:
`rinkreport.v5:/wswings12u/`, `rinkreport.sponsorsOpen:/wswings12u/`
(`scopedKey()` in `state.js`). Without it, two teams opened on one phone
paint each other's standings. Test [30] covers it.

**The landing page** (`landing.js`) groups teams by club, sorts clubs by
name and teams by age (8U, Squirt, 12U...), and shows a search box once
there are 8 or more teams. Search matches every word typed, against name,
club, age group, league and a team's `aka` names. The teams a phone picked
are remembered (`checktherink.recent`, newest first, up to three): the newest
becomes the "Your team" panel in its club's accent, the others sit under it.

### Data flow

```
  Google Sheet --(sheet/routes.js)--> rows --(shape/*.js)--> state.data
                                                              |
                     clicks / poll / visibility --> state ----+
                                                              v
                      ui/*.js components --(render.js)--> #app.innerHTML
```

1. **Read.** `getCSV("schedule")` tries up to three routes with retries and
   hands back parsed rows. It knows nothing about hockey.
2. **Shape.** `shapeGames(rows, teams, aliases)` turns rows into game objects
   and pushes a plain-English warning onto `state.problems` for every row that
   looks wrong, naming the row and saying what to type.
3. **Model.** `views.js` decides what tabs the data implies; `standings.js`
   turns games into a ranked table under the event's own tiebreak sequence.
   Pure functions of `state.data`.
4. **Draw.** `render()` picks the components a view needs, joins their HTML,
   and skips the DOM write when nothing changed since the last poll.

`load()` in `app.js` is the one place steps 1 to 3 are wired together. The
six tabs are fetched in parallel. Player Stats, Rinks and Sponsors are
optional (`OPTIONAL_TABS`): each has its own `catch`, so a broken one costs
only its own block. A fetch that fails outright keeps the last good copy of
that tab; a tab that was read but held nothing is dropped. `OPTIONAL` in
`sheet/routes.js` lists the same three; a tab on that list never pushes onto
`routeTrouble`, because a tab that does not exist yet says nothing about
whether the other tab IDs are right.

After the Teams tab is shaped, `snapTeamName()` snaps the Settings tab's
"Our team" onto the Teams list the same way schedule names are snapped
(case, spacing, aliases). Every "ours" feature compares names exactly, so
without this a lower-case entry silently dropped the record chip, the Ours
switch, the W/L tags and the season calendar. A name that matches nothing
gets a warning on the page.

A Schedule tab that comes back with no games keeps the previous copy and
says so, whatever else went wrong in that read. The guard used to require
that no warning had been raised, and a garbled read always raises one first.

The crest (`logo.png`) is probed once at start-up rather than inserted and
removed on every render, which used to shove the masthead text sideways.

## The store

`state.js` is one plain object. Modules read and write it directly
(`state.data.games`, `state.problems.push(...)`). A shared object is the
honest size of this problem; a framework would be more code than the page.

Two rules keep it sane:

- **Nothing in `state.js` renders.** Code that changes state and wants the
  page to follow calls `notify()`. `app.js` registers `render()` as the one
  listener. That keeps the dependency graph one-way: `sheet` and `shape`
  never import from `ui`, and `ui` never imports from `app`.
- **Reset per load, not per render.** `load()` clears `problems`,
  `routeUsed`, `headerMap`, `routeTrouble` and the three `*Note` fields before
  refetching, so a warning from the last read cannot outlive the sheet edit
  that fixed it.

`sponsorsOpen` is the one reader preference in the store. It defaults to open
(the sponsors paid to be seen) and a reader who folds the block keeps it
folded on that phone only, via `rinkreport.sponsorsOpen:<folder>` in localStorage.
That key is separate from the data cache key on purpose: it must survive a
cache-key bump.

`render()` skips the DOM write when the new markup equals `state.lastHtml`.
The two-minute poll usually finds nothing new, and rewriting identical markup
costs a repaint for nothing.

## Components

A component is a function that takes what it needs from the store (or as
arguments) and returns an HTML string. No classes, no DOM diffing, no
lifecycle. `render()` is the only thing that touches the DOM, once.

| Component | Draws | Reads |
|---|---|---|
| `frame.js` | masthead, view bar, banners, status line, footer | the view, our standings row, fetch status, `state.problems` |
| `nextgame.js` | the gold next-game card, with Directions / calendar links | `state.data.games`, `model/links.js` |
| `standings.js` | standings table, pooled or flat; the pre-season card | the view, precomputed rows, rules |
| `results.js` | schedule and results by day; rink links; season .ics | the view, `state.filterOurs` |
| `events.js` | Events page and the crumb back | `dataViews()` |
| `stats.js` | skater and goalie tables | `state.data.stats` |
| `sponsors.js` | the folding sponsors block | `state.data.sponsors` |
| `diagnostics.js` | the `?check` page | all of it |

Interaction is one delegated click handler in `app.js` keyed on `data-act`
attributes (`view`, `filter`, `sponsors`, `refresh`). A component that needs
a control renders a `<button data-act="...">`; it never attaches listeners.

Two rules that are not stylistic:

1. **Anything from the sheet goes through `esc()` before it reaches HTML.**
   The page is public and anyone with edit rights on the sheet can type
   anything into a team name.
2. **Anything keyed by sheet text uses `bare()`, not `{}`.** A team called
   `__proto__` or `constructor` is a legal team name, and a plain object
   would walk the prototype and corrupt every lookup.

`safeUrl()` in `util/text.js` is the one gate between sheet text and an
`href`. Only `http` and `https` get through; a bare domain is promoted to
`https`; `javascript:`, `mailto:` and `data:` become nothing. The Sponsors
"Website" column and the Teams "MyHockey link" column both go through it.

## Feature switches

The CONFIG block in `index.html` ends with a `features` object, one boolean
per optional card or data-driven piece of the page: `nextGame`, `sponsors`,
`stats`, `events`, `preseason`, `directions`, `calendar`, `seasonCalendar`,
`mhrLinks`, `monoNumbers`, `rating`. `on(name)` in `state.js` is true unless the block says `false`;
a name missing from the block counts as on, so an `index.html` written
before a switch existed keeps every feature it had. Small controls (the
Refresh button, the Setup check link, the record chip, the All/Ours switch,
the crest, the warnings banner) have no switch on purpose: nobody flips
them, and each one was a config line, a check in the code and a test.

`monoNumbers` is the exception to everything below: it adds and removes no
markup at all, only the font the figures are set in. So `app.js` puts a
`mono-nums` class on `<html>` once at boot and `rink.css` does the rest.
Checking it inside a component would mean threading a class through every
number on the page for no gain.

A switch is checked at the one place the feature enters the page, never
spread through the model. `render()` skips the next-game card and the
sponsors block; `buildViews()` drops the featured event, the Events tab and
the Stats view; each component checks its own link or control. `load()` also
skips fetching a tab whose feature is off (stats, rinks, sponsors), so an off
switch saves a request as well as a paint. `events` off means league play
only: event games stay in the data but never reach a view. Standings and the
schedule are the page and have no switch. `?check` prints which switches are
off.

## Why two read routes

Google offers two anonymous CSV endpoints (a third route, the site's own saved copy, is for when neither answers; see "The saved copy"). The raw export by tab ID returns
cells exactly as typed. The tab-name reader (`gviz`) infers one type per
column and silently blanks every cell that does not match, including the
header cell of a numeric column. That is how "Away goals" and "Home goals"
once vanished and the page rendered a full standings table of zeros with no
warning. Three defenses, all covered by tests:

1. The export route is primary; gviz is a fallback. Each route gets three
   tries with a short backoff before the next route, because Google hands
   back the odd transient 404 and a single blip used to leave the page on an
   error banner. Each try is limited to 15 seconds (`TRY_LIMIT`, via an
   `AbortController`): a connection that Google accepts and then stalls,
   which rink wifi captive portals do, used to hang the page forever with no
   message. `routeTrouble` (the "wrong tab IDs" warning) is set only when the
   raw export route is given up on, not on its first failed try.
2. `recoverByPosition()` in `util/csv.js` rebuilds a blanked header from the
   columns around it: roles sitting between two columns that were identified
   must occupy the unclaimed columns between them, in order, and only when
   the counts match exactly. Columns to the left of the first recognised one
   are handled the same way; that is where the Date header lands, blanked
   because the column is date-typed. The stats parser does the same thing
   anchored on its two text headers, "Player" and "Goalie".
3. Goal columns unidentified, or many played games with no score, raises a
   manager warning instead of drawing zeros.

If you find yourself simplifying this back to one route, read
`tests/README.md` first.

## The saved copy

`.github/workflows/snapshot.yml` runs once a day on GitHub (07:00 UTC, about
3 AM Eastern), and by hand from the Actions tab. For every
team folder under `docs/` whose `index.html` has a `sheetId`, it fetches the
six tabs through the same raw-export URLs the page uses, and commits them to
`<team>/data/<tab>.csv` plus `<team>/data/updated.txt` (the UTC time of the
copy) when a tab changed. The landing page has no `sheetId` and is skipped. A tab that comes back as a web page or fails to fetch keeps its
old file.

`routesFor()` lists `data/<tab>.csv` as the last route, after both Google
routes. It is only reached when Google cannot be reached at all, so a parent
on a new phone gets standings instead of an error, with a banner naming the
copy's date (`noteSnapshot()` in `app.js` reads `updated.txt` when any tab
came from the snapshot). `?check` shows `site snapshot` in the Read via line.
The files are also the backup: if the sheet is lost, they paste straight
back into a fresh one.

### The change report

Before a tab's copy is replaced, `.github/workflows/sheet-changes.py`
compares the old and new copies and lists the differences in plain words:
each changed row with its cells ("Event was blank, now "tttt""), each added
row, each removed row, all by the row number Google Sheets shows. Rows are
matched with difflib, so one row typed into the middle is one added row, and
rows that only moved in a sort are counted, not listed. The header row is
found by an anchor cell (Date, Field, Rink name, Team name, Sponsor, Player,
No); rows are named by their Date/Away/Home, Field, Rink name, Team name or
Sponsor cells when those headings appear once. On the stats tab, a heading
that repeats (four Player columns) is prefixed with its block title.

The list is appended to `changes/<team>/<date>.md` at the repo root, one
section per run, and shown on the run's page in the Actions tab. It lives
outside `docs/` so GitHub Pages never serves it. It only ever compares
copies that already passed `check-names.py`, so it can't print a full name.

The test suite stubs `data/` to 404 by default, so a local `data/` folder
never masks a failing route; section [22] serves the fixtures from it.

## Setup check

`?check` renders `ui/diagnostics.js` instead of the page: sheet ID, tabs,
what loaded, which route read each tab, which column served which field, the
warnings in full, the Features line, and whether the saved copy is showing.
A `?check` link sits in the footer of every view.

There used to be a tab-ID lookup here that read Google's `htmlview` page and
matched headers to work out the gids. It was 200 lines to save a manager
sixty seconds once a season, and it could never find `gid=0`. The warning
now says to copy the numbers from the sheet's address bar.

## Polling

The poll lives at the bottom of `app.js` and has three rules: the fast pace
(`refreshSeconds`, at least 60 s) while a game is being played, eight times
that otherwise; +/- 25% jitter on every delay so phones never line up; no
fetch while the tab is hidden. "Being played" means a game dated today, not
yet scored, from 20 minutes before face-off to 200 minutes after, using
`timeKey()` from `util/dates.js` for the time. The poll once had its own
time parser that ignored "pm", so an evening game was "live" in the morning
and the fast pace never ran during the game. It also had a game-day
multiplier and a quiet-poll stretch that no recorded failure called for;
both are gone.

`tickFresh()` in `ui/frame.js` patches the "updated N ago" line in place
every 30 seconds. Repainting the whole page to re-word one line was the
flash people were seeing. The `.ics` links stamp `DTSTAMP` from the fetch
time, not the current minute, so a quiet poll produces identical markup and
`render()` skips the DOM write.

## Settings tab

`shape/settings.js` matches row labels by prefix, and the order of
`SETTINGS_ROWS` disambiguates. Matching on "contains" read the readiness
panel below the settings block as more settings ("Your team is filled in"
contains "our team", so the team name came out as the word OK). Anchoring at
the start of the label kills that whole family of collision. "tiebreak
rules" starts with "tie" too, so the tiebreak row sits above the points rows.
Adding a setting means adding a row there, in the right place.

The settings block ends at the first empty Field cell. On the tab-name route
entirely-empty rows are dropped, so the block also stops at the readiness
panel's own headings (`PANEL_HEADINGS`).

The answer column is read by position, not by collapsing non-empty cells,
because collapsing would slide the Notes column into an unanswered row. When
Google types that column numeric its header is blanked too, so the fallback
is "the column just right of Field". When the answer column holds both words
and the points numbers, gviz decides it is numeric and returns the words as
blank; the parser detects that exact shape and names the fix in a warning.

## Teams tab

A team name on the Schedule tab is text, not a reference, so renaming a club
on the Teams tab leaves every game it played pointing at the old name. The
"Also known as" column is the fix: list the old spelling there and both
names resolve to the current one. It also covers the league and a tournament
spelling a club differently ("Jr Terriers" against "Junior Terriers").
Separate several with commas.

The "MyHockey link" column takes a whole MHR address or just the numeric
team ID. A number becomes the address for the current season, where the
season year is this year from September on and last year before that, which
is how MHR counts it. Anything that is not an MHR address is dropped with a
note in the log. `ui/standings.js` `teamHtml()` reads the resulting map and
draws the name as a link that opens in a new tab so the Rink Report is still
there when the reader comes back.

## Schedule tab

Every warning names the sheet row and says what to type. "A row is wrong" is
useless when you are standing in a rink with fifteen rows to check.

Team names snap to the Teams list within two edits (`nearestName()`), so a
rename that leaves two near-identical names gets a warning that says which
Teams-tab name it nearly matched.

A forgotten Event cell: a sheet that runs a season and a showcase always has
both kinds of row, so the mix proves nothing. Nor does the date on its own:
while one team is away at a tournament, two other league teams can have a
normal game that same day. What does prove something is a row with a blank
Event whose away or home team is also in an event game that day. A team
cannot be in two places at once, so that row is a forgotten cell. It drops
into League play on its own, and the parser says so.

Missing scores: at the start of a season every game is in the future and
every score is legitimately blank. Only a game whose date has passed is
evidence of a reading problem.

Dates accept `2026-11-14`, `11/14/2026`, `14 Nov 2026`, `Nov 14 2026`,
`Date(2026,10,14)` (gviz, zero-based month) and Sheets serial numbers.

Period length is an optional eleventh column, and the only one matched by
name alone. It is deliberately kept out of the positional recovery that
rescues a sheet whose headers went numeric, because a sheet written before
this column existed must never have its tenth column mistaken for one. Blank
means the league's own length from the Settings tab, so a tournament that
plays 12 minute periods is one cell filled down its block.

## The game log

The Player Stats tab carries one row per player per game to the right of the
two totals tables, and the page reads both logs. They answer what a season
total cannot: which game an appearance was, and therefore how long it ran and
whether it counted in the league table.

A logged row is matched to its game by date and nothing else. The log records
the opponent the way the scoresheet spells it, "Southtowns 12U Martino",
while the Schedule tab uses the league's name for the club, "Southtown
Stars". Those two will never match and the code does not try. Two games on
one date belong to the same event and run the same clock, so the date is
enough to answer both questions.

### League only, or all games

The Stats page carries a League / All games switch whenever the log holds at
least one league game. Without that there is nothing to split and the switch
would be a button that does nothing, so it is not drawn.

All games is the sheet's own totals table, untouched. That matters: those
totals are what a manager sees in the spreadsheet, and they honour the GP a
manager typed over the formula for a kid who missed a game. League only is
summed from the log instead, because the totals table cannot be split after
the fact.

One thing does not survive the split. A skater only gets a log row when they
put up a point or took a penalty, so their league GP cannot be counted from
the log. It falls back to the team's own count of league games played, which
is the rule the sheet uses by default, and a kid who missed a league game
reads one game high. The note under the table says so rather than leaving a
parent to work it out. Goalies have no such problem: a goalie gets a row
every game they dress for, so every column in their league line is counted,
GAA included.

## Player Stats tab

The tab holds several blocks side by side: skater totals, goalie totals, then
the game logs that feed them. The page reads the two totals blocks only, so
the sheet's formulas do the adding and the page and sheet can never disagree.
Each block is found by the one text header that survives every route:
"Player" for skaters, "Goalie" for goalies. Numeric headers beside them are
matched by name when present and by position when Google blanked them. Each
block runs from its anchor to the next block's anchor; the game logs further
right start with a Date column, which is where the goalie block ends. A row
is a player until the name cell goes blank.

"SV%" loses its % in `norm()` and reads as "sv", which once claimed the Saves
column when Google had blanked the real Saves header. A percent sign now
means a percentage and nothing else.

Names come out as first name and last initial (`shortName()` at shape time),
so a full name never reaches the model, the cache or the DOM. The page is
public.

## Game types

Not every game counts toward anything. `Game type = Bracket` is decided by
the pool standings rather than feeding them, so it stays on the schedule and
leaves the table. A scrimmage counts toward nothing at all, and putting one
in a qualifying record would be a real error. Clubs word the second kind
differently, so `EXHIBITION_WORDS` matches the words managers actually type.
The schedule row says BRACKET or the manager's own word in a tag, so nobody
has to work out why a 6-1 win did not move the record.

## Standings and tiebreaks

Real events publish real tiebreak sequences and they disagree with each
other, so `RULESETS` in `model/standings.js` is data, not code. Two-team and
three-or-more paths are separate because most rulebooks separate them:
head-to-head settles a pair and is meaningless across three clubs who did not
all play each other.

`orderTable()` sorts by points, then settles each level group with the
event's own sequence. A group of exactly two uses the pair path; three or
more use the other path, and any pair still level afterwards gets the pair
sequence applied to just those two (`resettlePairs`). Teams a ruleset cannot
separate keep the same rank number rather than being put in an invented
order. `allEqual()` decides that, and for a pair it also looks at
head-to-head: a pair the sequence split on head-to-head used to be flagged
level and shown with one rank number. Do not add a special case to the
comparator; add a sequence.

`wnyahl` is the one ruleset that is not a sequence, because the WNYAHL
rulebook restarts. `wnyahlPlace()` takes teams level on points and applies,
in order: step 1, only when every tied team has played every other, their
games against each other (points, wins, differential, goals for divided by
goals against); then step 2, all games (wins, differential with no cap,
quotient). The first measure that separates anyone places them, and each
group still tied starts again at step 1 with only its own members, as the
rulebook says ("the remaining tied teams shall start the tie breaking
process again at step 1"). A quotient with no goals against beats any real
quotient, and those teams are then ordered by goals for. The rulebook's
last steps (periods won, quickest first goal, a shootout) need data the
sheet does not have, so teams still tied after step 2 are marked level with
a `tieKey`, and the table only shares a rank number between rows with the
same `tieKey`. Each row carries `vs`, its record against each opponent, for
step 1. Forfeits are recorded by the league as 1-0 wins, so a forfeit typed
into the sheet as 1-0 is already scored the league's way.

## Team rating

The Rtg column in every standings table, from `model/rating.js`. It answers
"how many goals a game better or worse than an average team in this table
is this team, once you count who they played." +1.0 is about a goal a game
better than average, and subtracting two teams' ratings gives roughly the
margin you would expect between them.

It is the MyHockey Rankings idea (each game is worth the opponent's rating
plus the goal margin, and a team's rating is the average of its games) with
these rules, all in the `RATING` block at the top of the file:

- **Margins count up to 8 goals.** A 12-0 win is worth 8, the same as 8-0,
  so a runaway score or a typo (19-2 for 9-2) can't swing a table. MHR caps
  at 7. The WNYAHL tiebreak itself has no cap; in simulation no cap and an
  8-goal cap predicted equally well, so the cap stays for the typo guard.
- **Two ghost games.** Every team starts with two games at exactly average.
  After three real games they still hold a team near the middle; after
  twenty they barely register. This is what keeps one early result from
  deciding the table, and it is where most of the gain over MHR comes from.
- **Every game counts the same.** No fading of older games, so a rating
  only changes when a score comes in.
- **Solved together.** Every rating depends on the others, so all of them
  are recomputed round after round (up to 200, usually far fewer) until no
  rating moves more than 0.0005, and after each round they are shifted so
  the average team sits at 0. `ghostGames` must stay above 0 or the rounds
  never settle.
- **Bad scores are dropped.** A game whose score is not a finite number is
  left out before anything else, or it would turn every rating into 0.0.

How it got here (September 2026). The first version trimmed margins hard
(goals 1 to 3 in full, 4 to 6 at half, nothing past 6) and faded games by
age with a 60-day half-life. Two peer reviews and a follow-up simulation
(Youth Hockey/Rink-Report-Rating-Peer-Review-2026-09-23.md) showed that in a
league with real blowouts the trimming threw away information: predictions
were worse, a 1.0 gap meant about 1.5 goals instead of 1, and a team beating
everyone 9-1 topped out around +3.4. With a straight 8-goal cap and no fade,
predictions were the best of every version tested, a 1.0 gap is about 1
goal, and that dominant team reads about +6. The fade helped nothing in any
test and made ratings drift on days with no games, so it was removed.

The rating uses exactly the games the table counts: `standings()` collects
them as it tallies and hands them to `ratings()`. So an event table rates
from that event's pool games, and the league table from league games. It
never changes the order; points and the tiebreak sequence still do that. A
team with no game yet shows a dash, not 0.0, because 0.0 would claim it is
average. Rounding is done on the size and the sign put back, so two
mirror-image teams always show mirror-image ratings.

Once a season has enough results, check the knobs against it: for each
game, did the higher-rated team (rated from the games before it) win, and
was the margin close to the rating gap? Change one knob at a time.

Under each table that has a score in it, `ratingNoteHtml()` in
`ui/standings.js` prints a short guide for parents: what the number is, that
0.0 is average and +1.0 is about a goal a game better, how to size up a game
by subtracting, and the two rules (8-goal cap, two average games). It does
not claim the league uses the same cap: WNYAHL does not cap differential. It is its
own block, not folded into the tiebreak sentence, so it reads as a key.

The column shows goals with one decimal (+0.8), on purpose. A whole-number
version (tenths, +8) was tried and dropped: it sat next to the +/- column,
which is in real goals, and read as eight goals.

`rating: false` in the features block removes the column and its guide.

## Views

The Event column drives everything. Blank means league play; a name means
that showcase or tournament. `dataViews()` returns every view the schedule
implies, league plus one per event, derived and never configured.

The bar is deliberately smaller than the data. By February a season carries
the pre-season showcase, two tournaments and a playoff, and a bar that names
every one of them is a bar nobody can read. So `buildViews()` shows League,
the one featured event (being played this weekend, else the next one on the
calendar, else none, because the bar should not advertise a tournament that
already happened), an Events tab when any event is not the featured one, and
Stats when the stats tab read. A past event opened from the Events list
renders in full and lights the Events button; `barKeyFor()` decides which
button lights for which view.

Landing view, in order: an event with a game within a day of today; the
Settings tab's "which view opens first"; league.

`teamsInView()` lists the clubs you actually play in that competition. A club
that only turns up in scrimmages, or only at a showcase, has no business
sitting at 0-0-0 in the league table all season. Pool membership belongs to
the event, not the team: `poolsInView()` reads it from the games.

## Next game

`nextgame.js` prefers our next unplayed game, else the next game on the
schedule. A past game with no score shows as "Waiting on a score" instead of
sitting there as next all week, and gets no directions or calendar links:
nobody needs directions to last Tuesday.

## Standings

Ranking a table where nobody has played yet puts a "1" beside every club,
which is technically true and reads as broken. Until a score is in, the
table is a team list and gets no numbers. On the League view before the
first league score, the table is replaced by the pre-season card: when play
starts, one line per past event with our record there, and the division as a
list. Event views keep their table even at 0-0.

A single pool needs no heading above its own table, so it names the section
instead; otherwise the Pool column would never reach the page.

## Type

Two faces, one family. Barlow Condensed 700 sets the team names and the
section heads. Barlow sets everything else, including every number: it has
tabular figures, so the standings columns line up on their own and the page
does not need a monospace to keep them square.

That is the rule worth keeping. Before this, small text of every kind was set
in a monospace, which is right for a score and wrong for the word
"Directions", and the page as a whole read like a developer tool. A monospace
survives in exactly one place, the ?check readout, where the columns are the
point and the reader is whoever is fixing the sheet. That one uses whatever
monospace the machine already has, so it costs nothing to download.

Both faces come from Google Fonts, non-blocking, so the page paints in a
system font and swaps when they arrive. The two stacks are `--f-display` and
`--f-text` at the top of rink.css. Changing the whole look of the page is
changing those two lines.

## Gameday post card

Add `?admin` to the URL and every unplayed game of ours grows a "Gameday
post" button. It opens a panel where the manager picks:

- **Template**: Blueline, Echo or Faceoff. These are the three directions
  from the Claude Design file (`Gameday Post.dc.html`, 1a to 1c), redrawn on
  a canvas.
- **Size**: Feed 4:5 (1080 x 1350), Square (1080 x 1080) or Story 9:16
  (1080 x 1920).
- **Photo**: "Choose photo" opens the phone's photo picker. Without one,
  the photo area is a hatched block of club color, so the post still looks
  finished.
- **Hype line**: starts as "Protect the barn." for a home game and "Take
  their ice." away. The box changes it for this post; the switch under it
  takes it off.

Then Share or Download makes the PNG. No web address on it.

The last template and size picked are kept in localStorage
(`checktherink.post`) so the next post opens the same way. The photo is
kept until the page is closed, since a weekend of posts usually wants the
same one; the hype line resets per game.

### Where the code is

```
ui/postcard.js      the panel: picker, photo, hype line, fonts, crest, save
ui/post/kit.js      shared drawing: sizes, club colors, type fitting, the
                    photo area, the crest, chips, the tilted quote box
ui/post/blueline.js photo on top fading into a club-color panel
ui/post/echo.js     full-bleed photo, stacked GAME DAY with outline echoes
ui/post/faceoff.js  accent-color card, slanted photo band, vs badge
```

A template is a module exporting `{key, name, draw(ctx, card)}`. `card` is
built once by `cardFor()` in postcard.js and holds everything already
worked out: height, our short name, the opponent, "VS" or "@", the tag
("HOME GAME", "AWAY GAME", or the event name at a showcase), the date as
"SAT · OCT 3", time, rink, hype line, crest, photo and colors. Templates
never read `state`. Adding a fourth template is a new file in `ui/post/`
and one line in the `TEMPLATES` list.

### Colors and names

The designs were drawn in Wings navy and gold. On the canvas every color
comes from the club's two colors in teams.js, through theme.js
(`window.CHECK_THE_RINK_CLUB.card`), so another club's posts come out in
its own colors. The photo tint is the club's main color lightened a
little, laid over the photo with multiply. Our name is the team's `short`
name from teams.js ("Wings"), or the full team name when it has none.

### Things that are deliberate

The panel is appended to `<body>`, not to `#app`. `render()` rewrites `#app`
in one innerHTML write, so a poll landing mid-draw would throw the canvas
away. The panel's own controls use `data-post` and are handled inside
postcard.js; only Close and Save go through app.js (`data-act`).

Type is laid out from cap heights, not font sizes. Every word on a post is
in capitals, and working from the height of an "H" keeps the gaps the same
between Anton and Barlow Condensed.

Layout is worked out from the foot up. The hype line can take one to three
lines and a long opponent can take two, so the photo gets whatever height
is left instead of type running into it. Names shrink until they fit; a
rink that still does not fit is cut with an ellipsis, as in the design.

The page only loads Barlow Condensed 700. Anton and the other Barlow
Condensed weights are added the first time a panel opens, so parents never
download them. Canvas does not wait for a webfont the way the DOM does, so
the panel waits for that stylesheet and then `document.fonts.load` before
drawing. A post drawn too early comes out in a fallback face.

The crest is `post-logo.png` in the team folder when there is one, a
larger copy for the posts (the masthead `logo.png` goes soft at 300px
wide), and `logo.png` otherwise. Both are same-origin, and the photo is a
`blob:` URL made from the file on the phone, so the canvas is never
tainted and `toBlob` works. The photo is never uploaded anywhere.

Instagram does not reliably show up in the share sheet for a picture that
comes from a web page (tried Sept 24 2026: the sheet opened, Instagram was
not in it). So the panel does not promise a straight path to Instagram. The
route that works is to get the picture into the phone's photos and post it
from the Instagram app, and the line under the post says how for each
device:

- iPhone: Share, then Save Image, which puts it in Photos. A download link
  on an iPhone lands in the Files app, where Instagram cannot see it, so
  Share stays the first button there.
- Android: Download, which lands in Downloads, where Instagram's photo
  picker looks.
- Laptop: Download, then send it to the phone.

Share only appears where `navigator.canShare` takes files. Download always
appears and always downloads (`savePost(..., false)`). Files are named like
`wings-vs-cheektowaga-warriors-2026-09-28-feed.png`.

`?admin` is tidiness, not security. Everything the page holds is public
either way; the flag only keeps a button out of a parent's way.

## Coaches Corner

Also on `?admin`, on the league view only: a card of team-level trends for
the manager to pass to the coach. `model/coach.js` works the numbers out,
`ui/coach.js` draws them.

- Record, goals for and against, and league play on its own line when the
  season also has showcase or tournament games.
- The run the team is on, counted back from the latest game ("No loss in
  the last 7").
- Goals for and against per game, and how the one-goal games and ties went.
- How much of the scoring comes from the top two scorers, for the season and
  for the last five games, plus how many kids have scored and have a point.
- Penalty minutes per game.
- A month-by-month table, once there are two months to compare.

Results come from the Schedule tab, our finished games with scrimmages left
out, the same as the standings. Scoring comes from the Player Stats tab: the
season totals, and the game log for the last five games.

**It names no player.** `?admin` hides the card but does not protect it: one
parent who adds it to the address sees everything. So the card only says
what anyone could add up from the public page, and "two players have 16 of
the 35 goals" never says which two. Anything about a named kid belongs in a
private note to the coach, not here.

"Copy as text" puts the same lines on the clipboard as plain text, for an
email or a text message. The card and the text are built from one list
(`points()`), so they cannot disagree. `util/clipboard.js` falls back to the
old copy command where the clipboard API is missing. The button has its own
class, `.coachbtn`: the gameday post code and its tests look for `.postbtn`,
and a Copy button with that class sat first on the page and caught their
click.

## Practice ideas

Inside the Coaches Corner card, under the month table: up to three focus
areas for the next practice, each with the team number that picked it and
two drills. `model/practice.js` holds the rules and the drills;
`ui/coach.js` draws them and adds them to "Copy as text".

**No AI runs on the page.** The site is static on GitHub Pages, and calling
an AI service from it would put a paid key where anyone can read it. So the
drills were written ahead of time and the page picks them by rule. The
block says so in one line.

**Skating and skills comes first, every week.** Game stats say nothing
about skating or puck skills, so no rule could ever pick that work. Instead
`skillsFor()` shows one of six sets (edges, crossovers and turns, stops and
starts, puck control, passing on the move, backward skating), changing each
Monday and going round the list in order. Each set is three half-ice drills,
two skating and one puck (or one skating and two puck), tagged Skating or
Puck skills, for a 10 to 15 minute warm-up. The week is counted from the
local calendar date in UTC days, so a time change never moves the Monday.

After the warm-up come the focus areas the numbers point to. The checks, in
order. The first three that apply are shown:

1. Tighten up in our end: goals against up a goal a game on the month
   before, or over 3 a game for the season.
2. Finish our chances: goals for down a goal a game on the month before,
   or under 3 a game for the season.
3. Get more players scoring: two players with half the goals or more, in
   the last five games first, then the season. Needs 6 goals to judge.
4. Cut the penalties: 4 penalty minutes a game or more.
5. Win the close ones: 3 or more one-goal games and ties, fewer than half
   of them wins.

Month comparisons need 2 games in each month. When nothing applies, one
"Keep the basics sharp" entry shows instead of an empty block.

Ice time varies, so every drill is tagged Half ice or Full ice, and every
full-ice drill says how to run it on half ice. Reasons use team numbers
only, the same rule as the rest of the card. The thresholds are named
constants at the top of `model/practice.js`.

## Results order

The card opens on **Ours**, not All. A parent opens the page to find out
when their own kid plays next. On the Wings' own Schedule tab that changes
nothing, because the tab only lists Wings games; it matters at a showcase,
where the pool's other games are on the tab too. All is one tap away, and
when Ours empties a card that has games in it the card says so and names
the button rather than going blank.

A season leads with what is coming: every game still to be played, nearest
first, so the next one sits at the top of the card in September and in
February alike. The finished games follow under a "Final scores" divider,
most recent first, because the score people ask about is the one from the
game that just ended. Before the first score of the season there is no
divider and the card is simply a schedule.

A showcase weekend is a different animal and reads straight forward, played
and unplayed together: you are standing in the rink all weekend and what you
want is the next thing on the sheet. The order is decided per view, not per
game, so it cannot flip halfway through a weekend as scores come in.

Time and rink stay on the row after a score goes in, because a finished game
still gets asked about.

## Stats

Saves and save percentage are not shown. Most youth scoresheets never record
shots, so a save total is a count of whichever games someone happened to
tally, and a percentage built on it looks exact and is not. GAA needs only
goals against and minutes, which every sheet has, and is computed on the page
from those two totals so it stays right whether the sheet's fifth goalie
column says SV% (older tabs) or GAA.

GAA is per full game, not per 60 minutes. Sixty is the pro number: a youth
game is shorter, so dividing by 60 inflates every goalie on the page. The
league's length is the Period length row on the Settings tab, where a manager
types the periods the league states, "15, 15, 12", and the page adds them up.
A single number is taken as the whole game, so "42" means the same thing.
With no row at all the page assumes three 15 minute periods.

Showcases and tournaments often run a shorter clock, and then there is no
single length to multiply by: a season that mixes a 45 minute league game
with a 36 minute tournament game has not been played in games of one size.
So each appearance in the goalie log is counted as the share of a full game
it actually was, its minutes over that game's own length, and the goals are
divided by the total. With every game the same length this gives exactly the
old answer, which is the point. Without a log at all the page falls back to
the season totals against the league's length.

The note under the table always names the number it used, and says so when
the schedule overrides it somewhere.

### The record column

Wins and losses are one column, "3-1-1", the same shape as the record chip on
the masthead and the standings table.

Ties are why it is not two columns read straight off the tab. The totals
block counts wins and losses, so a game that ended level is missing from both
of its columns and a record built from them is a game short. The goalie log
has a Result cell for every game, so the record is counted there instead:
"W", "Win", "T" and "Tie" all land in the right bucket, and anything else is
left out rather than guessed at. This is the same rule GAA already follows,
where the log beats the totals block because it knows more.

A tab with no game log at all still prints the sheet's own wins and losses,
and no tie count unless the tab carries a T column of its own. A zero there
would be a claim the tab cannot make.

The minutes in the sheet and the Period length have to describe the same
game. If the goalie log records 42 minutes for a full game while the setting
says 45, every GAA comes out about 7 percent high.

## Directions and calendar links

`model/links.js` builds both on the phone from data already on the page. No
server, no calendar service, nothing to keep in sync.

- **Directions.** The Rinks tab (`Rink name`, `Address`) is optional. A rink
  whose address is on the sheet becomes a link on the next-game card and on
  unplayed schedule rows; a rink without one stays plain text. Rink names
  snap within two edits, the same rule as team names ("Wlland JBM" against
  "Welland JBM" was seen on the live sheet). Apple devices get a
  `maps.apple.com` link, which opens the Maps app; a Google Maps link there
  lands on a page asking you to install the app. Everyone else gets Google
  Maps. `?check` lists the rinks still waiting on an address.
- **Calendar.** The next-game card offers an `.ics` file (a `data:` URL) and
  a Google Calendar link. The bottom of the schedule offers one `.ics` with
  every unplayed game of ours, scrimmages included, because they are still a
  drive to a rink. Times are floating local time (no Z, no TZID) with a
  90-minute slot (`GAME_MINUTES`): a game in Buffalo is at 7:10 wherever the
  phone happens to be. No face-off time means an all-day entry. The location
  is rink plus address when known, and the description links back to the
  page.

## Sponsors

The businesses paying for the season sit high on every view: masthead,
next-game card, sponsors, then the bar. The block started at the foot of the
page, where a printed program puts it, and that turned out to be where nobody
scrolls. Folding is what bought the higher slot. Anything that walks `#app`'s
children by position has the sponsors card sitting third; the QA suite
selects content sections with `.card:not(.sponsors)` for that reason.

- The Sponsors tab is `Sponsor` / `Tier` / `Website`. Only `Sponsor` is
  required. Gold, silver and bronze sort in that order however the rows are
  typed; an unknown tier still shows, after those three, in the order it
  first appears; rows with no tier come last under no label.
- Names in boxes, not logos. Logo files would need re-cropping every time a
  sponsor changed; the outlined box is what the paper banner already does.
  The tier is said three times: by its label, by the size of the box, and by
  the colour of its outline. `tierClass()` derives that class from the tier's
  own rank, never from the row's position, so a team with gold and bronze
  sponsors and no silver does not paint its bronze row silver.
- A linked sponsor is underlined, because on a phone there is no hover to
  discover a link with.
- The header is a `<button data-act="sponsors">` with `aria-expanded` and
  `aria-controls`; the body is always in the markup and `hidden` is what
  folds it, which keeps screen readers in step. Folded, the eyebrow still
  reads "9 sponsors", so a sponsor is never entirely invisible.
- The contact line under the names is the "Sponsor contact" row on the
  Settings tab. Blank hides the line.

## Cache key

`CACHE_KEY` in `state.js` is bumped whenever the stored shape of
`state.data` changes (v3 added stats, v4 rinks, v5 sponsors). An old cache
with a new key is simply ignored.

## Adding things

**A new feature switch.** Only for a whole card or a data-driven piece.
Add the name to the `features` block in `index.html` with a one-line
comment, to `FEATURES` in `state.js`, and one `on("name")` test where the
feature enters the page. Section [20] of `tests/qa.js` already proves the
mechanism; add a check only if the new switch touches something the
existing ones do not.

**A new page or tab.** Add a component in `ui/` that returns HTML. Give the
view a key in `buildViews()` (`{key:"stats", tab:"Stats", stats:true}` is
the pattern) and a branch in `render()`. Give it a line in `diagnostics.js`.
Write the test before the component.

**A new sheet tab.** Add its name and gid to the CONFIG block in
`index.html`, a `shape/<tab>.js` that turns rows into objects and warnings,
and one entry in `OPTIONAL_TABS` in `app.js` (or a `getCSV()` call beside
the required three). Add it to the tab list in `snapshot.yml`.

**A new setting.** One row in `SETTINGS_ROWS` in `shape/settings.js`, in the
right place: labels match by prefix and order disambiguates.

**A new tiebreak sequence.** One entry in `RULESETS` in `model/standings.js`.

## Conventions

- Plain functions, `var`, no classes, no dependencies, no transpiling.
- One statement per line, blank lines between logical steps, a JSDoc
  docblock on every function. Comments carry the one rule a reader needs;
  the reasoning lives in this document.
- No em-dashes in comments or docs.
- The CSP in `docs/_headers` allows scripts only from the site itself and
  connections only to Google. A CDN import will be blocked.

## Testing

`tests/qa.js` boots the real page in headless Chromium with every Google
request answered from `tests/fixtures/`, drives it, and checks the DOM: 340
checks across the read routes, the Events tab in three calendar situations,
the Stats tab, directions and calendar links, sponsors, MyHockey links, the
feature switches, the team rating, the September 2026 review fixes (PM face-off, team-name
snap, garbled schedule, transient 404, head-to-head rank, DTSTAMP) and the
saved copy. `npm install` once, `npm test` after any change. Screenshots
land in `tests/out/`. The number of checks is not a target; add one when a
fix would otherwise be unprotected.

## Deploying

See `DEPLOY.md`. Scores never require a deploy; only a code change does.
