/* ============================================================
   Heatmap de corrélation  (Maud)
   - overview : matrice de corrélation (Pearson) entre features
   - détail  : clic sur une case -> nuage de points des 2 features
   - filtre  : par genre -> recalcule la matrice (corrélation dynamique)
   Données : correlation.json (matrice "tous genres") + tracks_features.csv
   ============================================================ */

const CELL = 46;
const MARGIN = { top: 96, right: 20, bottom: 20, left: 96 };
const LEGEND_H = 60;

// Échelle de couleur divergente : bleu (négatif) ↔ gris (0) ↔ rouge (positif)
const color = d3.scaleLinear()
  .domain([-1, 0, 1])
  .range(["#2a78d6", "#eeece7", "#e34848"])
  .interpolate(d3.interpolateRgb)
  .clamp(true);

function textColor(v) {
  return d3.hsl(color(v)).l < 0.55 ? "#ffffff" : "#1e2126";
}

// Dans tracks_features.csv, tempo et loudness sont normalisés (_n).
// (La corrélation de Pearson est insensible à cette mise à l'échelle linéaire.)
const COL = { tempo: "tempo_n", loudness: "loudness_n" };
function featureCol(f) { return COL[f] || f; }

// ---- état partagé de la vue ----
let FEATURES, LABELS, ALL_MATRIX, ROWS;
let currentGenre = "";       // "" = tous les genres
let currentMatrix = null;    // matrice affichée
let lastPair = null;         // {i, j} de la dernière case cliquée
const tip = d3.select("#tip");

// Chargement : matrice pré-calculée (tous genres) + données par titre
Promise.all([DataLoader.correlation(), DataLoader.tracksFeatures()])
  .then(([corr, rows]) => {
    FEATURES = corr.features;
    LABELS = corr.labels;
    ALL_MATRIX = corr.matrix;
    ROWS = rows;
    setupGenreFilter();
    render(ALL_MATRIX);
  });

// --- barre de filtre genre ---
function setupGenreFilter() {
  const sel = d3.select("#genre-filter");
  sel.append("option").attr("value", "").text("Tous les genres");
  DataLoader.GENRES.forEach(g =>
    sel.append("option").attr("value", g).text(DataLoader.GENRE_LABELS[g] || g));

  sel.on("change", function () {
    currentGenre = this.value;
    // tous genres -> matrice pré-calculée ; sinon -> recalcul sur le sous-ensemble
    currentMatrix = currentGenre === "" ? ALL_MATRIX : computeMatrix(rowsForGenre());
    render(currentMatrix);
    if (lastPair) showScatter(lastPair.i, lastPair.j); // le filtre suit sur le scatter
  });
}

function rowsForGenre() {
  return currentGenre === "" ? ROWS : ROWS.filter(r => r.genre === currentGenre);
}

// --- corrélation de Pearson (recalcul dynamique par genre) ---
function pearson(xs, ys) {
  const n = xs.length;
  if (n < 2) return 0;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let k = 0; k < n; k++) {
    sx += xs[k]; sy += ys[k];
    sxx += xs[k] * xs[k]; syy += ys[k] * ys[k];
    sxy += xs[k] * ys[k];
  }
  const cov = sxy - sx * sy / n;
  const denom = Math.sqrt((sxx - sx * sx / n) * (syy - sy * sy / n));
  return denom === 0 ? 0 : cov / denom;
}

function computeMatrix(rows) {
  const cols = FEATURES.map(featureCol);
  // table numérique (on écarte les lignes avec une valeur manquante)
  const num = [];
  for (const r of rows) {
    const vals = cols.map(c => +r[c]);
    if (vals.every(v => !isNaN(v))) num.push(vals);
  }
  const n = FEATURES.length;
  const m = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const r = i === j ? 1 : pearson(num.map(v => v[i]), num.map(v => v[j]));
      m[i][j] = m[j][i] = Math.round(r * 1000) / 1000;
    }
  }
  return m;
}

