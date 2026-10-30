/* ============================================================
   Heatmap de corrélation  (Maud)
   - overview : matrice de corrélation (Pearson) entre features
   - détail  : clic sur une case -> nuage de points des 2 features (+ droite de tendance)
   - filtre  : par genre -> recalcule la matrice (corrélation dynamique)
   Données : correlation.json (matrice "tous genres") + tracks_features.csv
   ============================================================ */

const COL = { tempo: "tempo_n", loudness: "loudness_n" };
const featureCol = f => COL[f] || f;
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

let FEATURES, LABELS, ALL_MATRIX, ROWS;
let currentGenre = "", currentMatrix = null, lastPair = null;
const tip = d3.select("#tip");

function colorScale() {
  // interpolation Lab (perceptuelle) : les corrélations intermédiaires ressortent
  // mieux que l'interpolation RGB, sans changer les valeurs mappées.
  return d3.scaleLinear().domain([-1, 0, 1])
    .range([cssVar("--div-neg"), cssVar("--div-mid"), cssVar("--div-pos")])
    .interpolate(d3.interpolateLab).clamp(true);
}
function cellText(v) { return d3.hsl(colorScale()(v)).l < 0.55 ? "#ffffff" : "#1b1e24"; }

Promise.all([DataLoader.correlation(), DataLoader.tracksFeatures()]).then(([corr, rows]) => {
  FEATURES = corr.features; LABELS = corr.labels; ALL_MATRIX = corr.matrix; ROWS = rows;
  buildGenreFilter();
  paintLegend();
  renderMatrix(currentMatrix || ALL_MATRIX);   // respecte le filtre commun s'il est déjà actif
  setCoverage();

  // thème : re-rendu quand les couleurs changent (OS clair/sombre, ou thème forcé par le filtre commun)
  const reRender = () => {
    paintLegend(); renderMatrix(currentMatrix);
    if (lastPair) showScatter(lastPair.i, lastPair.j);
  };
  if (window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener && mq.addEventListener("change", reRender);
  }
  // le filtre commun pose data-theme sur <html> : on redessine pour relire les variables CSS
  new MutationObserver(reRender).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
});

function buildGenreFilter() {
  const sel = d3.select("#genre-filter");
  sel.append("option").attr("value", "").text("Tous les genres");
  DataLoader.GENRES.forEach(g => sel.append("option").attr("value", g).text(DataLoader.GENRE_LABELS[g] || g));

  let applying = false;                 // vrai quand on applique un filtre reçu (évite la boucle)

  // (ré)applique un genre à la vue : recalcule la matrice + le nuage
  function applyGenre(g) {
    currentGenre = g;
    sel.property("value", g);
    currentMatrix = g === "" ? ALL_MATRIX : computeMatrix(rowsForGenre());
    renderMatrix(currentMatrix);
    if (lastPair) showScatter(lastPair.i, lastPair.j);
  }

  sel.on("change", function () {
    applyGenre(this.value);
    if (!applying && window.Filters) Filters.set({ genre: this.value });   // prévient les autres vues
  });

  // filtre commun : état initial + écoute des changements venus des autres vues
  if (window.Filters) {
    const start = Filters.get().genre;
    if (start) applyGenre(start);
    Filters.onChange(s => {
      if (s.genre === currentGenre) return;
      applying = true; applyGenre(s.genre); applying = false;
    });
  }
}
const rowsForGenre = () => currentGenre === "" ? ROWS : ROWS.filter(r => r.genre === currentGenre);

/* --- corrélation de Pearson (recalcul par genre) --- */
function pearson(xs, ys) {
  const n = xs.length; if (n < 2) return 0;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let k = 0; k < n; k++) { sx += xs[k]; sy += ys[k]; sxx += xs[k] * xs[k]; syy += ys[k] * ys[k]; sxy += xs[k] * ys[k]; }
  const cov = sxy - sx * sy / n, den = Math.sqrt((sxx - sx * sx / n) * (syy - sy * sy / n));
  return den === 0 ? 0 : cov / den;
}
function computeMatrix(rows) {
  const cols = FEATURES.map(featureCol), num = [];
  for (const r of rows) { const v = cols.map(c => +r[c]); if (v.every(x => !isNaN(x))) num.push(v); }
  const n = FEATURES.length, m = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = i; j < n; j++) {
    const r = i === j ? 1 : pearson(num.map(v => v[i]), num.map(v => v[j]));
    m[i][j] = m[j][i] = Math.round(r * 1000) / 1000;
  }
  return m;
}

