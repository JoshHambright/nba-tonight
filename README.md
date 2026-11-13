# 🏀 TONIGHT

A retro, synthwave-arcade web app that shows tonight's NBA, WNBA, NHL, MLB, NFL and MLS games and the TV channels carrying them (national, home and away).

- League dropdown (top-right): NBA, WNBA, NHL, MLB, NFL, MLS, College Football, Men's and Women's College Basketball (full FBS / Division I slates, with AP rankings; for college, "Can Watch" means national TV, so streaming-only games are under All Games). Remembered between visits; link one directly with `?league=nhl`. On days with no games, a button jumps to the league's next game day
- Live data from ESPN's public scoreboard feed, so there's no API key or backend
- Tip-off times in your local time zone
- Live scores while games are on, refreshed every 60 seconds
- **Can Watch** (default): only games on national TV, plus every game for your home team (Pacers, with a DAZN badge). Local-TV-only games are hidden, with a one-tap "show all"
- Live games sort to the top, then upcoming games by tip-off, then finals
- Filters: Can Watch / Live now / All games
- Different home team? Add `?team=BOS` (any ESPN abbreviation) to the URL, or set `team` / `feed` per league in the `LEAGUES` table at the top of `app.js`
- Mobile-friendly: single-column cards, thumb-sized buttons and no sideways scrolling on phones
- ◀ ▶ buttons (or arrow keys) to browse other days
- 12 skins with a picker in the top-right (your choice is remembered; share one with `?skin=cable`): Arcade, Modern, Simple, Minimalist, Maximalist, Y2K, Saturday Morning, Trading Card, Cable Guide, Scoreboard, Toy Box 3D, Zero-G 3D

## Deploy to GitHub Pages

1. Create a new public repo (for example, `nba-tonight`) and push these files to the `main` branch.
2. In the repo, go to **Settings → Pages**, set **Source** to *Deploy from a branch*, pick `main` and `/ (root)`, then save.
3. After a minute or so, the site is live at `https://<your-username>.github.io/nba-tonight/`.

It's a static site (`index.html`, `style.css`, `app.js`) with no build step.
