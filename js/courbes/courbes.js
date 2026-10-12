/* ============================================================
   Courbes multiples  (Amir)
   - overview : une courbe par genre, décennie (X) × feature moyenne (Y)
   - filtre   : choix de la feature + genres affichés (légende cliquable)
   - fiabilité: taille du point = nombre de titres,
                pointillés quand une moyenne repose sur trop peu de titres
   Données : trends.json (décennie × genre × moyennes)
   ============================================================ */

const W = 860, H = 440;
const MARGIN = { top: 24, right: 70, bottom: 44, left: 60 };
const MIN_COUNT = 30;   // en dessous : moyenne jugée peu fiable

const FEATURES = ["danceability", "energy", "valence", "acousticness", "speechiness",
                  "instrumentalness", "liveness", "tempo", "loudness", "popularity"];
const LABELS = {
  danceability: "Danceability", energy: "Energy", valence: "Valence",
  acousticness: "Acousticness", speechiness: "Speechiness",
  instrumentalness: "Instrumentalness", liveness: "Liveness",
  tempo: "Tempo (BPM)", loudness: "Loudness (dB)", popularity: "Popularité (0-100)",
};

// ---- état de la vue ----
let TRENDS;                          // lignes brutes de trends.json
let currentFeature = "danceability";
const hiddenGenres = new Set();      // genres masqués via la légende
const tip = d3.select("#tip");

DataLoader.trends().then(rows => {
  TRENDS = rows;
  setupFeatureSelect();
  setupLegend();
  render();
});

// --- menu de choix de la feature ---
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

// --- légende cliquable (afficher / masquer un genre) ---
function setupLegend() {
  const btn = d3.select("#legend").selectAll("button")
    .data(DataLoader.GENRES)
    .join("button")
    .attr("type", "button")
    .on("click", function (event, g) {
      hiddenGenres.has(g) ? hiddenGenres.delete(g) : hiddenGenres.add(g);
      d3.select(this).classed("off", hiddenGenres.has(g));
      render();
    });

  btn.append("span").attr("class", "swatch").style("background", g => DataLoader.genreColor(g));
  btn.append("span").text(g => DataLoader.GENRE_LABELS[g] || g);
}

// --- une série par genre : [{decade, value, count}] triée par décennie ---
function buildSeries() {
  return d3.groups(TRENDS, d => d.genre)
    .filter(([g]) => !hiddenGenres.has(g))
    .map(([genre, rows]) => ({
      genre,
      points: rows
        .map(r => ({ genre, decade: r.decade, value: r[currentFeature], count: r.count }))
        .sort((a, b) => a.decade - b.decade),
    }));
}