/* --- matrice --- */
function renderMatrix(matrix) {
  currentMatrix = matrix;
  const n = FEATURES.length, color = colorScale();
  const CELL = 40, M = { top: 96, right: 10, bottom: 10, left: 96 };
  const W = M.left + CELL * n + M.right, H = M.top + CELL * n + M.bottom;

  const host = d3.select("#heatmap"); host.selectAll("*").remove();
  const svg = host.append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("preserveAspectRatio", "xMidYMid meet")
    .attr("role", "img").attr("aria-label", "Matrice de corrélation des caractéristiques audio");

  const x = d3.scaleBand().domain(d3.range(n)).range([M.left, M.left + CELL * n]).padding(0.08);
  const y = d3.scaleBand().domain(d3.range(n)).range([M.top, M.top + CELL * n]).padding(0.08);

  // libellés lignes / colonnes (références pour le survol)
  const rowLab = svg.append("g").selectAll("text").data(d3.range(n)).join("text")
    .attr("x", M.left - 10).attr("y", i => y(i) + y.bandwidth() / 2)
    .attr("text-anchor", "end").attr("dominant-baseline", "middle")
    .attr("font-size", 11.5).attr("fill", cssVar("--ink-soft")).attr("data-row", i => i)
    .text(i => LABELS[FEATURES[i]]);
  const colLab = svg.append("g").selectAll("text").data(d3.range(n)).join("text")
    .attr("transform", j => `translate(${x(j) + x.bandwidth() / 2}, ${M.top - 10}) rotate(-45)`)
    .attr("text-anchor", "start").attr("font-size", 11.5).attr("fill", cssVar("--ink-soft")).attr("data-col", j => j)
    .text(j => LABELS[FEATURES[j]]);

  const cells = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) cells.push({ i, j, v: matrix[i][j] });

  const g = svg.append("g").selectAll("g").data(cells).join("g")
    .attr("transform", d => `translate(${x(d.j)},${y(d.i)})`);

  g.append("rect")
    .attr("width", x.bandwidth()).attr("height", y.bandwidth()).attr("rx", 4)
    .attr("fill", d => d.i === d.j ? cssVar("--diag") : color(d.v))
    .attr("stroke", d => (lastPair && d.i === lastPair.i && d.j === lastPair.j) ? cssVar("--ink") : "transparent")
    .attr("stroke-width", 2);

  g.filter(d => d.i !== d.j).append("text")
    .attr("x", x.bandwidth() / 2).attr("y", y.bandwidth() / 2)
    .attr("text-anchor", "middle").attr("dominant-baseline", "central")
    .attr("font-family", "IBM Plex Mono, monospace").attr("font-size", 9.5)
    .attr("fill", d => cellText(d.v)).text(d => d.v.toFixed(2));

  // interactions
  g.filter(d => d.i !== d.j)
    .style("cursor", "pointer")
    .on("mouseover", function (e, d) {
      d3.select(this).select("rect").attr("stroke", cssVar("--ink")).attr("stroke-width", 2);
      rowLab.filter(i => i === d.i).attr("fill", cssVar("--accent")).attr("font-weight", 600);
      colLab.filter(j => j === d.j).attr("fill", cssVar("--accent")).attr("font-weight", 600);
      tip.style("display", "block").html(`<b>${LABELS[FEATURES[d.i]]} × ${LABELS[FEATURES[d.j]]}</b><br>r = ${d.v.toFixed(2)}`);
    })
    .on("mousemove", e => tip.style("left", (e.pageX + 12) + "px").style("top", (e.pageY + 12) + "px"))
    .on("mouseout", function (e, d) {
      const sel = lastPair && d.i === lastPair.i && d.j === lastPair.j;
      d3.select(this).select("rect").attr("stroke", sel ? cssVar("--ink") : "transparent");
      rowLab.attr("fill", cssVar("--ink-soft")).attr("font-weight", null);
      colLab.attr("fill", cssVar("--ink-soft")).attr("font-weight", null);
      tip.style("display", "none");
    })
    .on("click", (e, d) => { lastPair = { i: d.i, j: d.j }; renderMatrix(currentMatrix); showScatter(d.i, d.j); });
}

function paintLegend() {
  const c = colorScale();
  d3.select("#legend-bar").style("background",
    `linear-gradient(90deg, ${c(-1)}, ${c(0)}, ${c(1)})`);
}

