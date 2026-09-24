# Rink Report: deploy checklist

About 20 minutes, once. After this you never touch the site again, only the sheet.

> **Check The Rink layout.** The site now holds more than one team. Each team
> has its own folder under `docs/` (the Wings are `docs/wswings12u/`), and
> wherever this guide says `index.html` or `logo.png` it means the ones in
> the team's folder. The landing page at `docs/index.html` lists every team
> from `docs/teams.js`; a new team needs a folder and an entry there.

You need: a Google account, and a free GitHub account (email signup, no card).

---

## Part 1: Get the sheet live (8 minutes)

**1. Upload the template to Drive.**
Go to drive.google.com, drag in `Rink-Report-Schedule-Template.xlsx`.

**2. Convert it to a real Google Sheet.**
Double-click the file. It opens in preview or in Sheets in xlsx mode. Use **File → Save as Google Sheets**. That makes a second file, the one you'll actually use. The `.xlsx` original can sit there or go in the trash.

Why this matters: the page can't read an xlsx sitting in Drive, only a native Google Sheet.

**3. Fill in the three tabs.**
Settings first, then Teams, then Schedule. The workbook grades itself as you go:

- **Settings tab**: the *Before you send the link to anyone* panel, in columns F and G to the right of your answers. Nine lines, each green when it passes and red with the actual fix when it doesn't. Don't move on until all nine say OK. Keep it out of column B: that's the column the page reads settings from.
- **Schedule tab**: cell A2 keeps a running count of rows that need attention, and column K names the problem row by row.
- Bad cells turn red as you type them.

Don't rename the tabs. The page finds them by name: `Settings`, `Teams`, `Schedule`. The `Start here` and `Example` tabs are ignored, leave them or delete them.

**4. Make it readable.**
**Share** button, top right → under **General access**, change *Restricted* to **Anyone with the link**, and leave the role as **Viewer**.

This is required. The page reads the sheet anonymously from every parent's phone, so the sheet has to be link-readable. Nobody can edit it this way, and the sheet holds the same scores the page already shows publicly.

**5. Add your co-manager.**
Same Share dialog, top half: type their email, set them to **Editor**. That's the whole permission model. No passwords.

**6. Copy the sheet ID.**
Look at the URL while the sheet is open:

```
https://docs.google.com/spreadsheets/d/  1a2B3cD4eF5gH6iJ7kL8mN9oP0qR  /edit#gid=0
                                         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                         this is the sheet ID
```

Copy the part between `/d/` and `/edit`. It's long and random-looking. That's correct.

---

## Part 2: Point the page at your sheet (2 minutes)

Open `index.html` in any text editor (TextEdit, VS Code, Notepad, anything but Word). Near the top you'll find:

```js
sheetId: "PASTE_YOUR_SHEET_ID_HERE",
```

Replace what's between the quotes with your sheet ID. Keep the quotes and the comma.

Save. Don't change anything else.

---

## Part 3: Put it on the internet (10 minutes)

Use GitHub Pages. It's free, your own domain costs nothing extra, and it does not
meter deploys. That last part is why we're here: Netlify's free plan became
credit-based, every folder you drop onto it costs 15 of 300 monthly credits, and
when they're gone the site goes dark until the next month. The Rink Report went
down that way on September 2, 2026, after a week of iterating. GitHub Pages has
no such meter, upload as often as you like.

**The live repo is `github.com/ewm/rink-report`**, published from the `main`
branch, root folder, at `https://ewm.github.io/rink-report/`. The steps below
are for building it from nothing, e.g. for another club.

**1.** Go to **github.com/new**. Name the repository (`rink-report`), leave it
**Public** (Pages is free only for public repos), switch **Add a README** on,
**Create repository**.

**2.** Go to `github.com/YOURNAME/rink-report/upload/main`. Drag the whole
`docs` folder onto the upload page. Dragged folders keep their structure, so
everything lands under `docs/`, which is where the next step points Pages.

Type a one-line note in **Commit summary** and click **Commit changes**.

**3.** **Settings → Pages**. Under *Build and deployment*, Source = *Deploy from a
branch*, Branch = `main`, folder = `/docs`, **Save**.

