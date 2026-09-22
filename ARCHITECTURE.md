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
  index.html          The One Timer landing page (see "The One Timer" below)
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
    util/             text.js  dates.js  csv.js        no app knowledge
    sheet/routes.js   read one tab: raw export, tab name, then the saved copy
    shape/            settings.js  teams.js  games.js  stats.js  rinks.js
                      sponsors.js
                      CSV rows -> objects, plus manager warnings
    model/            game.js  standings.js  views.js  links.js
                      what the data means: records, tiebreaks, tabs,
                      and the directions / calendar links built from a game
    ui/               frame.js (masthead, bar, banners, status, footer) and
                      one component per card, each (state) -> HTML string
.github/workflows/    snapshot.yml, the job that writes each team's data/
tests/                Playwright suite + fixtures; see tests/README.md
```

Modules are native ES modules (`<script type="module">`). Every phone that
can open a Google Sheet can run them. The one consequence: the page has to
come from a web server, not a `file://` double-click. Use
`python3 -m http.server 8000` in `docs/` for local preview, then open
`localhost:8000/` for the landing page or `localhost:8000/wswings12u/` for
the Wings.

## The One Timer: team folders and club colors

The site is one GitHub Pages repo on one address. The landing page sits at
the root and every team gets a folder: `theonetimer.<tld>/wswings12u/`.
All teams run the same `js/` and `css/`; a team's folder holds only what is
its own (config, crest, manifest, saved copy of its sheet). Adding a team is
a folder plus an entry in `teams.js`.

A team page's shell loads `../theme.js` and `../teams.js` in the head,
before the page paints, and calls `OneTimerTheme.applyTeamPage()`. That
finds the team by its folder name (the last part of the address, or
`RINK_CONFIG.folder` if a page sets one), looks up its club, and writes the
club's color slots onto `:root`. `rink.css` still carries the Wings' values
as a fallback, so a folder missing from `teams.js` looks like the Wings and
shows no "All teams" row. `window.ONE_TIMER_CLUB` holds what was applied;
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
`OneTimerTheme.check()` says so in plain words and the landing page logs it.

**Browser storage is per address, not per folder.** Every team shares one
address, so every key the page stores carries its folder's path:
`rinkreport.v5:/wswings12u/`, `rinkreport.sponsorsOpen:/wswings12u/`
(`scopedKey()` in `state.js`). Without it, two teams opened on one phone
paint each other's standings. Test [30] covers it.

**The landing page** (`landing.js`) groups teams by club, sorts clubs by
name and teams by age (8U, Squirt, 12U...), and shows a search box once
there are 8 or more teams. Search matches every word typed, against name,
club, age group, league and a team's `aka` names. The teams a phone picked
are remembered (`onetimer.recent`, newest first, up to three): the newest
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
`mhrLinks`, `monoNumbers`. `on(name)` in `state.js` is true unless the block says `false`;
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

`.github/workflows/snapshot.yml` runs every six hours on GitHub. For every
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
post" button. It opens a panel that draws a 1080 x 1080 PNG for Instagram:
crest and club name, a tilted full-bleed gold bar carrying the hype line,
the matchup with both clubs set the same weight either side of a gold VS or
AT diamond, and the date and puck drop on an angled gold slab across the
foot. Nothing is level except the header, which is what separates a poster
from a notice. No web address on it.

The hype line follows how far off the game is: "GAMEDAY" today, "GAMEDAY
TOMORROW", then "GAMEDAY IN 3 DAYS" or "GAMEDAY IN 2 WEEKS" from
`countdownText()`. "GAMEDAY" alone on a game three weeks out would be a
lie, and "GAMEDAY TODAY" reads badly. `ui/postcard.js` owns it end to end, canvas only, no library and no
build step.

The matchup is measured before anything is painted. Both names step down in
size together until the stack fits between the header and the slab. The
first cut drew each name at a fixed y and a name that wrapped to two lines
ran straight through the divider.

Three things about that file are deliberate:

The panel is appended to `<body>`, not to `#app`. `render()` rewrites `#app`
in one innerHTML write, so a poll landing mid-draw would throw the canvas
away.

It waits on `document.fonts.load` before drawing. Canvas does not hold off
for a webfont the way the DOM does, and a card drawn too early comes out in
Times.

`logo.png` is same-origin, so drawing the crest leaves the canvas
exportable. A crest served from another host would taint it and `toBlob`
would throw.

Saving splits by what the browser can do. Where `navigator.canShare` takes
files, the button opens the share sheet, which is the only route that ends
in Instagram on an iPhone; a download link for a generated image does
nothing useful there. Everywhere else it downloads a PNG.

`?admin` is tidiness, not security. Everything the page holds is public
either way; the flag only keeps a button out of a parent's way.

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
request answered from `tests/fixtures/`, drives it, and checks the DOM: 205
checks across the read routes, the Events tab in three calendar situations,
the Stats tab, directions and calendar links, sponsors, MyHockey links, the
feature switches, the September 2026 review fixes (PM face-off, team-name
snap, garbled schedule, transient 404, head-to-head rank, DTSTAMP) and the
saved copy. `npm install` once, `npm test` after any change. Screenshots
land in `tests/out/`. The number of checks is not a target; add one when a
fix would otherwise be unprotected.

## Deploying

See `DEPLOY.md`. Scores never require a deploy; only a code change does.
