/* ============================================================
   Heatmap de corrélation  (Maud)
   Données : data/derived/correlation.json (via DataLoader)
   { features:[...], labels:{...}, matrix:[[...]] }
   ============================================================ */

// Dimensions d'une cellule et marges (place pour les labels)
const CELL = 46;
const MARGIN = { top: 96, right: 20, bottom: 20, left: 96 };

// Échelle de couleur divergente : bleu (négatif) ↔ gris (0) ↔ rouge (positif)
const color = d3.scaleLinear()
  .domain([-1, 0, 1])
  .range(["#2a78d6", "#eeece7", "#e34948"])
  .interpolate(d3.interpolateRgb)
  .clamp(true);

// Chargement des données puis dessin
DataLoader.correlation().then(drawHeatmap);

function drawHeatmap(data) {
  const features = data.features;
  const labels = data.labels;
  const matrix = data.matrix;
  const n = features.length;

  const width = MARGIN.left + CELL * n + MARGIN.right;
  const height = MARGIN.top + CELL * n + MARGIN.bottom;

  const svg = d3.select("#heatmap")
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  // Échelles de position (une bande par feature)
  const x = d3.scaleBand().domain(d3.range(n)).range([MARGIN.left, MARGIN.left + CELL * n]);
  const y = d3.scaleBand().domain(d3.range(n)).range([MARGIN.top, MARGIN.top + CELL * n]);

  // Aplatir la matrice en une liste de cellules {i, j, v}
  const cells = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      cells.push({ i, j, v: matrix[i][j] });
    }
  }

  // Les cases colorées
  svg.append("g")
    .selectAll("rect")
    .data(cells)
    .join("rect")
    .attr("x", d => x(d.j))
    .attr("y", d => y(d.i))
    .attr("width", x.bandwidth() - 2)
    .attr("height", y.bandwidth() - 2)
    .attr("rx", 3)
    .attr("fill", d => color(d.v));

  // Labels des lignes (à gauche)
  svg.append("g")
    .selectAll("text")
    .data(d3.range(n))
    .join("text")
    .attr("x", MARGIN.left - 8)
    .attr("y", i => y(i) + y.bandwidth() / 2)
    .attr("text-anchor", "end")
    .attr("dominant-baseline", "middle")
    .attr("font-size", 11)
    .attr("fill", "#5a5f66")
    .text(i => labels[features[i]]);

  // Labels des colonnes (en haut, inclinés)
  svg.append("g")
    .selectAll("text")
    .data(d3.range(n))
    .join("text")
    .attr("transform", j => `translate(${x(j) + x.bandwidth() / 2}, ${MARGIN.top - 8}) rotate(-45)`)
    .attr("text-anchor", "start")
    .attr("font-size", 11)
    .attr("fill", "#5a5f66")
    .text(j => labels[features[j]]);

  // TODO (étapes suivantes) :
  //  - afficher la valeur r dans chaque cellule + légende de couleur
  //  - tooltip au survol
  //  - clic sur une cellule -> nuage de points des 2 features
  //  - filtre par genre (recalcule la matrice)
}
