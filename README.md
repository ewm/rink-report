# The Rink Report

West Seneca Wings 12U — league standings, scores, next game and player stats
for parents. Live at https://ewm.github.io/rink-report/

No build step, no server. The page reads a shared Google Sheet directly; scores
are entered in the sheet and the page recomputes everything on the parent's
phone. Diagnostics at `?check`.

This repo is the deployable `site/` folder of the Rink Report project. To
update the page, drag the changed files onto
https://github.com/ewm/rink-report/upload/main and commit. GitHub Pages
rebuilds in about a minute. Score and schedule changes never need a deploy.

`.nojekyll` keeps GitHub from running the folder through Jekyll. `_headers` is
a Netlify artifact and is ignored here.