**4.** Wait a minute or two. The page is at
`https://YOURNAME.github.io/rink-report/`. The first build sometimes takes five
minutes; a 404 before then is normal.

`.nojekyll` is an empty file that tells GitHub to serve the folder as-is instead
of running it through its Jekyll site builder. Keep it. `_headers` is a Netlify
file and does nothing here; it's harmless, so it stays for the day someone
deploys this on Netlify again.

If you would rather use Netlify anyway, the drag-a-folder flow at
app.netlify.com/drop still works. Just know that a paid **Personal** plan ($9 a
month) is the only way to un-pause the site once the free credits are spent.

---

## Part 4: Check it before anyone sees it (3 minutes)

**1.** Open `https://ewm.github.io/rink-report/?check`

That's the diagnostic page. It should show your sheet ID, a recent fetch time, your team name, and counts for teams and games. Warnings there are worth reading, that's the page telling you what it couldn't make sense of.

**2.** Open the plain URL in a private/incognito window. That's what a parent sees, logged out. If the standings render, you're done.

**3.** Enter a fake score in the sheet, wait a minute, hit Refresh on the page. Confirm it moves. Then undo it in the sheet (Ctrl/Cmd-Z, or File → Version history).

---

## Part 5: Your own domain (optional, about $10 a year)

You do not need this. `ewm.github.io/rink-report` is free, permanent, and works
exactly as well. Skip this section unless you want the link to read like it
belongs to the team, which mostly matters if you ever hand this to other clubs.

### What it costs to run, all in

| | Per year |
|---|---|
| Google Sheet | $0 |
| GitHub Pages hosting | $0, no bandwidth or deploy meter that matters at this size |
| `ewm.github.io/rink-report` | $0 |
| HTTPS certificate | $0, issued and renewed automatically |
| **Your own domain, if you want one** | **about $10** |

The free tier is not a trial. GitHub's soft limits are 100 GB of bandwidth a
month and 10 builds an hour. A hundred parents refreshing a 250 KB page all
weekend is a rounding error against the first, and the second only bites if you
commit more than ten times in one hour.

### Buying the domain

Buy it at Cloudflare Registrar. They sell domains at the wholesale registry price
with no markup, no first-year discount that triples on renewal, and no upsell
page. A `.com` is about $10–11 a year. WHOIS privacy is included rather than
sold to you for another $9. Porkbun and Namecheap are fine too.

Pick something short enough to read off a sign at a rink. `wingsstandings.com`.
`wswings12u.com`. Avoid hyphens; nobody types them correctly.

GitHub does not sell domains or host DNS. The domain and its DNS records live
at the registrar; the records just point at GitHub.

### Pointing it at the site

At your registrar, open the domain's **DNS records** and add five:

```
Type   Name   Content              Proxy (Cloudflare only)
A      @      185.199.108.153      DNS only  (grey cloud, not orange)
A      @      185.199.109.153      DNS only
A      @      185.199.110.153      DNS only
A      @      185.199.111.153      DNS only
CNAME  www    ewm.github.io        DNS only
```

The grey cloud matters on Cloudflare. Its orange-cloud proxy sits in front of
GitHub and stops GitHub from verifying the domain and issuing the certificate,
which leaves parents looking at a browser security warning. Turn the proxy off
on all five records.

Then on GitHub: **Settings → Pages → Custom domain**, type the domain
(`wswings12u.com`, no `https://`), **Save**. GitHub runs a DNS check; give it a
few minutes to go green. It also commits a one-line file called `CNAME` into the
repo. Leave that file alone, deleting it turns the domain off.

Once the check passes, tick **Enforce HTTPS**. The box can stay greyed out for
up to 24 hours while the certificate is issued; that's normal. When it's
available, tick it and the padlock appears.

After this, the site answers at the bare domain, `www`, and still at
`ewm.github.io/rink-report` (which redirects), so nothing is ever down while you
wait.

### What to do about the year after

Turn on auto-renew when you buy it, and put a note in the team's shared calendar
for the renewal month. A youth hockey site dying because a $10 card expired is a
sad and extremely common way for this to end.

---

## League play and showcases in one sheet

