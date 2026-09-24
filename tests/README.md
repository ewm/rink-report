# Rink Report — tests

End-to-end checks for the page in `../docs`. Nothing here touches Google:
every sheet request is answered from `fixtures/`, so the suite runs offline
and gives the same answer every time.

## Run it

    cd tests
    npm install        # once — pulls Playwright and a headless Chromium
    npm test           # 415 checks, about two minutes

Screenshots of the views land in `out/` after a run (light and dark, phone
width) — worth a glance when a change is visual.

## What it covers

- The Stats tab over the raw-export route, over the tab-name fallback with
  Google's header-blanking simulated two ways, with the tab missing, with the
  tab present but empty, and with a refresh that fails after a good load.
- The Events tab with one past showcase, with two tournaments on the
  calendar (nearer one gets the bar button), and with an event being played
  today (it wins the button and the landing view).
- Opening a past event from the list and getting back; the setup-check page.
- That a broken or missing stats tab never changes the standings page.
- The pre-season League view (no table of zeros; start date, showcase record,
  division list) and that an event with scores still gets its table.
- Directions links only where the Rinks tab has an address, the `.ics` and
  Google Calendar links on the next-game card (dates, title, escaped location,
  link back), the whole-season `.ics`, and the crest. Rinks over both routes,
  and the Rinks tab missing entirely.
- The gameday post panel on `?admin`: each template and size draws at the
  right dimensions in the club colors, the hype line box and switch redraw
  it, a photo from the picker lands in the photo area and still exports,
  and the last template and size are remembered.

## Fixtures

`settings.csv`, `teams.csv`, `schedule.csv` are the season workbook's tabs
with the five showcase scores filled in. `schedule_future.csv` adds two
tournaments dated relative to today; `schedule_live.csv` adds one being
played today (its Labor Day rows are re-dated to today and tomorrow when the
suite loads, so it stays live). `rinks.csv` is the Rinks tab with the three
real Ontario addresses plus a made-up one on Leisure-1 and Leisure-2 so the
Directions checks have something to find. `stats.csv` is the Player Stats tab in the shape Google's
export actually produces (`0.` for a zero PIM, `1.000` for a save
percentage, dates as `8/28/2026`).

The request stub keys on both `gid=` and `sheet=`. A stub that matched only
tab names once misrouted every tab after gids were added and reported a
regression that didn't exist — don't simplify it.

## Adding a check

Each numbered block in `qa.js` opens the page with a scenario
(`openPage(browser, url, {export:{stats:'404'}, schedule:'future', scheme:'dark'})`),
clicks around, and asserts with `ok(condition, 'what it proves')`. Put a
new scenario in its own block and give the message enough detail that a
failure reads like a bug report.
