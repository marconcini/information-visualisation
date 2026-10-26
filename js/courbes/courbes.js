// Courbes multiples (Amir) : évolution d'une feature par genre et par décennie
// Données : trends.json (courbes) + tracks_clean.csv (titres d'un point)

const W = 860, H = 440, CONTEXT_H = 70;
const MARGIN = { top: 24, right: 70, bottom: 44, left: 60 };
const MIN_COUNT = 30;   // en dessous : moyenne jugée peu fiable
const TOP_TRACKS = 5;   // titres listés dans le détail

const FEATURES = ["danceability", "energy", "valence", "acousticness", "speechiness",
                  "instrumentalness", "liveness", "tempo", "loudness", "popularity"];
const LABELS = {
  danceability: "Danceability", energy: "Energy", valence: "Valence",
  acousticness: "Acousticness", speechiness: "Speechiness",
  instrumentalness: "Instrumentalness", liveness: "Liveness",
  tempo: "Tempo (BPM)", loudness: "Loudness (dB)", popularity: "Popularité (0-100)",
};

let TRENDS;
let DECADES;
let currentFeature = "danceability";
let period = null;                   // [début, fin] ou null = toute la période
let selected = null;                 // point cliqué {genre, decade}
const hiddenGenres = new Set();
const tip = d3.select("#tip");

DataLoader.trends().then(rows => {
  TRENDS = rows;
  DECADES = Array.from(new Set(rows.map(d => d.decade))).sort(d3.ascending);
  setupFeatureSelect();
  setupLegend();
  setupContext();
  d3.select("#reset-period").on("click", () => setPeriod(null));
  render();
});

function setupFeatureSelect() {
  const sel = d3.select("#feature-select");
  sel.selectAll("option").data(FEATURES).join("option")
    .attr("value", f => f)
    .property("selected", f => f === currentFeature)
    .text(f => LABELS[f]);

  sel.on("change", function () {
    currentFeature = this.value;
    render();
  });
}

// légende cliquable : masquer / afficher un genre
function setupLegend() {
  const btn = d3.select("#legend").selectAll("button")
    .data(DataLoader.GENRES)
    .join("button")
    .attr("type", "button")
    .on("click", function (event, g) {
      hiddenGenres.has(g) ? hiddenGenres.delete(g) : hiddenGenres.add(g);
      d3.select(this).classed("off", hiddenGenres.has(g));
      if (selected && hiddenGenres.has(selected.genre)) selected = null;
      render();
    });

  btn.append("span").attr("class", "swatch").style("background", g => DataLoader.genreColor(g));
  btn.append("span").text(g => genreLabel(g));
}

let contextX, brush, gBrush;