The **Event** column on the Schedule tab is the switch.

Leave it **blank** for league games. Put the showcase or tournament name in it for those games, spelled identically on every row of that event. The page reads the column and grows a tab for each one, so parents tap between LEAGUE and the showcase. Nothing to configure, add rows with an event name and the tab appears.

Inside a showcase, two more columns start earning their keep:

**Pool / division** splits the standings into separate pool tables. Pool membership comes from the games, not the Teams tab, so a club can be in Pool A at one showcase and Pool B at the next.

**Game type** set to `Bracket` keeps a game out of the pool standings while still showing it on the schedule. Leave the teams blank until seeding is known and the row still validates.

A **showcase** and a **tournament** are different animals. A tournament runs pool play to seed a bracket and crowns a champion, so the standings decide something. A showcase is a set of guaranteed games with no bracket and no winner, so nothing is being seeded. The page tells them apart by whether the event contains any `Bracket` rows: with a bracket it says *Pool standings*, without one it says *Round robin* and stops pretending to seed.

## Adding a tournament mid-season

Rows in the sheet. No deploy, no config, nothing in `index.html`. About ten
minutes, and it works the same in January as it does today.

**1. Add any new clubs to the Teams tab.** Put `tournament only` in the Notes
column so next season you know why they're there. Teams that only appear in the
tournament stay out of your league standings automatically.

**2. Add the rinks to the Rinks tab** so the Schedule dropdown offers them.

**3. Add the games to the Schedule tab.** Same columns as always, with three
that matter here:

| Column | What to put |
|---|---|
| **Event** | The tournament's name, spelled identically on every one of its rows. This is what creates the tab. |
| **Pool / division** | `Pool A`, `Pool B`. Splits the standings into a table per pool. Leave blank if it's one group. |
| **Game type** | `Pool` for pool play, `Bracket` for the playoff games. |

**4. Leave bracket rows with blank teams.** Type the date, time and rink for the
semis and the final, and leave Away and Home empty until seeding is known. The
row validates, shows on the schedule as TBD, and you fill the names in on the
Sunday morning.

**5. Set Tiebreak rules on the Settings tab to whatever the tournament
publishes**, see the table below. If it publishes nothing, blank.

That's it. The page grows a third tab, opens on the tournament by itself when a
game is within a day, and goes back to League play when it's over. Nobody has to
be told anything.

### What the page works out on its own

Bracket rows are what tell it this is a tournament rather than a showcase. With
them it says *Pool standings* and keeps every bracket game out of the table,
including a played one, a 5-1 semi-final win doesn't touch your pool record,
because pool play is what seeded the bracket and can't be changed by it. Without
bracket rows it says *Round robin* and stops pretending to seed anything.

Pool membership comes from the games, not the Teams tab, so a club can be in
Pool A at this tournament and Pool B at the next one without you editing
anything.

### Tab labels

Two tabs share the width. By four, league, a showcase and a couple of
tournaments, the bar scrolls sideways instead of squeezing names down to
`PRE-SEAS…` beside `PRESIDEN…`. The tab you're on is always the one in view.
Keep event names distinct in their first two words and the labels stay
readable.

## Games that don't count

**Game type** decides whether a game moves the standings.

| Game type | Counts in standings | Shows on the schedule |
|---|---|---|
| *(blank)*, `Q-Game`, `League`, `Pool` | yes | yes |
| `Scrimmage`, `Exhibition`, `Friendly` | **no** | yes, tagged with your word for it |
| `Bracket` | no, inside an event | yes |

A scrimmage in a qualifying record is a real error, not a cosmetic one, so the
page keeps them out of the table, tags them on the schedule row, and adds a line
under the standings saying how many are sitting outside it. Enter those scores
normally, they just don't move anything.

The page matches on the word, not the exact spelling, so `SCRIMMAGE`,
`Scrimmage` and `Non-league` all work.

Standings also list only the clubs you actually play in that competition. A club
that appears solely in scrimmages, or solely at a showcase, stays out of the
league table instead of sitting at 0-0-0 until March.

## Renaming a team

