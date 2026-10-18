/* ============================================================
   Vue « Treemap zoomable » — Arij
   Hiérarchie  genre → sous-genre → artiste (→ titres en détail)

   Pipeline de visualisation (cf. README) :
     Données    DataLoader.hierarchy()  (+ tracksClean() en arrière-plan)
     Préparation filtres, agrégats, top N         → prepare()
     Placement   d3.treemap (squarify)            → layout()
     Rendu       SVG + interactions               → render()

   Principe : un état unique (state). Chaque interaction modifie
   state puis appelle update() → prepare → layout → render.

   Dépend de : d3 v7, js/DataLoader.js
   Usage     : TreemapView.mount(document.getElementById("treemap-view"))
   ============================================================ */
(function () {
  "use strict";

  /* ---------------- constantes ---------------- */
  const TOP_ARTISTS = 60;   // artistes gardés par sous-genre, le reste → « Autres »

  /* ---------------- helpers DOM ---------------- */
  function el(tag, cls, text, parent) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  const fmtN = (n) => d3.format(",")(n).replace(/,/g, " "); // 28 356

  /* ============================================================
     PRÉPARATION  (données dérivées → arbre prêt à dessiner)
     ------------------------------------------------------------
     Entrée : hierarchy.json, chaque artiste porte
              dec = { "2010": [nb titres, somme popularités], ... }
     Sortie : un arbre où chaque nœud a
              count  nb de titres retenus (→ aire)
              popSum somme des popularités  (→ popularité moyenne = popSum / count)
              kind   "root" | "genre" | "subgenre" | "artist" | "other"
     Règles :
       1. on ne garde que les décennies choisies (aucune = toutes) ;
       2. on écarte les artistes dont la popularité moyenne < minPopularity ;
       3. par sous-genre, on garde les TOP_ARTISTS plus gros artistes et on
          regroupe le reste dans un nœud « Autres » (sinon des milliers de
          rectangles illisibles : 10 148 artistes n'ont qu'un seul titre).
     Fonction pure : ne lit que ses arguments, ne modifie pas raw.
     ============================================================ */
  function aggregateArtist(artist, decades) {
    let count = 0, popSum = 0;
    for (const [dec, [n, pop]] of Object.entries(artist.dec || {})) {
      if (decades.size && !decades.has(+dec)) continue;
      count += n; popSum += pop;
    }
    // ancien format (sans « dec ») : pas de filtre possible, pas de popularité
    if (!artist.dec) count = artist.value || 0;
    return { name: artist.name, kind: "artist", count, popSum };
  }

  function prepare(raw, { decades = new Set(), minPopularity = 0, topN = TOP_ARTISTS } = {}) {
    const sumUp = (node) => {
      node.count = d3.sum(node.children, (c) => c.count);
      node.popSum = d3.sum(node.children, (c) => c.popSum);
      return node;
    };

    const genres = raw.children.map((g) => {
      const subgenres = g.children.map((s) => {
        const artists = s.children
          .map((a) => Object.assign(aggregateArtist(a, decades), { genre: g.name }))
          .filter((a) => a.count > 0 && a.popSum / a.count >= minPopularity)
          .sort((a, b) => d3.descending(a.count, b.count) || d3.ascending(a.name, b.name));

        const kept = artists.slice(0, topN);
        const rest = artists.slice(topN);
        if (rest.length) {
          kept.push({
            name: `Autres (${rest.length} artistes)`, kind: "other", genre: g.name, artists: rest.length,
            count: d3.sum(rest, (a) => a.count), popSum: d3.sum(rest, (a) => a.popSum),
          });
        }
        return sumUp({ name: s.name, kind: "subgenre", genre: g.name, children: kept });
      }).filter((s) => s.count > 0);
      return sumUp({ name: g.name, kind: "genre", genre: g.name, children: subgenres });
    }).filter((g) => g.count > 0);

    return sumUp({ name: "Catalogue", kind: "root", children: genres });
  }

  /* popularité moyenne d'un nœud préparé (null si vide) */
  const popMean = (d) => (d.count ? d.popSum / d.count : null);

  /* retrouve un nœud préparé à partir de son chemin (["pop", "dance pop"]) */
  function findByPath(tree, path) {
    let node = tree;
    for (const name of path) {
      node = (node.children || []).find((c) => c.name === name);
      if (!node) return null;
    }
    return node;
  }

  /* ============================================================
     PLACEMENT  (arbre préparé → rectangles)
     ------------------------------------------------------------
     On place le nœud courant sur toute la surface et on montre
     2 niveaux en dessous (ex. à la racine : genres puis sous-genres).
     - aire ∝ nombre de titres (ou popularité cumulée, étape 6)
     - squarify ratio 1 : rectangles proches du carré, dont l'aire
       se compare plus facilement que celle de bandes allongées
     - bandeau en haut de chaque groupe pour son nom (lecture de la
       hiérarchie, point faible classique de la treemap)
     ============================================================ */
  const HEADER = 22;      // hauteur du bandeau d'un groupe (px)

  function layout(data, width, height, sizeBy) {
    const root = d3.hierarchy(data)
      .sum((d) => (d.children ? 0 : sizeBy === "popularity" ? d.popSum : d.count))
      .sort((a, b) => b.value - a.value || d3.ascending(a.data.name, b.data.name));
    d3.treemap()
      .tile(d3.treemapSquarify.ratio(1))
      .size([width, height])
      .paddingOuter((d) => (d.depth === 0 ? 0 : 3))
      .paddingTop((d) => (d.depth === 1 && d.children ? HEADER : d.depth === 0 ? 0 : 3))
      .paddingInner((d) => (d.depth === 0 ? 6 : 2))
      .round(true)(root);
    return root;
  }

  /* ---------------- encodage couleur ---------------- */
  const genreOf = (d) => d.data.genre || d.data.name;
  const fillOf = (d) => DataLoader.genreColor(genreOf(d));
  // texte noir ou blanc selon la clarté du fond (contraste lisible)
  const textOn = (fill) => (d3.lab(fill).l > 62 ? "#0b0b0b" : "#ffffff");
  const labelOf = (d) => (d.data.kind === "genre" && DataLoader.GENRE_LABELS[d.data.name]) || d.data.name;
  const truncate = (str, max) => (max < 3 ? "" : str.length > max ? str.slice(0, max - 1) + "…" : str);

  function mount(container) {
    /* ---------- état unique de la vue ----------
       Les nœuds sont désignés par leur CHEMIN (["pop", "dance pop"]) et non
       par l'objet d3 : la hiérarchie est recalculée à chaque filtre, un
       objet nœud deviendrait obsolète, un chemin reste valide. */
    const state = {
      raw: null,              // hierarchy.json tel que chargé
      focusPath: [],          // nœud zoomé ([] = racine)
      selectedPath: null,     // nœud affiché dans le panneau
      comparePaths: [],       // 0 à 2 nœuds comparés
      sizeBy: "count",        // aire : "count" | "popularity"
      colorBy: "genre",       // couleur : "genre" | "popularity"
      decades: new Set(),     // décennies retenues (vide = toutes)
      minPopularity: 0,
      history: [], historyIndex: -1,
    };

    /* ---------- squelette : 4 zones ---------- */
    container.innerHTML = "";
    const root = el("div", "tm-root", null, container);
    const filters = el("div", "tm-filters", null, root);
    const nav = el("nav", "tm-nav", null, root);
    nav.setAttribute("aria-label", "Fil d'Ariane");
    const scene = el("div", "tm-scene", null, root);
    const aside = el("aside", "tm-aside", null, root);

    el("span", "tm-placeholder", "Filtres (étape 7)", filters);
    el("span", "tm-placeholder", "Catalogue", nav);
    const card = el("section", "tm-card", null, aside);
    el("h2", null, "Détails", card);
    el("p", "tm-placeholder", "Survolez ou cliquez un rectangle (étape 4).", card);

    const svg = d3.select(scene).append("svg").attr("class", "tm-svg")
      .attr("role", "img").attr("aria-label", "Treemap du catalogue Spotify");
    const status = el("div", "tm-status", null, scene);
    status.setAttribute("role", "status");
    status.textContent = "Chargement des données…";

    let prepared = null;   // dernier arbre préparé

    /* ---------- cycle de mise à jour : état → préparation → placement → rendu ---------- */
    function update() {
      prepared = prepare(state.raw, state);
      render();
    }

    /* ============================================================
       RENDU  (rectangles → SVG)
       niveau 1 : groupes (cadre teinté + bandeau nom · nb de titres)
       niveau 2 : rectangles pleins, couleur du genre, libellé s'il tient
       ============================================================ */
    function render() {
      const width = scene.clientWidth, height = scene.clientHeight;
      if (!prepared || !width || !height) return;

      const focus = findByPath(prepared, state.focusPath) || prepared;
      if (!focus.count) {
        svg.selectAll("*").remove();
        showStatus("Aucun titre ne correspond aux filtres.");
        return;
      }
      status.hidden = true;

      const root = layout(focus, width, height, state.sizeBy);
      svg.attr("viewBox", [0, 0, width, height]).attr("width", width).attr("height", height);
      const key = (d) => [...state.focusPath, ...d.ancestors().reverse().slice(1).map((n) => n.data.name)].join("/");

      /* niveau 1 */
      const groups = svg.selectAll("g.tm-group")
        .data(root.children || [], key)
        .join((enter) => {
          const g = enter.append("g").attr("class", "tm-group");
          g.append("rect").attr("class", "tm-frame");
          g.append("text").attr("class", "tm-group-label");
          return g;
        });

      groups.select("rect.tm-frame")
        .attr("x", (d) => d.x0).attr("y", (d) => d.y0)
        .attr("width", (d) => d.x1 - d.x0).attr("height", (d) => d.y1 - d.y0)
        .attr("rx", 4)
        .attr("fill", (d) => fillOf(d))
        .attr("fill-opacity", (d) => (d.children ? 0.22 : 1));

      groups.select("text.tm-group-label")
        .attr("x", (d) => d.x0 + 6)
        .attr("y", (d) => d.y0 + (d.children ? HEADER / 2 + 4 : 16))
        .attr("fill", (d) => (d.children ? "var(--text)" : textOn(fillOf(d))))
        .text((d) => truncate(`${labelOf(d)} · ${fmtN(d.value)}`, Math.floor((d.x1 - d.x0 - 12) / 7)));

      /* niveau 2 */
      groups.each(function (parent) {
        const cells = d3.select(this).selectAll("g.tm-cell")
          .data(parent.children || [], key)
          .join((enter) => {
            const c = enter.append("g").attr("class", "tm-cell");
            c.append("rect");
            c.append("text").attr("class", "tm-name");
            c.append("text").attr("class", "tm-count");
            return c;
          });
        cells.select("rect")
          .attr("x", (d) => d.x0).attr("y", (d) => d.y0)
          .attr("width", (d) => Math.max(0, d.x1 - d.x0)).attr("height", (d) => Math.max(0, d.y1 - d.y0))
          .attr("rx", 2)
          .attr("fill", (d) => fillOf(d))
          .classed("is-other", (d) => d.data.kind === "other");
        const w = (d) => d.x1 - d.x0, h = (d) => d.y1 - d.y0;
        cells.select("text.tm-name")
          .attr("x", (d) => d.x0 + 5).attr("y", (d) => d.y0 + 15)
          .attr("fill", (d) => textOn(fillOf(d)))
          .text((d) => (h(d) >= 20 ? truncate(labelOf(d), Math.floor((w(d) - 10) / 7)) : ""));
        cells.select("text.tm-count")
          .attr("x", (d) => d.x0 + 5).attr("y", (d) => d.y0 + 29)
          .attr("fill", (d) => textOn(fillOf(d)))
          .text((d) => (h(d) >= 36 && w(d) >= 60 ? `${fmtN(d.value)} titres` : ""));
      });
    }

    function showStatus(msg) {
      status.hidden = false;
      status.classList.remove("is-error");
      status.textContent = msg;
    }

    // redessine quand la zone change de taille (fenêtre, panneau…)
    let raf = 0;
    new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(render); }).observe(scene);

    /* ---------- chargement ---------- */
    DataLoader.hierarchy()
      .then((raw) => {
        state.raw = raw;
        update();
      })
      .catch((err) => {
        console.error("[treemap]", err);
        status.classList.add("is-error");
        status.innerHTML = "";
        el("strong", null, "Impossible de charger les données.", status);
        const p = el("span", null, "Lancez un serveur local depuis la racine du projet : ", status);
        el("code", null, "python -m http.server 8000", p);
        el("span", null, "puis ouvrez localhost:8000/treemap.html", status);
      });

    return { state, update, render };
  }

  window.TreemapView = { mount, prepare, popMean };
})();