// --- rendu de la matrice (appelé à chaque changement de filtre) ---
function render(matrix) {
  currentMatrix = matrix;
  const n = FEATURES.length;
  const host = d3.select("#heatmap");
  host.selectAll("*").remove();

  const width = MARGIN.left + CELL * n + MARGIN.right;
  const height = MARGIN.top + CELL * n + MARGIN.bottom + LEGEND_H;

  const svg = host.append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  const x = d3.scaleBand().domain(d3.range(n)).range([MARGIN.left, MARGIN.left + CELL * n]);
  const y = d3.scaleBand().domain(d3.range(n)).range([MARGIN.top, MARGIN.top + CELL * n]);

  const cells = [];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      cells.push({ i, j, v: matrix[i][j] });

  const cell = svg.append("g")
    .selectAll("g")
    .data(cells)
    .join("g")
    .attr("transform", d => `translate(${x(d.j)}, ${y(d.i)})`)
    .style("cursor", "pointer")
    .on("mouseover", function (event, d) {
      d3.select(this).select("rect").attr("stroke", "#1e2126").attr("stroke-width", 2);
      tip.style("display", "block")
        .html(`<b>${LABELS[FEATURES[d.i]]} × ${LABELS[FEATURES[d.j]]}</b><br>r = ${d.v.toFixed(2)}`);
    })
    .on("mousemove", function (event) {
      tip.style("left", (event.pageX + 12) + "px").style("top", (event.pageY + 12) + "px");
    })
    .on("mouseout", function () {
      d3.select(this).select("rect").attr("stroke", null);
      tip.style("display", "none");
    })
    .on("click", function (event, d) {
      if (d.i === d.j) return;
      lastPair = { i: d.i, j: d.j };
      showScatter(d.i, d.j);
    });

  cell.append("rect")
    .attr("width", x.bandwidth() - 2)
    .attr("height", y.bandwidth() - 2)
    .attr("rx", 3)
    .attr("fill", d => color(d.v));

  cell.append("text")
    .attr("x", (x.bandwidth() - 2) / 2)
    .attr("y", (y.bandwidth() - 2) / 2)
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .attr("font-size", 10)
    .attr("fill", d => textColor(d.v))
    .text(d => d.v.toFixed(2));

  // Labels lignes
  svg.append("g").selectAll("text").data(d3.range(n)).join("text")
    .attr("x", MARGIN.left - 8)
    .attr("y", i => y(i) + y.bandwidth() / 2)
    .attr("text-anchor", "end").attr("dominant-baseline", "middle")
    .attr("font-size", 11).attr("fill", "#5a5f66")
    .text(i => LABELS[FEATURES[i]]);

  // Labels colonnes (inclinés)
  svg.append("g").selectAll("text").data(d3.range(n)).join("text")
    .attr("transform", j => `translate(${x(j) + x.bandwidth() / 2}, ${MARGIN.top - 8}) rotate(-45)`)
    .attr("text-anchor", "start").attr("font-size", 11).attr("fill", "#5a5f66")
    .text(j => LABELS[FEATURES[j]]);

  drawLegend(svg, width, MARGIN.top + CELL * n + 40);
}

// --- légende divergente ---
function drawLegend(svg, width, yPos) {
  const barW = 220, barH = 12;
  const x0 = (width - barW) / 2;

  const grad = svg.append("defs").append("linearGradient").attr("id", "corr-gradient");
  [[0, -1], [0.5, 0], [1, 1]].forEach(([offset, v]) =>
    grad.append("stop").attr("offset", `${offset * 100}%`).attr("stop-color", color(v)));

  const g = svg.append("g");
  g.append("rect").attr("x", x0).attr("y", yPos).attr("width", barW).attr("height", barH)
    .attr("rx", 3).attr("fill", "url(#corr-gradient)").attr("stroke", "#e2e4e8");
  [["-1", x0], ["0", x0 + barW / 2], ["+1", x0 + barW]].forEach(([t, px]) =>
    g.append("text").attr("x", px).attr("y", yPos + barH + 14)
      .attr("text-anchor", "middle").attr("font-size", 10).attr("fill", "#5a5f66").text(t));
  g.append("text").attr("x", width / 2).attr("y", yPos - 8)
    .attr("text-anchor", "middle").attr("font-size", 10).attr("fill", "#8b8e95")
    .text("corrélation de Pearson");
}

