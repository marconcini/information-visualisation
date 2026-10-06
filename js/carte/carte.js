/* ============================================================
   Carte des pays d'origine des artistes  (bonus, équipe)
   Données :
     - data/world.geojson            (formes des pays, id = code ISO alpha-3)
     - data/derived/countries.json   (via DataLoader : agrégats par pays)
   Choroplèthe : couleur = métrique (nb de titres OU popularité moy.).
   Interactions : survol (infobulle), clic (détail + sélection), métrique.
   ============================================================ */

const W = 900, H = 470;
const METRICS = {
  tracks: { label: "Nombre de titres", sqrt: true },
  avg_popularity: { label: "Popularité moyenne", sqrt: false },
};

let WORLD, DATA, BYCODE, RANK;
let currentMetric = "tracks", selectedCode = null;
let svg, path, gCountries, gLegend;
const tip = d3.select("#tip");

Promise.all([
  d3.json("data/world.geojson"),
  DataLoader.countries(),
]).then(([world, data]) => {
  WORLD = world;
  DATA = data;
  BYCODE = new Map((data.by_country || []).map(d => [d.code, d]));
  // rang par volume de titres (pour le panneau détail)
  RANK = new Map(data.by_country.map((d, i) => [d.code, i + 1]));

  svg = d3.select("#map").append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  const projection = d3.geoNaturalEarth1().fitSize([W, H - 30], world);
  path = d3.geoPath(projection);
  gCountries = svg.append("g");
  gLegend = svg.append("g");

  setCoverage();
  d3.select("#metric-filter").on("change", function () { render(this.value); });
  render("tracks");
});

function strokeColor(f) { return f.id === selectedCode ? "#1e2126" : "#ffffff"; }
function strokeWidth(f) { return f.id === selectedCode ? 1.8 : 0.4; }

function render(metric) {
  currentMetric = metric;
  const useSqrt = METRICS[metric].sqrt;
  const values = DATA.by_country.map(d => d[metric]).filter(v => v != null);
  const maxV = d3.max(values) || 1;
  const minV = metric === "avg_popularity" ? (d3.min(values) || 0) : 0;
  const colorScale = (useSqrt ? d3.scaleSequentialSqrt(d3.interpolateBlues)
                              : d3.scaleSequential(d3.interpolateBlues)).domain([minV, maxV]);

  gCountries.selectAll("path")
    .data(WORLD.features)
    .join("path")
    .attr("d", path)
    .attr("stroke", strokeColor)
    .attr("stroke-width", strokeWidth)
    .attr("fill", f => {
      const c = BYCODE.get(f.id);
      return (c && c[metric] != null) ? colorScale(c[metric]) : "#eceef1";
    })
    .style("cursor", "pointer")
    .on("mouseover", function (event, f) {
      if (f.id !== selectedCode) d3.select(this).attr("stroke", "#9aa0a6").attr("stroke-width", 1).raise();
      const c = BYCODE.get(f.id);
      tip.style("display", "block").html(c
        ? `<b>${f.properties.name}</b><br>${c.tracks} titres · ${c.artists} artistes<br>popularité moy. ${c.avg_popularity}`
        : `<b>${f.properties.name}</b><br><i>pas de donnée</i>`);
    })
    .on("mousemove", function (event) {
      tip.style("left", (event.pageX + 12) + "px").style("top", (event.pageY + 12) + "px");
    })
    .on("mouseout", function (event, f) {
      d3.select(this).attr("stroke", strokeColor(f)).attr("stroke-width", strokeWidth(f));
      tip.style("display", "none");
    })
    .on("click", function (event, f) {
      selectedCode = f.id;
      gCountries.selectAll("path").attr("stroke", strokeColor).attr("stroke-width", strokeWidth);
      d3.select(this).raise();
      showDetail(f);
    });

  drawLegend(colorScale, minV, maxV);
}

function showDetail(f) {
  const c = BYCODE.get(f.id);
  const el = d3.select("#detail");
  if (!c) {
    el.html(`<p class="muted"><b>${f.properties.name}</b> — pas de donnée `
      + `(artiste(s) non enrichi(s) ou hors du top ${DATA.coverage.artists_queried}).</p>`);
    return;
  }
  el.html(`<div class="card">
      <h3>${f.properties.name}</h3>
      <div class="stats">
        <div><span>${c.tracks}</span>titres produits</div>
        <div><span>${c.artists}</span>artistes</div>
        <div><span>${c.avg_popularity}</span>popularité moy. (globale)</div>
        <div><span>#${RANK.get(f.id)}</span>rang (volume)</div>
      </div>
    </div>`);
}

function drawLegend(colorScale, minV, maxV) {
  gLegend.selectAll("*").remove();
  const barW = 220, barH = 12, x0 = 20, y0 = H - 22;

  const grad = gLegend.append("defs").append("linearGradient").attr("id", "map-gradient");
  d3.range(0, 1.01, 0.1).forEach(t =>
    grad.append("stop").attr("offset", `${t * 100}%`)
      .attr("stop-color", colorScale(minV + t * (maxV - minV))));

  gLegend.append("rect").attr("x", x0).attr("y", y0).attr("width", barW).attr("height", barH)
    .attr("rx", 3).attr("fill", "url(#map-gradient)").attr("stroke", "#e2e4e8");
  gLegend.append("text").attr("x", x0).attr("y", y0 - 5)
    .attr("font-size", 10).attr("fill", "#5a5f66").text(Math.round(minV));
  gLegend.append("text").attr("x", x0 + barW).attr("y", y0 - 5).attr("text-anchor", "end")
    .attr("font-size", 10).attr("fill", "#5a5f66").text(Math.round(maxV));

  gLegend.append("rect").attr("x", x0 + barW + 24).attr("y", y0).attr("width", barH).attr("height", barH)
    .attr("rx", 3).attr("fill", "#eceef1").attr("stroke", "#e2e4e8");
  gLegend.append("text").attr("x", x0 + barW + 24 + barH + 6).attr("y", y0 + barH - 2)
    .attr("font-size", 10).attr("fill", "#5a5f66").text("pas de donnée");
}

function setCoverage() {
  const cov = DATA.coverage;
  if (cov) {
    d3.select("#coverage").text(
      `Basé sur les ${cov.artists_queried} artistes les plus fréquents · `
      + `${cov.pct_tracks}% des titres couverts · pays d'origine (MusicBrainz).`
    );
  }
}
