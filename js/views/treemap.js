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

  /* ---------------- helpers DOM ---------------- */
  function el(tag, cls, text, parent) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  const fmtN = (n) => d3.format(",")(n).replace(/,/g, " "); // 28 356

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

    /* ---------- chargement ---------- */
    DataLoader.hierarchy()
      .then((raw) => {
        state.raw = raw;
        const h = d3.hierarchy(raw).sum((d) => d.value || 0);
        const genres = h.children.length;
        const subgenres = h.children.reduce((s, g) => s + g.children.length, 0);
        console.log(`[treemap] ${genres} genres, ${subgenres} sous-genres, ${h.value} titres`);
        status.textContent = `${genres} genres · ${subgenres} sous-genres · ${fmtN(h.value)} titres chargés`;
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

    return { state };
  }

  window.TreemapView = { mount };
})();
