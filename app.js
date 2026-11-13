// TONIGHT — what's on and where to watch, for the major US leagues.
// Data: ESPN public scoreboard feed (CORS-enabled, no key needed).
const API_BASE = "https://site.api.espn.com/apis/site/v2/sports";
const REFRESH_MS = 60_000;

// team/feed = your home-market team for that league: its games are always shown,
// with your local feed added. Override for the current league with ?team=XXX.
const LEAGUES = {
  nba:  { name: "NBA",  path: "basketball/nba",  emoji: "🏀", pass: "NBA League Pass", team: "IND", feed: "DAZN" },
  wnba: { name: "WNBA", path: "basketball/wnba", emoji: "🏀", pass: "WNBA League Pass" },
  nhl:  { name: "NHL",  path: "hockey/nhl",      emoji: "🏒", pass: "ESPN+" },
  mlb:  { name: "MLB",  path: "baseball/mlb",    emoji: "⚾", pass: "MLB.TV" },
  nfl:  { name: "NFL",  path: "football/nfl",    emoji: "🏈", pass: "NFL Sunday Ticket" },
  mls:  { name: "MLS",  path: "soccer/usa.1",    emoji: "⚽", pass: "Apple TV" },
  // College: ask for the full FBS / Division I slate (the default feed is featured games only).
  // "Can Watch" for college means real national TV — streaming-only games (ESPN+, B1G+…) need All Games.
  ncaaf: { name: "NCAAF", path: "football/college-football", query: "groups=80&limit=300", emoji: "🏈", pass: "ESPN+", college: true },
  ncaam: { name: "NCAAM", path: "basketball/mens-college-basketball", query: "groups=50&limit=300", emoji: "🏀", pass: "ESPN+", college: true },
  ncaaw: { name: "NCAAW", path: "basketball/womens-college-basketball", query: "groups=50&limit=300", emoji: "🏀", pass: "ESPN+", college: true },
};
const feedURL = (dates) =>
  `${API_BASE}/${L().path}/scoreboard?${[dates && `dates=${dates}`, L().query].filter(Boolean).join("&")}`;
const params = new URLSearchParams(location.search);
const TEAM_PARAM = (params.get("team") || "").toUpperCase();
let league = document.documentElement.dataset.league;
if (!LEAGUES[league]) league = "nba";
const L = () => LEAGUES[league];
const myTeam = () => TEAM_PARAM || L().team || "";
const myFeed = () => L().feed || "Your local feed";

const $ = (s) => document.querySelector(s);
const gamesEl = $("#games");
const state = { day: startOfDay(new Date()), filter: "watch", events: [], timer: null, nextDay: null };

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function ymd(d) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function isToday(d) { return startOfDay(new Date()).getTime() === d.getTime(); }

// ---------- broadcasts ----------
function netClass(name) {
  const n = name.toLowerCase();
  if (n.includes("peacock")) return "peacock";
  if (n.includes("espn")) return "espn";
  if (n === "abc" || n.startsWith("abc")) return "abc";
  if (n.includes("nbc")) return "nbc";
  if (n.includes("prime") || n.includes("amazon")) return "prime";
  if (n.includes("nba tv")) return "nbatv";
  if (n.includes("league pass") || n.includes("mlb.tv")) return "lp";
  if (n.includes("apple")) return "apple";
  if (n.includes("fox") || n.includes("fs1")) return "fox";
  if (n.includes("cbs") || n.includes("paramount")) return "cbs";
  if (/\b(tnt|tbs|trutv|max|hbo)\b/.test(n)) return "tnt";
  if (n.includes("netflix")) return "netflix";
  if (n.includes("ion")) return "ion";
  if (/(nhl|mlb|nfl) network/.test(n)) return "nbatv";
  return "";
}

function getChannels(comp) {
  const map = new Map(); // key -> {name, market, stream}
  const add = (name, market, stream = false) => {
    if (!name) return;
    market = (market || "national").toLowerCase();
    const key = `${market}|${name}`;
    if (!map.has(key)) map.set(key, { name, market, stream });
  };
  const radio = new Set();
  for (const g of comp.geoBroadcasts || []) {
    const type = (g.type?.shortName || "").toLowerCase();
    if (type === "radio") { radio.add(g.media?.shortName); continue; } // can't watch the radio
    add(g.media?.shortName, g.market?.type, type === "streaming");
  }
  for (const b of comp.broadcasts || []) for (const n of b.names || []) if (!radio.has(n)) add(n, b.market);
  const order = { national: 0, home: 1, away: 2 };
  return [...map.values()].sort((a, b) => (order[a.market] ?? 3) - (order[b.market] ?? 3));
}

