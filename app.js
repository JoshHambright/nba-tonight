// NBA TONIGHT — what's on and where to watch.
// Data: ESPN public scoreboard feed (CORS-enabled, no key needed).
const API = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";
const REFRESH_MS = 60_000;

// Your home-market team: its games are always shown, with your local feed added.
// Override with ?team=XXX (ESPN abbreviation, e.g. IND, BOS, GS).
const MY_TEAM = (new URLSearchParams(location.search).get("team") || "IND").toUpperCase();
const MY_FEED = "DAZN"; // how you watch your home team

const $ = (s) => document.querySelector(s);
const gamesEl = $("#games");
const state = { day: startOfDay(new Date()), filter: "watch", events: [], timer: null };

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
  if (n.includes("league pass")) return "lp";
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
  for (const g of comp.geoBroadcasts || []) {
    add(g.media?.shortName, g.market?.type, (g.type?.shortName || "").toLowerCase() === "streaming");
  }
  for (const b of comp.broadcasts || []) for (const n of b.names || []) add(n, b.market);
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
    };
  };
  const st = ev.status?.type || comp.status?.type || {};
  const channels = getChannels(comp);
  const away = pick("away"), home = pick("home");
  const mine = away.abbr === MY_TEAM || home.abbr === MY_TEAM;
  const national = channels.some((c) => c.market === "national");
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
    <div class="abbr">${esc(t.abbr)}</div>
    <div class="tname">${esc(t.name)}</div>
    ${t.record ? `<div class="rec">${esc(t.record)}</div>` : ""}
    ${showScore ? `<div class="score ${g.state === "post" && t.winner ? "win" : ""}">${esc(t.score ?? "0")}</div>` : ""}
  </div>`;
}

function channelsHTML(g) {
  const yours = g.mine
    ? `<div class="chan-row"><span class="mkt">You</span><span class="badge yours national">${esc(MY_FEED)}</span></div>`
    : "";
  if (!g.channels.length) {
    return yours || `<div class="none">No TV listed yet · try NBA League Pass</div>`;
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
    return message("NO GAMES ON THE SLATE", `<span class="blink">INSERT COIN</span> · press ▶ to check another day`);
  }
  const hidden = state.events.length - state.events.filter((g) => g.watchable).length;
  const showAll = `<button class="chip" data-jump="all">SHOW ALL ${state.events.length} GAMES</button>`;
  if (!list.length) {
    const why = state.filter === "live" ? "NOTHING YOU CAN WATCH IS LIVE RIGHT NOW" : "NO NATIONAL TV OR " + MY_TEAM + " GAMES";
    return message(why, `${hidden} game${hidden === 1 ? "" : "s"} on local TV only<br><br>${showAll}`);
  }
  const note = state.filter !== "all" && hidden
    ? `<div class="hidden-note">${hidden} game${hidden === 1 ? "" : "s"} on local TV only hidden · ${showAll}</div>`
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
    return `<span>🏀 ${esc(g.away.abbr)} @ ${esc(g.home.abbr)} · ${esc(when)} · <b>${esc(tv)}</b></span>`;
  });
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
    const res = await fetch(`${API}?dates=${key}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (key !== ymd(state.day)) return; // user moved on
    state.events = (data.events || []).map(parse).sort(sortGames);
    state.loaded = true;
    render();
  } catch (err) {
    console.error(err);
    if (!quiet) message("SIGNAL LOST", `Couldn't reach the scoreboard (${esc(err.message)}). <span class="blink">PRESS ▶ OR ◀ TO RETRY</span>`);
  }
  schedule();
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
});
document.addEventListener("keydown", (e) => {
  if (e.target.closest("input,textarea")) return;
  if (e.key === "ArrowLeft") shift(-1);
  if (e.key === "ArrowRight") shift(1);
});
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