// --- rendu (appelé à chaque changement de feature ou de genres) ---
function render() {
  const series = buildSeries();
  const host = d3.select("#courbes");
  host.selectAll("*").remove();

  const svg = host.append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  // échelles : X sur toutes les décennies du dataset (stable quand on masque un genre)
  const decades = d3.extent(TRENDS, d => d.decade);
  const x = d3.scaleLinear().domain(decades).range([MARGIN.left, W - MARGIN.right]);
  const y = d3.scaleLinear()
    .domain(d3.extent(TRENDS, d => d[currentFeature])).nice()
    .range([H - MARGIN.bottom, MARGIN.top]);
  const r = d3.scaleSqrt()
    .domain([0, d3.max(TRENDS, d => d.count)])
    .range([2, 11]);

  // axes + grille horizontale
  svg.append("g")
    .attr("transform", `translate(0,${H - MARGIN.bottom})`)
    .call(d3.axisBottom(x).tickValues(d3.range(decades[0], decades[1] + 1, 10)).tickFormat(d => `${d}s`));
  svg.append("g")
    .attr("transform", `translate(${MARGIN.left},0)`)
    .call(d3.axisLeft(y).ticks(6))
    .call(g => g.selectAll(".tick line").clone()
      .attr("x2", W - MARGIN.left - MARGIN.right)
      .attr("stroke", "#e2e4e8"));

  svg.append("text")
    .attr("transform", `translate(16,${(MARGIN.top + H - MARGIN.bottom) / 2}) rotate(-90)`)
    .attr("text-anchor", "middle").attr("font-size", 11).attr("fill", "#5a5f66")
    .text(`${LABELS[currentFeature]} moyenne`);
  svg.append("text")
    .attr("x", (MARGIN.left + W - MARGIN.right) / 2).attr("y", H - 8)
    .attr("text-anchor", "middle").attr("font-size", 11).attr("fill", "#5a5f66")
    .text("Décennie de sortie");

  // un groupe par genre (permet de mettre une courbe en avant au survol)
  const gGenre = svg.append("g").selectAll("g")
    .data(series, s => s.genre)
    .join("g")
    .attr("class", "serie")
    .attr("color", s => DataLoader.genreColor(s.genre))
    .on("mouseenter", function (event, s) { highlight(svg, s.genre); })
    .on("mouseleave", function () { highlight(svg, null); });

  // segments : pointillés si une des deux extrémités repose sur trop peu de titres
  gGenre.selectAll("line")
    .data(s => d3.pairs(s.points))
    .join("line")
    .attr("x1", ([a]) => x(a.decade)).attr("y1", ([a]) => y(a.value))
    .attr("x2", ([, b]) => x(b.decade)).attr("y2", ([, b]) => y(b.value))
    .attr("stroke", "currentColor")
    .attr("stroke-width", 2.5)
    .attr("stroke-linecap", "round")
    .attr("stroke-dasharray", ([a, b]) => (a.count < MIN_COUNT || b.count < MIN_COUNT) ? "4 5" : null);

  // points : taille = nombre de titres
  gGenre.selectAll("circle")
    .data(s => s.points)
    .join("circle")
    .attr("cx", d => x(d.decade))
    .attr("cy", d => y(d.value))
    .attr("r", d => r(d.count))
    .attr("fill", d => d.count < MIN_COUNT ? "#fff" : "currentColor")
    .attr("stroke", "currentColor")
    .attr("stroke-width", 1.5)
    .on("mouseover", function (event, d) {
      tip.style("display", "block").html(
        `<b>${DataLoader.GENRE_LABELS[d.genre] || d.genre} · ${d.decade}s</b><br>` +
        `${LABELS[currentFeature]} : ${formatValue(d.value)}<br>` +
        `${d.count} titre${d.count > 1 ? "s" : ""}` +
        (d.count < MIN_COUNT ? `<br><i>moyenne peu fiable</i>` : ""));
    })
    .on("mousemove", function (event) {
      tip.style("left", (event.clientX + 12) + "px").style("top", (event.clientY + 12) + "px");
    })
    .on("mouseout", function () { tip.style("display", "none"); });

  // étiquette du genre en bout de courbe (évite de devoir lire la légende)
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
    .text(d => DataLoader.GENRE_LABELS[d.genre] || d.genre);
}

// --- survol : une courbe ressort, les autres passent en retrait ---
function highlight(svg, genre) {
  svg.selectAll(".serie")
    .attr("opacity", s => genre === null || s.genre === genre ? 1 : 0.15);
  if (genre !== null) svg.selectAll(".serie").filter(s => s.genre === genre).raise();
}

// --- écarte verticalement les étiquettes trop proches (au moins `gap` px) ---
function dodgeLabels(labels, gap) {
  const sorted = labels.slice().sort((a, b) => a.y - b.y);
  for (let k = 1; k < sorted.length; k++)
    sorted[k].y = Math.max(sorted[k].y, sorted[k - 1].y + gap);
  return new Map(sorted.map(l => [l.genre, l.y]));
}

function formatValue(v) {
  if (currentFeature === "tempo") return `${v.toFixed(0)} BPM`;
  if (currentFeature === "loudness") return `${v.toFixed(1)} dB`;
  if (currentFeature === "popularity") return v.toFixed(0);
  return v.toFixed(3);
}