// ---------- parsing ----------
function parse(ev) {
  const comp = ev.competitions?.[0] || {};
  const teams = comp.competitors || [];
  const pick = (side) => {
    const c = teams.find((t) => t.homeAway === side) || {};
    const t = c.team || {};
    return {
      abbr: t.abbreviation, name: t.shortDisplayName || t.name, full: t.displayName,
      logo: t.logo || t.logoDark, logoDark: t.logoDark || t.logo, color: `#${t.color || "888888"}`, alt: `#${t.alternateColor || "444444"}`,
      record: c.records?.find((r) => r.type === "total")?.summary || c.records?.[0]?.summary || "",
      score: c.score, winner: c.winner,
      rank: c.curatedRank?.current && c.curatedRank.current <= 25 ? c.curatedRank.current : null,
    };
  };
  const st = ev.status?.type || comp.status?.type || {};
  const channels = getChannels(comp);
  const away = pick("away"), home = pick("home");
  const mine = !!myTeam() && (away.abbr === myTeam() || home.abbr === myTeam());
  const national = channels.some((c) => c.market === "national" && !(L().college && c.stream));
  return {
    mine, watchable: national || mine,
    id: ev.id, date: new Date(ev.date), away, home,
    state: st.state || "pre", detail: st.shortDetail || st.detail || "", tbd: comp.timeValid === false,
    channels, national,
    venue: comp.venue ? [comp.venue.fullName, comp.venue.address?.city, comp.venue.address?.state].filter(Boolean).join(" · ") : "",
  };
}

// ---------- rendering ----------
function timeStr(d) { return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }

function statusText(g) {
  if (g.state === "in") return `● LIVE ${g.detail.toUpperCase()}`;
  if (g.state === "post") return g.detail.toUpperCase() || "FINAL";
  if (/postponed|canceled|cancelled/i.test(g.detail)) return g.detail.toUpperCase();
  if (g.mine) return "★ YOUR TEAM";
  return g.national ? "NATIONAL TV" : "LOCAL TV ONLY";
}

function teamHTML(t, g) {
  const showScore = g.state !== "pre";
  return `<div class="team">
    <img class="lg-dark" src="${esc(t.logoDark)}" alt="${esc(t.full)} logo" loading="lazy" onerror="this.style.visibility='hidden'">
    <img class="lg-light" src="${esc(t.logo)}" alt="${esc(t.full)} logo" loading="lazy" onerror="this.style.visibility='hidden'">
    <div class="abbr">${t.rank ? `<small class="rank">#${t.rank}</small>` : ""}${esc(t.abbr)}</div>
    <div class="tname">${esc(t.name)}</div>
    ${t.record ? `<div class="rec">${esc(t.record)}</div>` : ""}
    ${showScore ? `<div class="score ${g.state === "post" && t.winner ? "win" : ""}">${esc(t.score ?? "0")}</div>` : ""}
  </div>`;
}

function channelsHTML(g) {
  const yours = g.mine
    ? `<div class="chan-row"><span class="mkt">You</span><span class="badge yours national">${esc(myFeed())}</span></div>`
    : "";
  if (!g.channels.length) {
    return yours || `<div class="none">No TV listed yet · try ${esc(L().pass)}</div>`;
  }
  const groups = {};
  for (const c of g.channels) (groups[c.market] ||= []).push(c);
  const label = { national: "National", home: g.home.abbr, away: g.away.abbr };
  return yours + Object.entries(groups).map(([mkt, list]) => `
    <div class="chan-row">
      <span class="mkt">${esc(label[mkt] || mkt)}</span>
      ${list.map((c) => `<span class="badge ${netClass(c.name)} ${mkt === "national" ? "national" : ""} ${c.stream ? "stream" : ""}">${esc(c.name)}</span>`).join("")}
    </div>`).join("");
}

function gameHTML(g, i) {
  const vars = `--i:${i};--away:${g.away.color};--away2:${g.away.alt};--home:${g.home.color};--home2:${g.home.alt}`;
  return `<article class="game state-${g.state}" style="${vars}">
    <div class="stripes" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
    <div class="game-top">
      <span class="tip">${g.tbd ? "TBD" : timeStr(g.date)}</span>
      <span class="status-pill">${esc(statusText(g))}</span>
    </div>
    <div class="matchup">
      ${teamHTML(g.away, g)}
      <div class="vs">@</div>
      ${teamHTML(g.home, g)}
    </div>
    <div class="watch">
      <div class="watch-label">WATCH ON</div>
      ${channelsHTML(g)}
    </div>
    ${g.venue ? `<div class="venue">${esc(g.venue)}</div>` : ""}
  </article>`;
}

function message(title, sub, loading = false) {
  gamesEl.innerHTML = `<div class="message">
    ${loading ? `<div class="loader"><i></i><i></i><i></i></div>` : ""}
    <h2>${title}</h2>${sub ? `<p>${sub}</p>` : ""}</div>`;
}

function render() {
  if (!state.loaded) return;
  let list = state.events;
  if (state.filter === "watch") list = list.filter((g) => g.watchable);
  if (state.filter === "live") list = list.filter((g) => g.state === "in" && g.watchable);

  $("#count").textContent = String(list.length).padStart(3, "0");
  renderTicker(list);

  if (!state.events.length) {
    const next = state.nextDay
      ? `<br><br><button class="chip" data-goto="${ymd(state.nextDay)}">NEXT ${esc(L().name)} GAMES: ${esc(state.nextDay.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }).toUpperCase())} ▶</button>`
      : "";
    if (state.offSeason) return message(`IT'S THE ${esc(L().name)} OFF-SEASON`, `No games scheduled yet · <span class="blink">INSERT COIN</span> and check back next season`);
    return message(`NO ${esc(L().name)} GAMES ON THE SLATE`, `<span class="blink">INSERT COIN</span> · press ▶ to check another day${next}`);
  }
  const hidden = state.events.length - state.events.filter((g) => g.watchable).length;
  const showAll = `<button class="chip" data-jump="all">SHOW ALL ${state.events.length} GAMES</button>`;
  if (!list.length) {
    const why = state.filter === "live" ? "NOTHING YOU CAN WATCH IS LIVE RIGHT NOW" : (myTeam() ? `NO NATIONAL TV OR ${esc(myTeam())} GAMES` : "NO NATIONAL TV GAMES");
    return message(why, `${hidden} game${hidden === 1 ? "" : "s"} not on national TV<br><br>${showAll}`);
  }
  const note = state.filter !== "all" && hidden
    ? `<div class="hidden-note">${hidden} game${hidden === 1 ? "" : "s"} not on national TV hidden · ${showAll}</div>`
    : "";
  gamesEl.innerHTML = list.map(gameHTML).join("") + note;
}