/* --- nuage de points (détail) --- */
function showScatter(i, j) {
  const featX = FEATURES[j], featY = FEATURES[i], r = currentMatrix[i][j];
  const cx = featureCol(featX), cy = featureCol(featY);
  const valid = rowsForGenre().filter(d => !isNaN(+d[cx]) && !isNaN(+d[cy]) && d[cx] !== "" && d[cy] !== "");
  const step = Math.max(1, Math.ceil(valid.length / 2500));
  const sample = valid.filter((_, k) => k % step === 0);

  d3.select("#detail").style("display", "none");
  d3.select("#detail-title").text(`${LABELS[featX]} vs ${LABELS[featY]}`);
  d3.select("#detail-r").attr("hidden", null).text(`r = ${r.toFixed(2)}`);

  const host = d3.select("#scatter"); host.selectAll("*").remove();
  const W = 440, H = 400, m = { top: 16, right: 16, bottom: 46, left: 50 };
  const svg = host.append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("preserveAspectRatio", "xMidYMid meet");

  const xs = d3.scaleLinear().domain(d3.extent(sample, d => +d[cx])).nice().range([m.left, W - m.right]);
  const ys = d3.scaleLinear().domain(d3.extent(sample, d => +d[cy])).nice().range([H - m.bottom, m.top]);
  const ink = cssVar("--ink-soft"), line = cssVar("--line");

  // grille discrète
  svg.append("g").attr("transform", `translate(0,${H - m.bottom})`)
    .call(d3.axisBottom(xs).ticks(5).tickSize(-(H - m.bottom - m.top)))
    .call(g => g.selectAll(".tick line").attr("stroke", line))
    .call(g => g.selectAll(".tick text").attr("fill", ink).attr("font-size", 10))
    .call(g => g.select(".domain").remove());
  svg.append("g").attr("transform", `translate(${m.left},0)`)
    .call(d3.axisLeft(ys).ticks(5).tickSize(-(W - m.left - m.right)))
    .call(g => g.selectAll(".tick line").attr("stroke", line))
    .call(g => g.selectAll(".tick text").attr("fill", ink).attr("font-size", 10))
    .call(g => g.select(".domain").remove());

  // points
  svg.append("g").selectAll("circle").data(sample).join("circle")
    .attr("cx", d => xs(+d[cx])).attr("cy", d => ys(+d[cy])).attr("r", 2.6)
    .attr("fill", d => DataLoader.genreColor(d.genre)).attr("fill-opacity", 0.38)
    .on("mouseover", function (e, d) {
      tip.style("display", "block").html(`<b>${d.track_name}</b><br>${d.artist} · ${d.genre}`);
    })
    .on("mousemove", e => tip.style("left", (e.pageX + 12) + "px").style("top", (e.pageY + 12) + "px"))
    .on("mouseout", () => tip.style("display", "none"));

  // droite de tendance (régression linéaire) — rend la corrélation lisible
  const pts = sample.map(d => [+d[cx], +d[cy]]);
  const nP = pts.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  pts.forEach(([a, b]) => { sx += a; sy += b; sxx += a * a; sxy += a * b; });
  const slope = (nP * sxx - sx * sx) === 0 ? 0 : (nP * sxy - sx * sy) / (nP * sxx - sx * sx);
  const intercept = (sy - slope * sx) / nP;
  const [x0, x1] = xs.domain();
  svg.append("line")
    .attr("x1", xs(x0)).attr("y1", ys(slope * x0 + intercept))
    .attr("x2", xs(x1)).attr("y2", ys(slope * x1 + intercept))
    .attr("stroke", cssVar("--ink")).attr("stroke-width", 1.6).attr("stroke-dasharray", "5 4").attr("opacity", .75);

  // libellés d'axes
  svg.append("text").attr("x", (m.left + W - m.right) / 2).attr("y", H - 8)
    .attr("text-anchor", "middle").attr("font-size", 11).attr("fill", ink).text(LABELS[featX]);
  svg.append("text").attr("transform", `translate(13,${(m.top + H - m.bottom) / 2}) rotate(-90)`)
    .attr("text-anchor", "middle").attr("font-size", 11).attr("fill", ink).text(LABELS[featY]);

  // sous-titre honnête (échantillon + genre)
  const gTxt = currentGenre === "" ? "tous genres" : (DataLoader.GENRE_LABELS[currentGenre] || currentGenre);
  d3.select("#matrix-sub").text(currentGenre === "" ? "corrélation de Pearson · tous genres"
    : `corrélation de Pearson · ${gTxt}`);
}

function setCoverage() {
  d3.select("#coverage").text(
    "Les corrélations sont calculées sur l'ensemble des titres ("
    + "28 356 au total) ; le nuage de points en affiche un échantillon pour la lisibilité. "
    + "Filtrer par genre recalcule la matrice sur ce genre uniquement.");
}
