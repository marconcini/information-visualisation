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
          .map((a) => aggregateArtist(a, decades))
          .filter((a) => a.count > 0 && a.popSum / a.count >= minPopularity)
          .sort((a, b) => d3.descending(a.count, b.count) || d3.ascending(a.name, b.name));

        const kept = artists.slice(0, topN);
        const rest = artists.slice(topN);
        if (rest.length) {
          kept.push({
            name: `Autres (${rest.length} artistes)`, kind: "other", artists: rest.length,
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

    const status = el("div", "tm-status", null, scene);
    status.setAttribute("role", "status");
    status.textContent = "Chargement des données…";

    /* ---------- cycle de mise à jour : état → préparation → (placement → rendu) ---------- */
    function update() {
      const tree = prepare(state.raw, state);
      const subgenres = d3.sum(tree.children, (g) => g.children.length);
      console.log(`[treemap] ${tree.children.length} genres, ${subgenres} sous-genres, ` +
        `${tree.count} titres, popularité moyenne ${popMean(tree).toFixed(1)}`);
      status.textContent = `${tree.children.length} genres · ${subgenres} sous-genres · ` +
        `${fmtN(tree.count)} titres · popularité moyenne ${popMean(tree).toFixed(0)}`;
      return tree;   // étape 2 : layout(tree) puis render()
    }

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

    return { state, update };
  }

  window.TreemapView = { mount, prepare, popMean };
})();