// --- nuage de points des 2 features (détail), filtré par le genre courant ---
function showScatter(i, j) {
  const featX = FEATURES[j], featY = FEATURES[i];
  const r = currentMatrix[i][j];
  const cx = featureCol(featX), cy = featureCol(featY);

  const base = rowsForGenre();
  const valid = base.filter(d => !isNaN(+d[cx]) && !isNaN(+d[cy]) && d[cx] !== "" && d[cy] !== "");
  const step = Math.max(1, Math.ceil(valid.length / 3000));
  const sample = valid.filter((_, k) => k % step === 0);

  const host = d3.select("#scatter");
  host.selectAll("*").remove();
  d3.select("#scatter-hint").style("display", "none");

  const W = 460, H = 390, m = { top: 46, right: 16, bottom: 48, left: 54 };
  const svg = host.append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`).attr("preserveAspectRatio", "xMidYMid meet")
    .style("max-width", "480px").style("width", "100%").style("height", "auto");

  const xs = d3.scaleLinear().domain(d3.extent(sample, d => +d[cx])).nice().range([m.left, W - m.right]);
  const ys = d3.scaleLinear().domain(d3.extent(sample, d => +d[cy])).nice().range([H - m.bottom, m.top]);

  svg.append("g").attr("transform", `translate(0,${H - m.bottom})`).call(d3.axisBottom(xs).ticks(5));
  svg.append("g").attr("transform", `translate(${m.left},0)`).call(d3.axisLeft(ys).ticks(5));

  const genreTxt = currentGenre === "" ? "tous genres" : (DataLoader.GENRE_LABELS[currentGenre] || currentGenre);
  svg.append("text").attr("x", m.left).attr("y", 20)
    .attr("font-size", 13).attr("font-weight", 600).attr("fill", "#1e2126")
    .text(`${LABELS[featX]} vs ${LABELS[featY]}  (r = ${r.toFixed(2)})`);
  svg.append("text").attr("x", m.left).attr("y", 36)
    .attr("font-size", 10).attr("fill", "#8b8e95")
    .text(`${sample.length} titres · ${genreTxt} · couleur = genre`);

  svg.append("text").attr("x", (m.left + W - m.right) / 2).attr("y", H - 10)
    .attr("text-anchor", "middle").attr("font-size", 11).attr("fill", "#5a5f66").text(LABELS[featX]);
  svg.append("text").attr("transform", `translate(14,${(m.top + H - m.bottom) / 2}) rotate(-90)`)
    .attr("text-anchor", "middle").attr("font-size", 11).attr("fill", "#5a5f66").text(LABELS[featY]);

  svg.append("g").selectAll("circle").data(sample).join("circle")
    .attr("cx", d => xs(+d[cx]))
    .attr("cy", d => ys(+d[cy]))
    .attr("r", 2.5)
    .attr("fill", d => DataLoader.genreColor(d.genre))
    .attr("fill-opacity", 0.35)
    .on("mouseover", function (event, d) {
      tip.style("display", "block").html(`<b>${d.track_name}</b><br>${d.artist} · ${d.genre}`);
    })
    .on("mousemove", function (event) {
      tip.style("left", (event.pageX + 12) + "px").style("top", (event.pageY + 12) + "px");
    })
    .on("mouseout", function () { tip.style("display", "none"); });
}
