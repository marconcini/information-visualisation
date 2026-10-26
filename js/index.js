/* ============================================================
   Index — rassemble les visualisations de l'équipe
   ------------------------------------------------------------
   Chaque visualisation reste une page autonome (treemap.html, …),
   affichée ici dans un cadre : pas de conflit de CSS ni de JS.

   Ajouter ou modifier une visualisation = modifier VISUS uniquement.
   Une page absente de la branche est signalée « à venir » ; elle
   apparaît automatiquement dès qu'elle est fusionnée dans main.
   ============================================================ */

const VISUS = [
  {
    id: "coordonnees",
    file: "coord-para.html",
    title: "Coordonnées parallèles",
    member: "Adrien",
    data: "Multivarié",
    question: "Quel est le profil audio d'un genre, et quels titres se ressemblent ?",
    tasks: ["Comparer", "Distribution", "Corréler", "Anomalies"],
  },
  {
    id: "treemap",
    file: "treemap.html",
    title: "Treemap",
    member: "Arij",
    data: "Hiérarchie",
    question: "Comment le catalogue se répartit-il entre genres, sous-genres et artistes ?",
    tasks: ["Vue d'ensemble", "Partie / tout", "Exploration", "Localiser"],
  },
  {
    id: "courbes",
    file: "courbes.html",
    title: "Courbes multiples",
    member: "Amir",
    data: "Temporel",
    question: "Comment les caractéristiques des genres évoluent-elles dans le temps ?",
    tasks: ["Tendance", "Comparer dans le temps", "Extrêmes"],
  },
  {
    id: "heatmap",
    file: "heatmap.html",
    title: "Heatmap de corrélation",
    member: "Maud",
    data: "Matrice",
    question: "Quelles caractéristiques audio vont ensemble ?",
    tasks: ["Corréler", "Relations"],
  },
  {
    id: "carte",
    file: "carte.html",
    title: "Carte des pays d'origine",
    member: "Équipe · bonus",
    data: "Spatial",
    question: "D'où viennent les artistes du catalogue ?",
    tasks: ["Localiser", "Comparer"],
  },
];

// profils d'utilisateurs du descriptif, et les vues qui répondent à leurs tâches
const PROFILES = [
  {
    title: "Mélomane",
    goal: "Explorer et comparer la musique par plaisir.",
    visus: ["treemap", "coordonnees"],
  },
  {
    title: "Journaliste",
    goal: "Trouver une tendance à raconter et à illustrer.",
    visus: ["courbes", "heatmap"],
  },
  {
    title: "Analyste label · A&R",
    goal: "Tirer des décisions exploitables des données.",
    visus: ["heatmap", "coordonnees", "treemap", "carte"],
  },
];

// pipeline : une ligne par transformation du notebook (scripts/pipeline.ipynb)
// extra = dataset lu en complément par la vue (détail des titres, nuage de points)
const PIPELINE = {
  raw: { label: "Kaggle", title: "spotify_songs.csv", sub: "32 833 lignes × 23 variables" },
  clean: { label: "00 · Nettoyage", title: "tracks_clean.csv", sub: "28 356 titres uniques" },
  rows: [
    { step: "01 · Normalisation min-max", file: "tracks_features.csv", sub: "9 features dans [0, 1]", visu: "coordonnees" },
    { step: "02 · Hiérarchie", file: "hierarchy.json", sub: "genre → sous-genre → artiste", visu: "treemap", extra: "tracks_clean" },
    { step: "03 · Agrégation", file: "trends.json", sub: "moyennes décennie × genre", visu: "courbes" },
    { step: "04 · Corrélation de Pearson", file: "correlation.json", sub: "matrice 10 × 10", visu: "heatmap", extra: "tracks_features" },
    { step: "05 · Enrichissement", file: "countries.json", sub: "artiste → pays (MusicBrainz)", visu: "carte", label: "Carte (bonus)", extra: "tracks_clean" },
  ],
};

// mêmes couleurs que DataLoader.GENRE_COLORS
const GENRES = [
  ["Pop", "#2a78d6"], ["Rap", "#eb6834"], ["Rock", "#1baf7a"],
  ["Latin", "#eda100"], ["R&B", "#e87ba4"], ["EDM", "#008300"],
];
const [POP, RAP, ROCK, LATIN, RNB, EDM] = GENRES.map(([, c]) => c);

