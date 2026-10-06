/* ============================================================
   Heatmap de corrélation  (Maud)
   Données : data/derived/correlation.json (via DataLoader)
   { features:[...], labels:{...}, matrix:[[...]] }
   ============================================================ */

// Dimensions d'une cellule et marges (place pour les labels)
const CELL = 46;
const MARGIN = { top: 96, right: 20, bottom: 20, left: 96 };
const LEGEND_H = 60; // espace sous la matrice pour la légende

// Échelle de couleur divergente : bleu (négatif) ↔ gris (0) ↔ rouge (positif)
const color = d3.scaleLinear()
  .domain([-1, 0, 1])
  .range(["#2a78d6", "#eeece7", "#e34848"])
  .interpolate(d3.interpolateRgb)
  .clamp(true);

// Couleur de texte lisible selon le fond de la cellule
function textColor(v) {
  return d3.hsl(color(v)).l < 0.55 ? "#ffffff" : "#1e2126";
}

// Chargement des données puis dessin
DataLoader.correlation().then(drawHeatmap);

function drawHeatmap(data) {
  const features = data.features;
  const labels = data.labels;
  const matrix = data.matrix;
  const n = features.length;

  const width = MARGIN.left + CELL * n + MARGIN.right;
  const height = MARGIN.top + CELL * n + MARGIN.bottom + LEGEND_H;

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

  // Groupe par cellule (case + valeur)
  const cell = svg.append("g")
    .selectAll("g")
    .data(cells)
    .join("g")
    .attr("transform", d => `translate(${x(d.j)}, ${y(d.i)})`);

  // La case colorée
  cell.append("rect")
    .attr("width", x.bandwidth() - 2)
    .attr("height", y.bandwidth() - 2)
    .attr("rx", 3)
    .attr("fill", d => color(d.v));

  // La valeur de corrélation dans la case
  cell.append("text")
    .attr("x", (x.bandwidth() - 2) / 2)
    .attr("y", (y.bandwidth() - 2) / 2)
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .attr("font-size", 10)
    .attr("fill", d => textColor(d.v))
    .text(d => d.v.toFixed(2));

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

  drawLegend(svg, width, MARGIN.top + CELL * n + 40);
}

// Légende : barre dégradée bleu ↔ gris ↔ rouge, de -1 à +1
function drawLegend(svg, width, yPos) {
  const barW = 220, barH = 12;
  const x0 = (width - barW) / 2;

  // Dégradé
  const defs = svg.append("defs");
  const grad = defs.append("linearGradient").attr("id", "corr-gradient");
  [[0, -1], [0.5, 0], [1, 1]].forEach(([offset, v]) => {
    grad.append("stop").attr("offset", `${offset * 100}%`).attr("stop-color", color(v));
  });

  const g = svg.append("g");
  g.append("rect")
    .attr("x", x0).attr("y", yPos)
    .attr("width", barW).attr("height", barH)
    .attr("rx", 3)
    .attr("fill", "url(#corr-gradient)")
    .attr("stroke", "#e2e4e8");

  // Graduations
  [["-1", x0], ["0", x0 + barW / 2], ["+1", x0 + barW]].forEach(([t, px]) => {
    g.append("text")
      .attr("x", px).attr("y", yPos + barH + 14)
      .attr("text-anchor", "middle")
      .attr("font-size", 10).attr("fill", "#5a5f66")
      .text(t);
  });

  g.append("text")
    .attr("x", width / 2).attr("y", yPos - 8)
    .attr("text-anchor", "middle")
    .attr("font-size", 10).attr("fill", "#8b8e95")
    .text("corrélation de Pearson");

  // TODO (étapes suivantes) :
  //  - tooltip au survol
  //  - clic sur une cellule -> nuage de points des 2 features
  //  - filtre par genre (recalcule la matrice)
}