// Live games first, then upcoming by tip-off, then finished games.
function sortGames(a, b) {
  const rank = { in: 0, pre: 1, post: 2 };
  return (rank[a.state] ?? 1) - (rank[b.state] ?? 1) || a.date - b.date;
}

function renderTicker(list) {
  const items = list.map((g) => {
    const tv = g.channels.filter((c) => c.market === "national").map((c) => c.name).join("/") ||
               g.channels.map((c) => c.name).slice(0, 2).join("/") || "TV TBA";
    const when = g.state === "pre" ? timeStr(g.date) : g.state === "in" ? `LIVE ${g.away.score}-${g.home.score}` : `FINAL ${g.away.score}-${g.home.score}`;
    const nm = (t) => (t.rank ? `#${t.rank} ` : "") + t.abbr;
    return `<span>${L().emoji} ${esc(nm(g.away))} @ ${esc(nm(g.home))} · ${esc(when)} · <b>${esc(tv)}</b></span>`;
  });
  $("#ticker").style.animationDuration = `${Math.max(40, items.length * 7)}s`;
  $("#ticker").innerHTML = items.length ? items.join("") + items.join("") : `<span>NO GAMES TODAY · GO OUTSIDE · TOUCH GRASS</span>`;
}

function renderDate() {
  const d = state.day;
  const today = isToday(d);
  const diff = Math.round((d - startOfDay(new Date())) / 86_400_000);
  $("#dateLabel").textContent = today ? "TONIGHT" : diff === 1 ? "TOMORROW" : diff === -1 ? "LAST NIGHT" : d.toLocaleDateString([], { weekday: "long" }).toUpperCase();
  $("#dateSub").textContent = d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  $("#today").hidden = today;
}

