# 🏀 NBA TONIGHT

A retro, synthwave-arcade web app that shows tonight's NBA games and the TV channels carrying them (national, home and away).

- Live data from ESPN's public scoreboard feed, so there's no API key or backend
- Tip-off times in your local time zone
- Live scores while games are on, refreshed every 60 seconds
- Filters: All games / National TV / Live now
- ◀ ▶ buttons (or arrow keys) to browse other days
- 12 skins with a picker in the top-right (your choice is remembered; share one with `?skin=cable`): Arcade, Modern, Simple, Minimalist, Maximalist, Y2K, Saturday Morning, Trading Card, Cable Guide, Scoreboard, Toy Box 3D, Zero-G 3D

## Deploy to GitHub Pages

1. Create a new public repo (for example, `nba-tonight`) and push these files to the `main` branch.
2. In the repo, go to **Settings → Pages**, set **Source** to *Deploy from a branch*, pick `main` and `/ (root)`, then save.
3. After a minute or so, the site is live at `https://<your-username>.github.io/nba-tonight/`.

It's a static site (`index.html`, `style.css`, `app.js`) with no build step.