A team name on the Schedule tab is text, not a link. Change a club's name on the
Teams tab and every game it has ever played still says the old name, the two
tabs quietly disagree, the old name drops out of the standings, and column K
turns red.

There are two fixes and the second one is better.

**Find and replace.** `Edit → Find and replace`, old name to new name, tick
*Also search within formulas* off, Replace all. Fine for a typo you caught
immediately.

**The "Also known as" column.** Column E on the Teams tab. Put the old spelling
there and both names resolve to the current one, permanently. Nothing on the
Schedule tab needs touching, past games keep counting, and the page displays the
new name everywhere.

```
Team name            Pool / division   Notes   Also known as
Southtowns Stars                               Southtown Stars, Southtown Starz
```

Separate several with commas. An alias can't hijack a club that exists in its
own right, so listing a real team's name there does nothing.

This column earns its keep more often than renaming does. The league and a
tournament rarely spell a club the same way, `Jr Terriers` against
`Junior Terriers`, `ROCO` against `Rochester Coalition`, and one line in the
alias column makes both work without editing anyone's schedule.

The sheet's own Check column understands aliases too, so a row using the old
spelling reads OK rather than *not on Teams tab*.

**If you forget**, the page tells you precisely what happened rather than
shrugging. It compares unmatched names against the Teams tab and, when it finds
a near miss, names both: *"Southtown Stars on the Schedule against Southtowns
Stars on the Teams tab. Almost certainly the same club renamed on one tab and
not the other."* A name that resembles nothing still gets the plain
*not on the Teams tab* warning.

## The MyHockey link column

Column F on the Teams tab, header **MyHockey link**. Fill it in and the team's
name on the page becomes a link to its MyHockey Rankings page, in the division
list before opening day and in the standings table after. A small ↗ after the
name says the tap leaves the page; it opens in a new tab so the Rink Report is
still there when a parent comes back. Leave a cell blank and that name stays
plain text. Nothing else changes.

You can paste the whole address or just the team's number:

```
Team name            Pool / division   Notes    Also known as   MyHockey link
Buffalo Bisons                         league                   2631
Cheektowaga Warriors                   league                   https://myhockeyrankings.com/team_info.php?y=2026&t=34146
```

A bare number is turned into this season's address. MHR counts a season by the
year it started, so from September through August the page uses that September's
year. A pasted address is used exactly as pasted, so if you paste last season's
you get last season's page.

**Finding the numbers.** Open MHR's alphabetical listing for the district and
age group (New York 12U is
`https://myhockeyrankings.com/rank.php?d=NY&y=2026&v=124&view=alphabetic`),
click a team, and copy the `t=` number from the address bar. Clubs with two teams
at the same level are listed as (TB) and (NTB), or by coach name, so check which
one is in your league before copying. A team from another state is on that
state's district listing.

Only MHR addresses are accepted. Anything else in the column (another website,
a stray paste) is dropped and noted in the ?check log, and nothing appears on
the page.

## The Rinks tab

Column G on the Schedule tab is a dropdown fed by the **Rinks** tab, so nobody
retypes `Tim Hortons Iceplex - Rink 4` fourteen times, and the same building
doesn't end up spelled three ways by January. Add a rink there first and it
appears in the dropdown. A name typed twice on that tab turns red.

There's an Address column beside it, and the page **does** read it. Fill one in
and every unplayed game at that rink gets a Directions link, on the next-game
card and on the schedule row. On an iPhone it opens Apple Maps, everywhere else
Google Maps. The address also rides along into the calendar entries, so a game
you add to your phone knows where it is. A rink with no address just stays
plain text, and nothing else on the page changes.

A rink name typed a letter or two off on the Schedule still finds its address
(`Wlland JBM` matches `Welland JBM`), so a typo costs you nothing. Run `?check`
to see which rinks still have no address.

## The Sponsors tab

Make a tab called **Sponsors** with three headers in row 1: `Sponsor`, `Tier`,
`Website`. One business per row.

| Sponsor | Tier | Website |
|---|---|---|
| J Battista Construction, Inc. | Gold | |
| Ferrous Manufacturing | Silver | ferrousmfg.com |