// ---------- data ----------
async function load({ quiet = false } = {}) {
  renderDate();
  if (!quiet) { state.loaded = false; message("LOADING...", "Tuning the rabbit ears", true); }
  const key = ymd(state.day);
  try {
    const want = league;
    const res = await fetch(feedURL(key), { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (key !== ymd(state.day) || want !== league) return; // user moved on
    state.nextDay = nextGameDay(data);
    state.offSeason = false;
    if (!(data.events || []).length && !state.nextDay) await findNextFromCurrent(want, key);
    state.events = (data.events || []).map(parse).sort(sortGames);
    state.loaded = true;
    render();
  } catch (err) {
    console.error(err);
    if (!quiet) message("SIGNAL LOST", `Couldn't reach the scoreboard (${esc(err.message)}). <span class="blink">PRESS ▶ OR ◀ TO RETRY</span>`);
  }
  schedule();
}

// ESPN lists the league's game days in its calendar; find the next one after the shown day.
function nextGameDay(data) {
  const cal = data.leagues?.[0]?.calendar || [];
  const days = cal.filter((c) => typeof c === "string").map((c) => {
    const [y, m, d] = c.slice(0, 10).split("-").map(Number);
    return new Date(y, m - 1, d);
  });
  return days.find((d) => d > state.day) || null;
}

// Leagues without a day-by-day calendar (NFL) or between seasons: ESPN's date-less
// scoreboard holds the current week's slate, or the last games played.
async function findNextFromCurrent(want, key) {
  try {
    const d = await fetch(feedURL(), { cache: "no-store" }).then((r) => r.json());
    if (key !== ymd(state.day) || want !== league) return;
    const end = new Date(state.day); end.setDate(end.getDate() + 1);
    const upcoming = (d.events || []).map((e) => new Date(e.date)).filter((t) => t >= end).sort((a, b) => a - b)[0];
    if (upcoming) state.nextDay = startOfDay(upcoming);
    else if ((d.events || []).every((e) => new Date(e.date) < startOfDay(new Date()))) state.offSeason = true;
  } catch (e) { /* the plain "no games" message is fine */ }
}

function schedule() {
  clearTimeout(state.timer);
  const active = state.events.some((g) => g.state === "in") || (isToday(state.day) && state.events.some((g) => g.state === "pre"));
  if (active) state.timer = setTimeout(() => load({ quiet: true }), REFRESH_MS);
}

function shift(days) {
  const d = new Date(state.day); d.setDate(d.getDate() + days);
  state.day = startOfDay(d);
  load();
}

// ---------- events ----------
$("#prev").addEventListener("click", () => shift(-1));
$("#next").addEventListener("click", () => shift(1));
$("#today").addEventListener("click", () => { state.day = startOfDay(new Date()); load(); });
function setFilter(f) {
  state.filter = f;
  document.querySelectorAll(".chip[data-filter]").forEach((b) => b.classList.toggle("active", b.dataset.filter === f));
  render();
}
document.querySelectorAll(".chip[data-filter]").forEach((btn) =>
  btn.addEventListener("click", () => setFilter(btn.dataset.filter))
);
gamesEl.addEventListener("click", (e) => {
  const j = e.target.closest("[data-jump]");
  if (j) setFilter(j.dataset.jump);
  const go = e.target.closest("[data-goto]");
  if (go) {
    const v = go.dataset.goto;
    state.day = new Date(+v.slice(0, 4), +v.slice(4, 6) - 1, +v.slice(6, 8));
    load();
  }
});
document.addEventListener("keydown", (e) => {
  if (e.target.closest("input,textarea")) return;
  if (e.key === "ArrowLeft") shift(-1);
  if (e.key === "ArrowRight") shift(1);
});
// ---------- leagues ----------
function applyLeague() {
  document.documentElement.dataset.league = league;
  $("#league").value = league;
  $(".logo").innerHTML = `${esc(L().name)}<span>TONIGHT</span>`;
  document.title = `${L().name} TONIGHT · What's On & Where to Watch`;
}
$("#league").addEventListener("change", (e) => {
  league = e.target.value;
  try { localStorage.setItem("nba-league", league); } catch (err) {}
  const url = new URL(location.href);
  url.searchParams.set("league", league);
  history.replaceState(null, "", url);
  applyLeague();
  load();
});
applyLeague();

// ---------- skins ----------
const skinSel = $("#skin");
skinSel.value = document.documentElement.dataset.skin;
if (!skinSel.value) { skinSel.value = "retro"; document.documentElement.dataset.skin = "retro"; }
skinSel.addEventListener("change", () => {
  document.documentElement.dataset.skin = skinSel.value;
  try { localStorage.setItem("nba-skin", skinSel.value); } catch (e) {}
  const url = new URL(location.href);
  url.searchParams.set("skin", skinSel.value);
  history.replaceState(null, "", url);
  render(); // replay entrance animations
});

// pointer tilt for the 3D skins
gamesEl.addEventListener("pointermove", (e) => {
  const card = e.target.closest(".game");
  if (!card || !/toy3d|zerog/.test(document.documentElement.dataset.skin)) return;
  const r = card.getBoundingClientRect();
  card.style.setProperty("--ry", `${((e.clientX - r.left) / r.width - 0.5) * 24}deg`);
  card.style.setProperty("--rx", `${-((e.clientY - r.top) / r.height - 0.5) * 24}deg`);
});
gamesEl.addEventListener("pointerout", (e) => {
  const card = e.target.closest(".game");
  if (card && !card.contains(e.relatedTarget)) { card.style.removeProperty("--rx"); card.style.removeProperty("--ry"); }
});

// clock for the cable-guide skin
const tick = () => { $("#clock").textContent = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }); };
tick(); setInterval(tick, 1000);

document.addEventListener("visibilitychange", () => { if (!document.hidden) load({ quiet: true }); });

load();
