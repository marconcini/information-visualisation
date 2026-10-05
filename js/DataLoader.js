/* ============================================================
   DataLoader — point d'accès UNIQUE aux données (partagé)
   ------------------------------------------------------------
   Les données ont déjà été transformées par scripts/pipeline.ipynb
   (dossier data/derived/). Ici on ne fait que les CHARGER.

   Chaque membre appelle la méthode qui le concerne :
     DataLoader.correlation()     -> Maud   (heatmap)
     DataLoader.hierarchy()       -> Arij   (treemap / sunburst)
     DataLoader.trends()          -> Amir   (courbes multiples)
     DataLoader.tracksFeatures()  -> Adrien (coordonnées parallèles)
     DataLoader.tracksClean()     -> détails d'un titre (toutes les vues)
     DataLoader.countries()       -> équipe (carte, bonus)

   Toutes renvoient une Promise. Exemple :
     DataLoader.correlation().then(data => { ... dessiner ... });
   ============================================================ */

const DataLoader = {
  BASE: "data/derived/",
  _cache: {},

  // charge un fichier une seule fois (met en cache)
  _load(file, parser) {
    if (!this._cache[file]) {
      this._cache[file] = parser(this.BASE + file);
    }
    return this._cache[file];
  },

  // --- un accès par dataset dérivé ---
  tracksClean()    { return this._load("tracks_clean.csv",    d3.csv); },
  tracksFeatures() { return this._load("tracks_features.csv", d3.csv); },
  hierarchy()      { return this._load("hierarchy.json",      d3.json); },
  trends()         { return this._load("trends.json",         d3.json); },
  correlation()    { return this._load("correlation.json",    d3.json); },
  countries()      { return this._load("countries.json",      d3.json); },

  // --- constantes communes (genres & couleurs, accessibles daltoniens) ---
  GENRES: ["pop", "rap", "rock", "latin", "r&b", "edm"],
  GENRE_LABELS: { pop: "Pop", rap: "Rap", rock: "Rock", latin: "Latin", "r&b": "R&B", edm: "EDM" },
  GENRE_COLORS: {
    pop: "#2a78d6", rap: "#eb6834", rock: "#1baf7a",
    latin: "#eda100", "r&b": "#e87ba4", edm: "#008300",
  },
  genreColor(g) { return this.GENRE_COLORS[g] || "#9aa0a6"; },
};