// mini-illustration de chaque technique (viewBox 200 × 110)
const THUMBS = {
  coordonnees: () => {
    const axes = [20, 60, 100, 140, 180];
    const lines = [
      [POP, [30, 70, 40, 80, 35]], [RAP, [80, 30, 60, 25, 70]], [ROCK, [55, 85, 75, 50, 90]],
      [EDM, [20, 40, 30, 65, 20]], [RNB, [90, 60, 85, 40, 60]], [LATIN, [45, 20, 50, 90, 45]],
    ];
    return axes.map((x) => `<line x1="${x}" y1="12" x2="${x}" y2="98" class="t-axis"/>`).join("") +
      lines.map(([c, ys]) => `<polyline fill="none" stroke="${c}" stroke-width="2.2" stroke-linejoin="round" stroke-opacity=".85" points="${ys.map((y, i) => `${axes[i]},${y + 4}`).join(" ")}"/>`).join("");
  },
  treemap: () => [
    [6, 6, 86, 58, RAP], [6, 68, 86, 36, RAP], [96, 6, 56, 40, POP], [156, 6, 38, 40, POP],
    [96, 50, 40, 54, EDM], [140, 50, 54, 26, RNB], [140, 80, 26, 24, ROCK], [170, 80, 24, 24, LATIN],
  ].map(([x, y, w, h, c]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${c}" fill-opacity=".8"/>`).join(""),
  courbes: () => {
    const curve = (c, pts) => `<path fill="none" stroke="${c}" stroke-width="2.5" stroke-linecap="round" d="M${pts.map(([x, y]) => `${x},${y}`).join(" L")}"/>`;
    return `<line x1="16" y1="98" x2="192" y2="98" class="t-axis"/><line x1="16" y1="10" x2="16" y2="98" class="t-axis"/>` +
      curve(POP, [[16, 80], [50, 72], [85, 60], [120, 50], [155, 34], [190, 22]]) +
      curve(ROCK, [[16, 40], [50, 34], [85, 42], [120, 58], [155, 66], [190, 74]]) +
      curve(RAP, [[16, 90], [50, 86], [85, 70], [120, 40], [155, 46], [190, 30]]);
  },
  heatmap: () => {
    const n = 6, s = 15, ox = 55, oy = 8;
    const ramp = ["#2a78d6", "#7fb0ea", "#d7e3f2", "#f3d0cf", "#ec8f8d", "#e34848"];
    let out = "";
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        // matrice symétrique, diagonale à 1 comme une vraie matrice de corrélation
        const a = Math.min(i, j), b = Math.max(i, j);
        const v = i === j ? 5 : (a * 7 + b * 3 + a * b) % 5;
        out += `<rect x="${ox + j * s}" y="${oy + i * s}" width="${s - 2}" height="${s - 2}" rx="2" fill="${ramp[v]}"/>`;
      }
    }
    return out;
  },
  carte: () => {
    let dots = "";
    for (let y = 14; y <= 96; y += 8) {
      for (let x = 12; x <= 190; x += 8) {
        const land = Math.sin(x / 23) + Math.cos(y / 14) + Math.sin((x + y) / 31) > 0.4;
        if (land) dots += `<circle cx="${x}" cy="${y}" r="1.6" class="t-dot"/>`;
      }
    }
    const bubbles = [[52, 40, 16, RAP], [102, 34, 9, POP], [112, 46, 6, EDM], [62, 70, 7, LATIN], [150, 44, 5, POP], [170, 78, 4, ROCK]];
    return dots + bubbles.map(([x, y, r, c]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" fill-opacity=".8"/>`).join("");
  },
};

(function () {
  "use strict";

  const HOME = "accueil";
  const tabs = document.querySelector(".ix-tabs");
  const home = document.getElementById("ix-home");
  const cards = document.querySelector(".ix-cards");
  const profiles = document.querySelector(".ix-profiles");
  const genres = document.querySelector(".ix-genres");
  const frames = document.querySelector(".ix-frames");
  const available = new Map();
  const loaded = new Map();
  const byId = new Map(VISUS.map((v) => [v.id, v]));

  function el(tag, cls, text, parent) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }

  // une page existe si le serveur la renvoie (HEAD suffit, pas de téléchargement)
  function exists(file) {
    return fetch(file, { method: "HEAD", cache: "no-store" })
      .then((r) => r.ok)
      .catch(() => false);
  }

  function renderGenres() {
    for (const [name, color] of GENRES) {
      const li = el("li", null, null, genres);
      el("span", "ix-genre-dot", null, li).style.background = color;
      el("span", null, name, li);
    }
  }

  function renderTabs() {
    tabs.innerHTML = "";
    for (const v of [{ id: HOME, title: "Accueil" }, ...VISUS]) {
      const tab = el("a", "ix-tab", null, tabs);
      tab.href = `#${v.id}`;
      tab.id = `ix-tab-${v.id}`;
      tab.setAttribute("role", "tab");
      tab.dataset.id = v.id;
      el("span", null, v.title, tab);
      if (v.id !== HOME && !available.get(v.id)) {
        tab.classList.add("is-pending");
        el("span", "ix-badge", "à venir", tab);
      }
    }
  }

  function renderCards() {
    cards.innerHTML = "";
    for (const v of VISUS) {
      const ready = available.get(v.id);
      const card = el(ready ? "a" : "div", `ix-card${ready ? "" : " is-pending"}`, null, cards);
      if (ready) card.href = `#${v.id}`;

      const thumb = el("div", "ix-thumb", null, card);
      thumb.innerHTML = `<svg viewBox="0 0 200 110" aria-hidden="true">${THUMBS[v.id] ? THUMBS[v.id]() : ""}</svg>`;
      el("span", "ix-type", v.data, thumb);

      const body = el("div", "ix-card-body", null, card);
      const head = el("div", "ix-card-head", null, body);
      el("h3", null, v.title, head);
      el("span", ready ? "ix-status" : "ix-status is-pending", ready ? "Disponible" : "À venir", head);
      el("p", "ix-card-question", v.question, body);
      const list = el("ul", "ix-card-tasks", null, body);
      list.setAttribute("aria-label", "Tâches");
      v.tasks.forEach((t) => el("li", null, t, list));

      const foot = el("div", "ix-card-foot", null, body);
      const who = el("span", "ix-member", null, foot);
      el("span", "ix-avatar", v.member.charAt(0), who).setAttribute("aria-hidden", "true");
      el("span", null, v.member, who);
      el("span", "ix-open", ready ? "Ouvrir →" : `${v.file}`, foot);
    }
  }

  function renderProfiles() {
    profiles.innerHTML = "";
    for (const p of PROFILES) {
      const card = el("article", "ix-profile", null, profiles);
      el("h3", null, p.title, card);
      el("p", null, p.goal, card);
      const links = el("div", "ix-profile-links", null, card);
      for (const id of p.visus) {
        const v = byId.get(id);
        if (!v) continue;
        const ready = available.get(id);
        const link = el(ready ? "a" : "span", ready ? "ix-chip" : "ix-chip is-pending", v.title, links);
        if (ready) link.href = `#${id}`;
      }
    }
  }

  // schéma du pipeline : 5 colonnes (brut → nettoyage → transformations → dérivés → vues)
  function renderPipeline() {
    const COLS = [
      { x: 0, w: 160, head: "Données brutes" },
      { x: 200, w: 165, head: "Nettoyage" },
      { x: 410, w: 210, head: "Transformations" },
      { x: 660, w: 180, head: "Données dérivées" },
      { x: 875, w: 165, head: "Vues" },
    ];
    const [A, B, C, D, E] = COLS;
    const H = 56, PITCH = 76, TOP = 36;
    const rowY = (i) => TOP + i * PITCH;
    const mid = (i) => rowY(i) + H / 2;
    const center = mid(Math.floor(PIPELINE.rows.length / 2));
    const height = rowY(PIPELINE.rows.length - 1) + H + 4;
    const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

    const node = (col, y, h, cls, lines) =>
      `<rect class="f-node ${cls}" x="${col.x}" y="${y}" width="${col.w}" height="${h}" rx="10"/>` +
      lines.map(([text, tcls, dy]) => `<text class="${tcls}" x="${col.x + 12}" y="${y + dy}">${esc(text)}</text>`).join("");
    const edge = (x1, y1, x2, y2) => {
      const cx = (x1 + x2) / 2;
      return `<path class="f-edge" marker-end="url(#ix-arrow)" d="M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2 - 3},${y2}"/>`;
    };

    let out = `<defs><marker id="ix-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
      <path class="f-arrow" d="M0,0 L8,4 L0,8 z"/></marker></defs>`;
    out += COLS.map((c) => `<text class="f-col" x="${c.x}" y="12">${c.head}</text>`).join("");

    const big = 72, bigY = center - big / 2;
    out += node(A, bigY, big, "is-data", [[PIPELINE.raw.label, "f-sub", 20], [PIPELINE.raw.title, "f-title f-mono", 39], [PIPELINE.raw.sub, "f-sub", 57]]);
    out += edge(A.x + A.w, center, B.x, center);
    out += node(B, bigY, big, "is-data", [[PIPELINE.clean.label, "f-sub", 20], [PIPELINE.clean.title, "f-title f-mono", 39], [PIPELINE.clean.sub, "f-sub", 57]]);

    PIPELINE.rows.forEach((r, i) => {
      const y = rowY(i), m = mid(i);
      const v = byId.get(r.visu);
      const ready = available.get(r.visu);
      out += edge(B.x + B.w, center, C.x, m);
      out += node(C, y, H, "is-step", [[r.step, "f-title", 33]]);
      out += edge(C.x + C.w, m, D.x, m);
      out += node(D, y, H, "is-data", [[r.file, "f-title f-mono", 23], [r.sub, "f-sub", 41]]);
      out += edge(D.x + D.w, m, E.x, m);
      const who = v ? v.member.split(" ")[0] : "";
      const view = node(E, y, H, "", [[r.label || (v ? v.title : r.visu), "f-title", 23], [r.extra ? `${who} · + ${r.extra}` : who, "f-sub", 41]]);
      out += ready
        ? `<a class="f-view" href="#${r.visu}">${view}</a>`
        : `<g class="f-view is-pending">${view}</g>`;
    });

    const box = document.querySelector(".ix-flow-svg");
    box.innerHTML = `<svg viewBox="-2 0 1044 ${height}" role="img" aria-label="Pipeline : spotify_songs.csv, nettoyage vers tracks_clean.csv, puis cinq transformations produisant chacune un dataset dérivé utilisé par une vue">${out}</svg>`;
  }

  function frameFor(v) {
    if (loaded.has(v.id)) return loaded.get(v.id);
    const wrap = el("section", "ix-frame", null, frames);
    wrap.setAttribute("role", "tabpanel");
    wrap.setAttribute("aria-labelledby", `ix-tab-${v.id}`);
    if (available.get(v.id)) {
      const iframe = el("iframe", null, null, wrap);
      iframe.src = v.file;
      iframe.title = `${v.title} (${v.member})`;
    } else {
      const box = el("div", "ix-placeholder", null, wrap);
      const thumb = el("div", "ix-thumb ix-placeholder-thumb", null, box);
      thumb.innerHTML = `<svg viewBox="0 0 200 110" aria-hidden="true">${THUMBS[v.id] ? THUMBS[v.id]() : ""}</svg>`;
      el("h2", null, v.title, box);
      el("p", null, `Cette visualisation (${v.member}) n'est pas encore fusionnée dans la branche principale.`, box);
      el("code", null, v.file, box);
    }
    loaded.set(v.id, wrap);
    return wrap;
  }

  function show(id) {
    const visu = byId.get(id);
    const current = visu ? id : HOME;

    tabs.querySelectorAll(".ix-tab").forEach((tab) => {
      const on = tab.dataset.id === current;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
      if (on) tab.scrollIntoView({ block: "nearest", inline: "nearest" });
    });

    home.hidden = Boolean(visu);
    frames.hidden = !visu;
    // les cadres déjà ouverts sont masqués, pas détruits : chaque vue garde son état
    loaded.forEach((wrap) => (wrap.hidden = true));
    if (visu) frameFor(visu).hidden = false;
    else window.scrollTo(0, 0);

    document.title = visu ? `${visu.title} · Spotify` : "Spotify · Visualisations";
  }

  function route() {
    show(decodeURIComponent(location.hash.slice(1)) || HOME);
  }

  // navigation au clavier dans les onglets (flèches, Début, Fin)
  tabs.addEventListener("keydown", (event) => {
    const list = [...tabs.querySelectorAll(".ix-tab")];
    const i = list.indexOf(document.activeElement);
    if (i < 0) return;
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: list.length - 1 }[event.key];
    if (next == null) return;
    event.preventDefault();
    const tab = list[(next + list.length) % list.length];
    tab.focus();
    location.hash = tab.dataset.id;
  });

  window.addEventListener("hashchange", route);

  renderGenres();
  Promise.all(VISUS.map((v) => exists(v.file).then((ok) => available.set(v.id, ok)))).then(() => {
    renderTabs();
    renderCards();
    renderProfiles();
    renderPipeline();
    route();
  });
})();