Only **Sponsor** is required. **Tier** sorts gold, then silver, then bronze,
however you type the rows; any other word still shows, after those three. A row
with no tier goes last, with no label over it. **Website** is optional and takes
a plain domain, no `https://` needed. A row without one is printed as text.

The block appears at the foot of every view once the tab has one name on it,
and disappears again if you empty it. To print a line under the names ("who to
call about sponsoring"), fill in the **Sponsor contact** row on the Settings
tab. Leave it blank and no line prints.

The block sits just under the next-game card, above the League / Events / Stats
buttons, so it is on screen the moment the page opens. Parents can fold it away
by tapping its heading, and it stays folded on that phone until they tap it open
again. It starts open for everyone, and even folded the heading still says how
many sponsors are in there.

`?check` tells you how many it read and how they split by tier.

## Period length: what GAA is figured against

GAA is goals against per full game. A 60 minute game is the pro number and
using it on a youth game makes every goalie look worse than they are.

Fill in **Period length** on the Settings tab with the periods your league
plays, written the way the league states them: `15, 15, 12`. The page adds
them up. One number works too, so `42` means the same thing. Leave it blank
and the page assumes three 15 minute periods.

Showcases and tournaments often run a shorter clock. Add a **Period length**
column to the Schedule tab, to the right of Event, and fill it in on those
rows only: `12, 12, 12`. Select the cell and drag it down the tournament's
block. Every blank row uses the league's length, so you only ever type the
exceptions. GAA then counts a short game as the part of a full game it was,
rather than pretending every game was the same size.

One thing to keep straight: the minutes you record in the goalie game log
have to be minutes of the same game. If a full game is 45 minutes by the
setting but you log 42 for a goalie who played the whole thing, the page
reads that as a goalie who sat for 3 minutes, and the GAA comes out high.
Pick the number the clock actually runs and use it in both places.

## Tiebreak rules: copy the event's, don't accept a default

Events publish genuinely different tiebreakers and they produce different tables. Set **Tiebreak rules** on the Settings tab to whichever the event actually publishes:

| Setting | What it does |
|---|---|
| *(blank)* or `none` | No tiebreakers. Teams level on points are shown level, sharing a rank number. Correct for a round robin with no bracket and no published rules. |
| `goal percentage` | Head-to-head, then goals for ÷ (goals for + against), then differential, then fewest goals against. Common in Canadian events. |
| `usa hockey` | Most wins, then differential and goal quotient, each capped at eight goals a game. |
| `differential` | Head-to-head, then goal differential, then goals for. |
| `wnyahl` | The WNYAHL rulebook. First the games between the tied teams, if they have all played each other (points, wins, differential, goals for ÷ goals against), then all games (wins, differential with no cap, goals for ÷ goals against). Each group still tied starts over. Periods won and quickest first goal aren't in the sheet, so teams still tied after that are shown level. |

Two-team and three-or-more-team ties follow separate paths, because most rulebooks separate them: head-to-head settles a pair and means nothing across three clubs who didn't all play each other. When a group of three narrows to two, the pair falls back to the two-team sequence, which is what the rulebooks say.

**If the event publishes nothing, leave it blank.** The page will show level teams as level rather than inventing an order. A made-up ranking that looks official is worse than no ranking.

The Settings tab's **Which view opens first** only picks the landing tab when nothing is happening. If a game in an event falls within a day either side of today, the page opens on that event regardless.

---

## The rules the sheet has to follow

You shouldn't need to memorise these, the workbook checks all of them for you and turns red until they pass, but here they are in one place.

1. **Every game needs a date in column A.** No date and the page ignores the row entirely. This is the mistake that happens most.
2. **Team names must match the Teams tab exactly.** The dropdowns in columns C and D exist so they do.

   The dropdowns warn rather than block. Type a name that isn't on the Teams tab and the cell takes it and marks itself, instead of refusing the keystroke. A sheet that won't let you type at 8pm on a Saturday is worse than a sheet that tells you what's wrong.

   **Renaming a club is the exception worth knowing about**: see below.
3. **Both goal columns or neither.** One filled in and the game still counts as not played.
4. **Every game of an event needs that event's name in the Event column.** A blank Event cell on a showcase day drops that one game into League play, splitting the standings in two. Mixing blank and filled Event cells across the whole sheet is fine and expected, that's how a season and a showcase share one Schedule tab. What's not fine is a blank cell on a game of a team that is at the event that day, and the page flags exactly that, by row number. Two other league teams playing a normal game on the same day as a tournament is fine and is left alone.
5. **Never rename the Settings, Teams or Schedule tabs.** The page finds them by name.
6. **Keep the Settings answer column all text.** One number in it and Google decides the whole column is numeric and discards every word.
7. **Column K must say OK** on every row that has a game in it.

### Where the sheet tells you

**Settings tab**: a *Before you send the link to anyone* panel over in columns F and G, one line per rule. Green when it passes, red with the specific fix when it doesn't. It reads across all three tabs, so it catches a team-name typo between Settings and Teams.

**Schedule tab**: a running count in cell A2: "All 15 rows look good" or "4 row(s) need fixing." Green or red at a glance.

**As you type**: a date cell left empty next to a team name turns red. A row the Check column is unhappy with turns red. Only one of the two goal cells filled turns amber. A team name entered twice on the Teams tab turns red.

---

## When something's wrong

The page tells you. Warnings appear at the bottom of the page under **Things to fix on the sheet**, and every one of them names the tab, the row number, and what to type. "Schedule rows 2, 3, 4: the Date cell in column A is empty" is the whole diagnosis.

`?check` has the rest: which route each tab was read through, which spreadsheet column the page decided is which field, and the first few rows exactly as it parsed them.

**If you build a new sheet, the tab IDs change.** The page notices and says so. Click each tab in the new sheet, copy the number after `gid=` in the address bar, and paste it into the `gids` line in `index.html`. Six numbers, two minutes.

**"came back as a web page, not data"**: the sheet isn't shared. Redo Part 1 step 4.

**Teams 0, Games 0**: a tab got renamed, or the header row was deleted. Header names have to survive; extra title rows above them are fine.

**"Our team name does not match any row on the Teams tab"**: a spelling or spacing difference between Settings and Teams. Copy-paste from one to the other.

**Adding a club crest**: drop the logo into the team's folder as `logo.png`, beside its index.html, and it appears in the masthead. The page checks for it once when it loads; if the file isn't there it simply doesn't draw one.

**The page briefly showed "Can't reach the schedule"**: Google hands back the occasional transient error. The page retries three times per tab with a short backoff before it says anything. If the banner is still up after a few minutes, it's real; go to `?check` and read the request log.

**How often it re-checks the sheet.** Not on a fixed clock, on purpose. Two hundred phones on the same rink wifi all refreshing on the same two-minute beat is a small stampede aimed at one Google URL, and Google answers a stampede with exactly the transient errors above. So the page checks about every two minutes while a game is actually being played, slows down when nothing on the sheet has changed, drops to a check every quarter hour or so on a day with no games, and adds a random few seconds to every delay so that no two phones line up. A tab in the background doesn't check at all until you look at it again. Pulling down to refresh always checks immediately.

**"Input must fall within specified range"**: a dropdown cell refusing what you typed. In the sheet: select the cell, **Data → Data validation**, open the rule, set **If the data is invalid** to **Show a warning** instead of **Reject the input**. Four places carry rules: Schedule columns C and D (team names, from the Teams tab), Schedule column I (Pool / Bracket / League / Exhibition), and Settings C6 and C7. Sheets built from the current template already warn instead of blocking; a sheet made from an older copy still refuses.

**Text you typed in the Settings answer column vanished**: Google's tab-name reader decides each column has one type. If that column also holds the points numbers, it calls the column numeric and discards the words. Two fixes, either works: clear the numeric cells so the column is all text, or fill in the `gids` block described below, which switches the page to Google's raw export and sidesteps the whole thing.

## The gids block: already filled in, but here's what it is

In `index.html`:

```js
gids: { settings: "1160090892", teams: "239776309", schedule: "1739208952", stats: "703037060", rinks: "1202177208", sponsors: "95128319" },
```

These are already set for your sheet (`stats`, `rinks` and `sponsors` are the optional Player Stats, Rinks and Sponsors tabs; the page works without them). `sponsors` is blank until you make that tab: click it in the sheet, copy the number after `gid=` in the address bar, and paste it in. Until then the page reads that one tab by name, which is the slower route. They make the page read through Google's **raw export**, which returns cells exactly as typed. The alternative route reads by tab name, and that one re-types each column and throws away anything that doesn't match, which is how your team name disappeared once and your goal columns disappeared a second time.

The page still falls back to reading by tab name if the export route ever fails, so this is a safety net, not a single point of failure. `?check` shows which route each tab actually used.

**If you ever rebuild the sheet from scratch, these numbers change.** Two ways to get the new ones:

Click each tab and read the number after `gid=` in the address bar.

Or open `https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/htmlview`, that page lists every tab and its gid, and it works without being signed in.

---

**Everything's blank and `?check` shows a fetch error mentioning CORS**: Google has changed how it answers anonymous CSV requests. The page falls back to its saved copy (see below) so parents still see standings, but the copy stops updating. Plan B, if it ever comes to that: in the sheet, **File → Share → Publish to web**, publish each tab as CSV, and the export URLs in `js/sheet/routes.js` `routesFor()` get swapped for those published ones. That is a code change; say so and it gets done.

**A team is missing from standings**: its name on the Schedule tab doesn't match the Teams tab. `?check` lists exactly which names it didn't recognize. Case and extra spaces are forgiven; "Jr Terriers" vs "Junior Terriers" is not.

---

## Changing the page later

Go to **github.com/ewm/rink-report/upload/main**. Drag the changed files onto
the page. Dragging the `js` folder from `site` replaces everything under `js/`
and keeps the structure; dragging `index.html` alone replaces just that file.
In the commit box, write a title that names what changed ("Standings: hide rank numbers before the first score") and a line or two underneath saying which files and why, then **Commit changes**. The history is the only record of what changed when. The live site updates in about a
minute, hard-refresh (Cmd-Shift-R) to see it. Do this as often as you like;
nothing is counted.

For a one-line change like the sheet ID, you don't even need Finder: open the
file on GitHub, click the pencil icon, edit, **Commit changes**.

You'll only need this if you want a design change. Schedule and score changes
never require it, those live in the sheet.

### Switching a feature off

The config block at the top of `index.html` ends with a `features` list, one
line per optional piece of the page, each set to `true`. Change one to
`false`, upload `index.html` again, and that piece is gone; nothing else on
the page moves. Set it back to `true` and it returns. Handy when a sponsor
list isn't ready, a team has no Player Stats tab yet, or you want a plain
league-only page for a season with no showcases. Open `?check` afterwards:
the **Features** line names whatever is switched off. Standings and the
schedule have no switch.

### The saved copy of the sheet

Every six hours a small job on GitHub (Actions tab, "Save a copy of the
sheet") reads the six tabs and saves them as CSV files under `data/` in the
repo, committing only when something changed. Two things that buys you:

- If Google Sheets cannot be reached at all (Google down, the sheet deleted
  or unshared, your account locked), the page reads `data/` instead and shows
  a banner saying it is the saved copy and when it was taken. New phones get
  standings instead of an error.
- The files are a backup with history. If the sheet is ever lost, open the
  latest `data/*.csv` on GitHub and paste each one into a fresh sheet.

The job needs nothing from you. If Actions ever shows it red, the usual cause
is the sheet no longer being shared as "Anyone with the link". Run it by hand
from the Actions tab after a big edit if you want the copy fresh right away.

---

## What runs where

```
Google Sheet          the data. you and your co-manager edit it.
      |
      |  read anonymously over https, every 2 minutes
      v
index.html + js/     on GitHub Pages. never changes.
      |
      v
parent's phone        no login, no app, works on anything.
```

Three things worth knowing about how it behaves:

The page caches the last good copy in the browser. A parent opening it in a dead-zone parking lot sees last night's standings instead of a spinner, with an "updated 3 hours ago" line so they know it's not live.

If the sheet is temporarily unreachable, the page keeps showing what it had rather than going blank.

If the Schedule tab comes back empty (someone selected all and deleted, mid-season), the page keeps the previous copy and flags it instead of showing an empty league.