function setupContext() {
  const totals = d3.rollups(TRENDS, v => d3.sum(v, d => d.count), d => d.decade)
    .map(([decade, count]) => ({ decade, count }));

  const svg = d3.select("#context").append("svg")
    .attr("viewBox", `0 0 ${W} ${CONTEXT_H}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .style("color", "var(--ink-soft)");

  const top = 6, bottom = CONTEXT_H - 22;
  contextX = d3.scaleLinear().domain(d3.extent(DECADES)).range([MARGIN.left, W - MARGIN.right]);
  const h = d3.scaleLinear().domain([0, d3.max(totals, d => d.count)]).range([0, bottom - top]);

  // barres = nombre de titres par décennie
  svg.append("g").selectAll("rect").data(totals).join("rect")
    .attr("x", d => contextX(d.decade) - 14)
    .attr("width", 28)
    .attr("y", d => bottom - Math.max(1, h(d.count)))
    .attr("height", d => Math.max(1, h(d.count)))
    .attr("rx", 2)
    .style("fill", "var(--line-strong)");

  svg.append("g")
    .attr("transform", `translate(0,${bottom})`)
    .call(d3.axisBottom(contextX).tickValues(DECADES).tickFormat(d => `${d}s`).tickSizeOuter(0));

  brush = d3.brushX()
    .extent([[MARGIN.left - 14, top], [W - MARGIN.right + 14, bottom]])
    .on("end", brushed);
  gBrush = svg.append("g").call(brush);
}

// la sélection est arrondie aux décennies (2 minimum)
function brushed(event) {
  if (!event.sourceEvent) return;
  if (!event.selection) { setPeriod(null); return; }

  const [a, b] = event.selection.map(px => contextX.invert(px));
  let lo = nearestDecade(a), hi = nearestDecade(b);
  if (lo === hi) {
    const i = DECADES.indexOf(lo);
    hi = DECADES[Math.min(i + 1, DECADES.length - 1)];
    if (lo === hi) lo = DECADES[i - 1];
  }
  setPeriod([lo, hi]);
}

function nearestDecade(v) {
  return d3.least(DECADES, d => Math.abs(d - v));
}

function setPeriod(p) {
  const full = p && p[0] === DECADES[0] && p[1] === DECADES[DECADES.length - 1];
  period = full ? null : p;
  gBrush.call(brush.move, period ? [contextX(period[0]), contextX(period[1])] : null);
  d3.select("#reset-period").property("disabled", period === null);
  if (selected && !inPeriod(selected.decade)) selected = null;
  render();
}

function inPeriod(decade) {
  return period === null || (decade >= period[0] && decade <= period[1]);
}

// une série par genre visible, limitée à la période
function buildSeries() {
  return d3.groups(TRENDS, d => d.genre)
    .filter(([g]) => !hiddenGenres.has(g))
    .sort((a, b) => DataLoader.GENRES.indexOf(a[0]) - DataLoader.GENRES.indexOf(b[0]))
    .map(([genre, rows]) => ({
      genre,
      points: rows
        .filter(r => inPeriod(r.decade))
        .map(r => ({ genre, decade: r.decade, value: r[currentFeature], count: r.count }))
        .sort((a, b) => a.decade - b.decade),
    }))
    .filter(s => s.points.length > 0);
}

const reliable = pts => pts.filter(p => p.count >= MIN_COUNT);

function render() {
  drawChart();
  drawDetails();
}

function drawChart() {
  const series = buildSeries();
  const host = d3.select("#courbes");
  host.selectAll("*").remove();

  const svg = host.append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .style("color", "var(--ink-soft)");

  const xDomain = period || d3.extent(DECADES);
  const x = d3.scaleLinear().domain(xDomain).range([MARGIN.left, W - MARGIN.right]);
  // échelle Y sur tous les genres, pour qu'elle ne change pas quand on en masque un
  const inRange = TRENDS.filter(d => inPeriod(d.decade));
  const y = d3.scaleLinear()
    .domain(d3.extent(inRange, d => d[currentFeature])).nice()
    .range([H - MARGIN.bottom, MARGIN.top]);
  const r = d3.scaleSqrt()
    .domain([0, d3.max(TRENDS, d => d.count)])
    .range([2, 11]);

  svg.append("g")
    .attr("transform", `translate(0,${H - MARGIN.bottom})`)
    .call(d3.axisBottom(x).tickValues(DECADES.filter(inPeriod)).tickFormat(d => `${d}s`));
  svg.append("g")
    .attr("transform", `translate(${MARGIN.left},0)`)
    .call(d3.axisLeft(y).ticks(6))
    .call(g => g.selectAll(".tick line").clone()
      .attr("x2", W - MARGIN.left - MARGIN.right)
      .style("stroke", "var(--line)"));

  svg.append("text")
    .attr("transform", `translate(16,${(MARGIN.top + H - MARGIN.bottom) / 2}) rotate(-90)`)
    .attr("text-anchor", "middle").attr("font-size", 11).style("fill", "var(--ink-soft)")
    .text(`${LABELS[currentFeature]} moyenne`);
  svg.append("text")
    .attr("x", (MARGIN.left + W - MARGIN.right) / 2).attr("y", H - 8)
    .attr("text-anchor", "middle").attr("font-size", 11).style("fill", "var(--ink-soft)")
    .text("Décennie de sortie");

  const gGenre = svg.append("g").selectAll("g")
    .data(series, s => s.genre)
    .join("g")
    .attr("class", "serie")
    .attr("color", s => DataLoader.genreColor(s.genre))
    .on("mouseenter", (event, s) => highlight(s.genre))
    .on("mouseleave", () => highlight(null));

  // pointillés si une moyenne repose sur moins de MIN_COUNT titres
  gGenre.selectAll("line")
    .data(s => d3.pairs(s.points))
    .join("line")
    .attr("x1", ([a]) => x(a.decade)).attr("y1", ([a]) => y(a.value))
    .attr("x2", ([, b]) => x(b.decade)).attr("y2", ([, b]) => y(b.value))
    .attr("stroke", "currentColor")
    .attr("stroke-width", 2.5)
    .attr("stroke-linecap", "round")
    .attr("stroke-dasharray", ([a, b]) => (a.count < MIN_COUNT || b.count < MIN_COUNT) ? "4 5" : null);

  // taille du point = nombre de titres
  gGenre.selectAll("circle")
    .data(s => s.points)
    .join("circle")
    .attr("cx", d => x(d.decade))
    .attr("cy", d => y(d.value))
    .attr("r", d => r(d.count))
    .style("fill", d => d.count < MIN_COUNT ? "var(--bg)" : "currentColor")
    .style("stroke", d => isSelected(d) ? "var(--ink)" : "currentColor")
    .attr("stroke-width", d => isSelected(d) ? 3 : 1.5)
    .style("cursor", "pointer")
    .on("mouseover", function (event, d) {
      tip.style("display", "block").html(
        `<b>${genreLabel(d.genre)} · ${d.decade}s</b><br>` +
        `${LABELS[currentFeature]} : ${formatValue(d.value)}<br>` +
        `${d.count} titre${d.count > 1 ? "s" : ""}` +
        (d.count < MIN_COUNT ? " (peu fiable)" : ""));
    })
    .on("mousemove", event => {
      tip.style("left", (event.clientX + 12) + "px").style("top", (event.clientY + 12) + "px");
    })
    .on("mouseout", () => tip.style("display", "none"))
    .on("click", (event, d) => {
      selected = isSelected(d) ? null : { genre: d.genre, decade: d.decade };
      render();
    });

  drawExtremes(gGenre, x, y);

  // nom du genre en bout de courbe
  const labelY = dodgeLabels(series.map(s => ({
    genre: s.genre, y: y(s.points[s.points.length - 1].value),
  })), 13);
  gGenre.append("text")
    .datum(s => ({ genre: s.genre, last: s.points[s.points.length - 1] }))
    .attr("x", d => x(d.last.decade) + 14)
    .attr("y", d => labelY.get(d.genre))
    .attr("dominant-baseline", "middle")
    .attr("font-size", 11).attr("font-weight", 600)
    .attr("fill", "currentColor")
    .text(d => genreLabel(d.genre));
}

// ▲ max et ▼ min de chaque courbe (décennies fiables uniquement)
function drawExtremes(gGenre, x, y) {
  const tri = d3.symbol().type(d3.symbolTriangle).size(42);

  gGenre.each(function (s) {
    const pts = reliable(s.points);
    if (pts.length < 2) return;
    const marks = [
      { kind: "max", p: d3.greatest(pts, d => d.value) },
      { kind: "min", p: d3.least(pts, d => d.value) },
    ];
    const g = d3.select(this).append("g").attr("class", "extremes").style("pointer-events", "none");

    g.selectAll("path").data(marks).join("path")
      .attr("d", tri)
      .attr("transform", m => `translate(${x(m.p.decade)},${y(m.p.value) + (m.kind === "max" ? -16 : 16)})` +
                              (m.kind === "min" ? " rotate(180)" : ""))
      .attr("fill", "currentColor");

    g.selectAll("text").data(marks).join("text")
      .attr("class", "extreme-label")
      .each(function (m) {
        // à gauche du triangle si l'étiquette sortirait du graphique
        const ty = y(m.p.value) + (m.kind === "max" ? -26 : 32);
        const out = ty < 12 || ty > y.range()[0] - 4;
        d3.select(this)
          .attr("x", x(m.p.decade) + (out ? -10 : 0))
          .attr("y", out ? y(m.p.value) + (m.kind === "max" ? -12 : 20) : ty)
          .attr("text-anchor", out ? "end" : "middle");
      })
      .attr("font-size", 11).attr("font-weight", 600)
      .attr("fill", "currentColor")
      .attr("paint-order", "stroke").style("stroke", "var(--bg)").attr("stroke-width", 3)
      .style("display", "none")
      .text(m => `${m.kind} ${formatValue(m.p.value)}`);
  });
}

// survol : la courbe ressort, les autres s'estompent
function highlight(genre) {
  const series = d3.selectAll("#courbes .serie");
  series.attr("opacity", s => genre === null || s.genre === genre ? 1 : 0.15);
  series.selectAll(".extreme-label")
    .style("display", function () {
      return genre !== null && d3.select(this.parentNode.parentNode).datum().genre === genre ? null : "none";
    });
  if (genre !== null) series.filter(s => s.genre === genre).raise();
}

function drawDetails() {
  const box = d3.select("#details");
  box.selectAll("*").remove();
  if (!selected) return;

  const { genre, decade } = selected;
  DataLoader.tracksClean().then(tracks => {
    if (!selected || selected.genre !== genre || selected.decade !== decade) return;
    const all = tracks.filter(t => t.genre === genre && +t.decade === decade);
    const top = all.slice().sort((a, b) => +b.popularity - +a.popularity).slice(0, TOP_TRACKS);

    box.append("h2").text(`${genreLabel(genre)}, années ${decade} : titres les plus populaires (${all.length} au total)`);
    box.append("ol").selectAll("li").data(top).join("li")
      .html(t => `${t.track_name} <span class="meta">— ${t.artist}, ${(+t.year).toFixed(0)}</span>`);
  });
}

function isSelected(d) {
  return selected !== null && selected.genre === d.genre && selected.decade === d.decade;
}

function genreLabel(g) {
  return DataLoader.GENRE_LABELS[g] || g;
}

// écarte les étiquettes trop proches verticalement
function dodgeLabels(labels, gap) {
  const sorted = labels.slice().sort((a, b) => a.y - b.y);
  for (let k = 1; k < sorted.length; k++)
    sorted[k].y = Math.max(sorted[k].y, sorted[k - 1].y + gap);
  return new Map(sorted.map(l => [l.genre, l.y]));
}

function formatValue(v, feature = currentFeature) {
  if (feature === "tempo") return `${v.toFixed(0)} BPM`;
  if (feature === "loudness") return `${v.toFixed(1)} dB`;
  if (feature === "popularity") return v.toFixed(0);
  return v.toFixed(3);
}
