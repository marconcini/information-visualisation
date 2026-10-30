(function () {
  "use strict";

  const W = 960;
  const H = 520;
  const DURATION = 750;
  const MAX_RADIUS = 34;
  const BUBBLES = 60;
  const LIST_STEP = 30;
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 8;
  const REGION_ORDER = ["Amérique du Nord", "Amérique latine et Caraïbes", "Europe", "Afrique", "Asie", "Océanie", "Autre"];
  const FEATURES = [
    ["danceability", "Dansabilité"],
    ["energy", "Énergie"],
    ["valence", "Valence (humeur positive)"],
    ["acousticness", "Acoustique"],
    ["speechiness", "Parlé"],
    ["instrumentalness", "Instrumental"],
    ["liveness", "Live"],
  ];

  const toNumber = (value) => (value == null || String(value).trim() === "" ? NaN : +value);
  const fmt2 = d3.format(".2f");
  const fmtN = (n) => d3.format(",")(n).replace(/,/g, " ");
  const countOf = (n, one, many) => `${fmtN(n)} ${n > 1 ? many : one}`;
  const pct = (part, total) => (total ? `${Math.round((100 * part) / total)} %` : "0 %");
  const truncate = (str, max) => (max < 3 ? "" : str.length > max ? str.slice(0, max - 1) + "…" : str);
  const genreLabel = (g) => (DataLoader.GENRE_LABELS && DataLoader.GENRE_LABELS[g]) || g;
  const genreColor = (g) => DataLoader.genreColor(g);
  const featureMeans = (tracks) =>
    Object.fromEntries(FEATURES.map(([key]) => [key, d3.mean(tracks, (t) => toNumber(t.row[key])) ?? null]));

  function luminance(hex) {
    const c = d3.rgb(hex);
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }
  const textOn = (hex) => ((luminance(hex) + 0.05) / 0.05 >= 1.05 / (luminance(hex) + 0.05) ? "#0b0b0b" : "#ffffff");

  let frenchNames = null;
  try {
    frenchNames = new Intl.DisplayNames(["fr"], { type: "region" });
  } catch (e) {
    frenchNames = null;
  }

  function el(tag, cls, text, parent) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }

  function parseTrack(row) {
    const popularity = toNumber(row.popularity);
    if (!row.artist || !row.genre || !Number.isFinite(popularity)) return null;
    return {
      id: row.track_id,
      name: row.track_name,
      artist: row.artist,
      genre: row.genre,
      subgenre: row.subgenre,
      popularity,
      year: toNumber(row.year),
      row,
    };
  }

  function makeGroup(extra) {
    return { tracks: [], artists: new Map(), ...extra };
  }

  function addTrack(group, t) {
    group.tracks.push(t);
    let artist = group.artists.get(t.artist);
    if (!artist) {
      artist = { name: t.artist, tracks: [] };
      group.artists.set(t.artist, artist);
    }
    artist.tracks.push(t);
  }

  function finish(group) {
    group.count = group.tracks.length;
    group.popMean = d3.mean(group.tracks, (t) => t.popularity) ?? 0;
    group.genres = d3.rollup(group.tracks, (v) => v.length, (t) => t.genre);
    group.topGenre = d3.greatest(group.genres, ([, n]) => n)?.[0] ?? null;
    group.artistList = Array.from(group.artists.values(), (a) => {
      a.count = a.tracks.length;
      a.popMean = d3.mean(a.tracks, (t) => t.popularity);
      a.genres = d3.rollup(a.tracks, (v) => v.length, (t) => t.genre);
      a.topGenre = d3.greatest(a.genres, ([, n]) => n)[0];
      return a;
    }).sort((a, b) => d3.descending(a.count, b.count) || d3.ascending(a.name, b.name));
    return group;
  }

  function aggregate(tracks, enrichment, genre) {
    const countries = new Map();
    const unknown = makeGroup({ code: "unknown" });
    const pending = makeGroup({ code: "pending" });
    const all = makeGroup({ code: "all" });
    for (const t of tracks) {
      if (genre && t.genre !== genre) continue;
      addTrack(all, t);
      const code = enrichment.artists[t.artist];
      if (code === undefined) addTrack(pending, t);
      else if (!code) addTrack(unknown, t);
      else {
        if (!countries.has(code)) countries.set(code, makeGroup({ code }));
        addTrack(countries.get(code), t);
      }
    }
    const list = Array.from(countries.values(), finish).sort((a, b) => d3.descending(a.count, b.count));
    list.forEach((c, i) => (c.rank = i + 1));
    return { countries: list, byCode: new Map(list.map((c) => [c.code, c])), unknown: finish(unknown), pending: finish(pending), all: finish(all) };
  }

  function mainPolygon(feature) {
    const g = feature.geometry;
    if (!g || g.type !== "MultiPolygon") return feature;
    const parts = g.coordinates.map((coordinates) => ({ type: "Feature", geometry: { type: "Polygon", coordinates } }));
    return d3.greatest(parts, (p) => d3.geoArea(p));
  }

  function mount(container) {
    container.innerHTML = "";
    container.classList.add("cm-root");

    const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduceMotion ? 0 : DURATION;

    const state = { genre: null, country: null, artist: null, limit: LIST_STEP, transform: d3.zoomIdentity };
    let tracks = null;
    let enrichment = null;
    let world = null;
    let data = null;
    let geo = new Map();
    let busy = false;
    let pendingGenre;

    const filters = el("div", "cm-filters", null, container);
    el("span", "cm-filters-label", "Genre :", filters);
    const chips = el("div", "cm-chips", null, filters);
    chips.setAttribute("role", "group");
    chips.setAttribute("aria-label", "Filtrer par genre");
    const zoomBar = el("div", "cm-zoombar", null, filters);
    const zoomIn = el("button", "cm-btn", "+", zoomBar);
    zoomIn.type = "button";
    zoomIn.setAttribute("aria-label", "Zoomer");
    const zoomOutBtn = el("button", "cm-btn", "−", zoomBar);
    zoomOutBtn.type = "button";
    zoomOutBtn.setAttribute("aria-label", "Dézoomer");
    const zoomReset = el("button", "cm-btn", "Recentrer", zoomBar);
    zoomReset.type = "button";

    const navRow = el("div", "cm-navrow", null, container);
    const nav = el("nav", "cm-nav", null, navRow);
    nav.setAttribute("aria-label", "Niveau de zoom");
    const coverage = el("p", "cm-coverage", null, navRow);

    const scene = el("div", "cm-scene", null, container);
    const svgNode = d3.create("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("preserveAspectRatio", "xMidYMid meet")
      .attr("class", "cm-svg").attr("role", "group").node();
    scene.appendChild(svgNode);
    const svg = d3.select(svgNode);
    const gMap = svg.append("g");
    const gLand = gMap.append("g").attr("class", "cm-land");
    const gSymbols = gMap.append("g").attr("class", "cm-symbols");
    const gLabels = gMap.append("g").attr("class", "cm-labels").attr("aria-hidden", "true");
    const gBubbles = svg.append("g").attr("class", "cm-bubbles");
    const message = el("p", "cm-message", "Chargement des données…", scene);
    const detail = el("div", "cm-detail", null, scene);
    detail.hidden = true;
    const restBox = el("div", "cm-rest", null, scene);
    restBox.hidden = true;
    const tip = el("div", "cm-tip", null, scene);
    tip.hidden = true;

    const legend = el("div", "cm-legend", null, container);
    const aside = el("aside", "cm-aside", null, container);

    const projection = d3.geoNaturalEarth1();
    const path = d3.geoPath(projection);
    const radius = d3.scaleSqrt().range([0, MAX_RADIUS]);

    const zoom = d3.zoom()
      .scaleExtent([MIN_ZOOM, MAX_ZOOM])
      .translateExtent([[0, 0], [W, H]])
      .filter((event) => !state.country && (!event.button || event.type === "wheel"))
      .on("zoom", (event) => {
        gMap.attr("transform", event.transform);
        if (!state.country && !busy) {
          state.transform = event.transform;
          scaleSymbols(event.transform.k);
        }
      });
    svg.call(zoom).on("dblclick.zoom", null);

    zoomIn.addEventListener("click", () => svg.transition().duration(duration / 2).call(zoom.scaleBy, 1.6));
    zoomOutBtn.addEventListener("click", () => svg.transition().duration(duration / 2).call(zoom.scaleBy, 1 / 1.6));
    zoomReset.addEventListener("click", () => svg.transition().duration(duration).call(zoom.transform, d3.zoomIdentity));

    function countryName(code) {
      const info = (enrichment.countries || {})[code] || {};
      let name = null;
      if (frenchNames && info.a2) {
        try {
          name = frenchNames.of(info.a2);
        } catch (e) {
          name = null;
        }
      }
      return name || info.name || geo.get(code)?.feature.properties.name || code;
    }

    const regionOf = (code) => ((enrichment.countries || {})[code] || {}).region || "Autre";

    function showTip(event, html) {
      tip.innerHTML = html;
      tip.hidden = false;
      const box = scene.getBoundingClientRect();
      let x, y;
      if (event && event.clientX != null) {
        x = event.clientX - box.left;
        y = event.clientY - box.top;
      } else {
        const r = event.target.getBoundingClientRect();
        x = r.left + r.width / 2 - box.left;
        y = r.top - box.top;
      }
      const w = tip.offsetWidth, h = tip.offsetHeight;
      tip.style.left = `${Math.min(Math.max(8, x + 14), box.width - w - 8)}px`;
      tip.style.top = `${y + 14 + h > box.height ? Math.max(8, y - h - 10) : y + 14}px`;
    }
    const hideTip = () => (tip.hidden = true);

    function countryTip(c) {
      const share = c.genres.get(c.topGenre) || 0;
      return `<strong>${countryName(c.code)}</strong>` +
        `<span>${countOf(c.count, "titre", "titres")} · ${countOf(c.artistList.length, "artiste", "artistes")}</span>` +
        `<span>Popularité moyenne des titres : ${Math.round(c.popMean)}</span>` +
        (state.genre ? "" : `<span>Genre principal : ${genreLabel(c.topGenre)} (${pct(share, c.count)})</span>`);
    }

    function artistTip(a) {
      return `<strong>${a.name}</strong>` +
        `<span>${countOf(a.count, "titre", "titres")} · popularité moyenne ${Math.round(a.popMean)}</span>` +
        `<span>Genre principal : ${genreLabel(a.topGenre)}</span>`;
    }

    function onKey(handler) {
      return function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handler.apply(this, arguments);
        }
      };
    }

    function renderChips() {
      chips.innerHTML = "";
      const genres = DataLoader.GENRES.filter((g) => tracks.some((t) => t.genre === g));
      for (const g of [null, ...genres]) {
        const b = el("button", "cm-chip", g ? genreLabel(g) : "Tous", chips);
        b.type = "button";
        b.setAttribute("aria-pressed", String(state.genre === g));
        if (g) {
          const dot = el("span", "cm-dot", null);
          dot.style.background = genreColor(g);
          b.prepend(dot);
        }
        b.addEventListener("click", () => {
          selectGenre(g);
          if (window.Filters) Filters.set({ genre: g || "" });
          chips.querySelector('[aria-pressed="true"]')?.focus();
        });
      }
    }

    function selectGenre(g) {
      const genre = g && DataLoader.GENRES.includes(g) ? g : null;
      if (busy) {
        pendingGenre = genre;
        return;
      }
      pendingGenre = undefined;
      if (state.genre === genre) return;
      state.genre = genre;
      state.limit = LIST_STEP;
      refresh();
      renderChips();
    }

    function settle() {
      busy = false;
      if (pendingGenre !== undefined) selectGenre(pendingGenre);
    }

    function renderCoverage() {
      const total = data.all.count;
      const located = total - data.unknown.count - data.pending.count;
      let text = `Pays d'origine connu pour ${countOf(located, "titre", "titres")} sur ${fmtN(total)} (${pct(located, total)})`;
      if (data.pending.count) text += ` · enrichissement en cours : ${fmtN(enrichment.artists_queried)} artistes interrogés sur ${fmtN(enrichment.artists_total)}`;
      coverage.textContent = text;
    }

    function renderNav() {
      nav.innerHTML = "";
      const steps = [{ label: "Monde", go: () => leaveCountry() }];
      if (state.country) steps.push({ label: countryName(state.country), go: () => closeArtist() });
      if (state.artist) steps.push({ label: state.artist.name });
      steps.forEach((s, i) => {
        if (i) el("span", "cm-sep", "›", nav).setAttribute("aria-hidden", "true");
        const last = i === steps.length - 1;
        const b = el(last ? "span" : "button", last ? "cm-crumb cm-crumb-current" : "cm-crumb", s.label, nav);
        if (last) b.setAttribute("aria-current", "location");
        else {
          b.type = "button";
          b.addEventListener("click", s.go);
        }
      });
      zoomBar.hidden = !!state.country;
    }

    function renderLegend() {
      legend.innerHTML = "";
      if (state.country) {
        el("span", "cm-legend-title", "Couleur : genre principal de l'artiste · taille : nombre de titres", legend);
        return;
      }
      el("span", "cm-legend-title", "Taille du cercle : nombre de titres", legend);
      const max = radius.domain()[1];
      const values = [max, max / 4, max / 16].map((v) => (v >= 100 ? Math.round(v / 50) * 50 : Math.max(1, Math.round(v))));
      const size = el("span", "cm-legend-sizes", null, legend);
      const s = d3.select(size).append("svg").attr("width", MAX_RADIUS * 2 + 60).attr("height", MAX_RADIUS * 2 + 4)
        .attr("aria-hidden", "true");
      for (const v of values) {
        const r = radius(v);
        s.append("circle").attr("cx", MAX_RADIUS + 1).attr("cy", MAX_RADIUS * 2 + 2 - r).attr("r", r).attr("class", "cm-legend-circle");
        s.append("line").attr("x1", MAX_RADIUS + 1).attr("x2", MAX_RADIUS * 2 + 8)
          .attr("y1", MAX_RADIUS * 2 + 2 - 2 * r).attr("y2", MAX_RADIUS * 2 + 2 - 2 * r).attr("class", "cm-legend-tick");
        s.append("text").attr("x", MAX_RADIUS * 2 + 12).attr("y", MAX_RADIUS * 2 + 6 - 2 * r).text(fmtN(v));
      }
      el("span", "cm-legend-title", state.genre ? `Couleur : ${genreLabel(state.genre)}` : "Couleur : genre principal du pays", legend);
      if (!state.genre) {
        for (const g of DataLoader.GENRES) {
          const k = el("span", "cm-legend-key", null, legend);
          el("span", "cm-dot", null, k).style.background = genreColor(g);
          el("span", null, genreLabel(g), k);
        }
      }
    }

    function drawLand() {
      gLand.selectAll("path")
        .data(world.features, (f) => f.id)
        .join("path")
        .attr("d", path)
        .attr("class", (f) => `cm-country${data.byCode.has(f.id) ? " cm-country-data" : ""}`)
        .on("mouseenter", function (event, f) {
          const c = data.byCode.get(f.id);
          if (state.country || !c) return;
          showTip(event, countryTip(c));
        })
        .on("mousemove", function (event, f) {
          const c = data.byCode.get(f.id);
          if (state.country || !c) return;
          showTip(event, countryTip(c));
        })
        .on("mouseleave", hideTip)
        .on("click", (event, f) => {
          if (data.byCode.has(f.id) && !state.country) enterCountry(f.id);
        });
    }

    function drawSymbols() {
      const shown = data.countries.filter((c) => geo.has(c.code));
      radius.domain([0, d3.max(data.countries, (c) => c.count) || 1]);
      const ordered = shown.slice().sort((a, b) => d3.descending(a.count, b.count));

      gSymbols.selectAll("circle")
        .data(ordered, (c) => c.code)
        .join(
          (enter) => enter.append("circle").attr("r", 0),
          (update) => update.interrupt("exit").classed("cm-exit", false),
          (exit) => exit.classed("cm-exit", true).transition("exit").duration(duration / 2).attr("r", 0).remove()
        )
        .attr("class", "cm-symbol")
        .attr("cx", (c) => geo.get(c.code).anchor[0])
        .attr("cy", (c) => geo.get(c.code).anchor[1])
        .attr("fill", (c) => genreColor(state.genre || c.topGenre))
        .attr("tabindex", 0)
        .attr("role", "button")
        .attr("aria-label", (c) => `${countryName(c.code)} : ${countOf(c.count, "titre", "titres")}, ` +
          `${countOf(c.artistList.length, "artiste", "artistes")}, popularité moyenne ${Math.round(c.popMean)}. Entrée pour explorer.`)
        .on("mouseenter mousemove", (event, c) => showTip(event, countryTip(c)))
        .on("mouseleave", hideTip)
        .on("focus", (event, c) => showTip(event, countryTip(c)))
        .on("blur", hideTip)
        .on("click", (event, c) => enterCountry(c.code))
        .on("keydown", onKey((event, c) => enterCountry(c.code)))
        .order();

      gLabels.selectAll("text")
        .data(ordered, (c) => c.code)
        .join("text")
        .attr("class", "cm-label")
        .attr("x", (c) => geo.get(c.code).anchor[0])
        .text((c) => countryName(c.code));

      scaleSymbols(state.transform.k, true);
    }

    function scaleSymbols(k, animate) {
      const circles = gSymbols.selectAll("circle:not(.cm-exit)");
      (animate ? circles.transition().duration(duration) : circles)
        .attr("r", (c) => (state.country ? 0 : radius(c.count) / k));
      gLabels.selectAll("text")
        .attr("y", (c) => geo.get(c.code).anchor[1] + (radius(c.count) + 11) / k)
        .attr("font-size", 11 / k)
        .attr("stroke-width", 3 / k)
        .text((c) => (k >= 3 ? `${countryName(c.code)} · ${fmtN(c.count)}` : countryName(c.code)))
        .attr("display", (c) => (radius(c.count) >= (k >= 4 ? 0 : k >= 2 ? 5 : 16) ? null : "none"));
    }

    function countryTransform(code) {
      const [[x0, y0], [x1, y1]] = geo.get(code).bounds;
      const k = Math.min(MAX_ZOOM, 0.8 / Math.max((x1 - x0) / W, (y1 - y0) / H));
      return d3.zoomIdentity.translate(W / 2, H / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
    }

    function enterCountry(code) {
      if (busy) return;
      hideTip();
      const c = data.byCode.get(code);
      if (!c) return;
      busy = true;
      state.country = code;
      state.artist = null;
      state.limit = LIST_STEP;
      svgNode.classList.add("cm-zoomed");
      gSymbols.attr("aria-hidden", "true");
      gSymbols.selectAll("circle").attr("tabindex", -1);
      gLand.selectAll("path").classed("cm-country-focus", (f) => f.id === code);

      const g = geo.get(code);
      const target = g ? countryTransform(code) : d3.zoomIdentity;
      const origin = g ? target.apply(g.anchor) : [W / 2, H / 2];
      const t = svg.transition().duration(duration).call(zoom.transform, target);
      gSymbols.selectAll("circle").transition(t).attr("r", 0);
      gLabels.transition(t).attr("opacity", 0);
      drawBubbles(c, origin);
      renderNav();
      renderLegend();
      renderAside();
      t.end().catch(() => {}).then(() => {
        settle();
        aside.querySelector(".cm-aside-title")?.focus();
      });
    }

    function leaveCountry() {
      if (busy || !state.country) return;
      const code = state.country;
      hideTip();
      busy = true;
      closeArtist(true);
      const g = geo.get(code);
      const origin = g ? state.transform.apply(g.anchor) : [W / 2, H / 2];
      gBubbles.selectAll("g.cm-bubble").transition().duration(duration / 2)
        .attr("transform", `translate(${origin[0]},${origin[1]}) scale(0.01)`).remove();
      state.country = null;
      restBox.hidden = true;
      svgNode.classList.remove("cm-zoomed");
      gLand.selectAll("path").classed("cm-country-focus", false);
      const t = svg.transition().duration(duration).call(zoom.transform, state.transform);
      gSymbols.attr("aria-hidden", null);
      gSymbols.selectAll("circle").attr("tabindex", 0);
      gLabels.transition(t).attr("opacity", 1);
      scaleSymbols(state.transform.k, true);
      renderNav();
      renderLegend();
      renderAside();
      t.end().catch(() => {}).then(() => {
        settle();
        const back = gSymbols.selectAll("circle").filter((c) => c.code === code).node();
        if (back) back.focus();
      });
    }

    function drawBubbles(c, origin) {
      const top = c.artistList.slice(0, BUBBLES);
      const rest = c.artistList.slice(BUBBLES);
      const children = top.map((a) => ({ artist: a, value: a.count }));
      renderRest(c, top, rest);
      const size = Math.min(W, H - 56) * 0.96;
      const root = d3.pack().size([size, size]).padding(3)(d3.hierarchy({ children }).sum((d) => d.value || 0));
      const ox = (W - size) / 2, oy = (H - 46 - size) / 2;
      const nodes = root.leaves();

      const groups = gBubbles.selectAll("g.cm-bubble")
        .data(nodes, (d) => d.data.artist.name)
        .join((enter) => {
          const g = enter.append("g").attr("class", "cm-bubble")
            .attr("transform", `translate(${origin[0]},${origin[1]}) scale(0.01)`);
          g.append("circle");
          g.append("text").attr("class", "cm-bubble-name");
          g.append("text").attr("class", "cm-bubble-count");
          return g;
        });

      groups
        .attr("tabindex", 0)
        .attr("role", "button")
        .attr("aria-label", (d) => `${d.data.artist.name} : ${countOf(d.data.artist.count, "titre", "titres")}, ` +
          `genre principal ${genreLabel(d.data.artist.topGenre)}. Entrée pour voir le détail.`)
        .on("mouseenter mousemove focus", (event, d) => showTip(event, artistTip(d.data.artist)))
        .on("mouseleave blur", hideTip)
        .on("click", (event, d) => openArtist(d.data.artist))
        .on("keydown", onKey((event, d) => openArtist(d.data.artist)));

      groups.select("circle")
        .attr("r", (d) => d.r)
        .attr("fill", (d) => genreColor(d.data.artist.topGenre));
      groups.selectAll("text").attr("fill", (d) => textOn(genreColor(d.data.artist.topGenre)));
      groups.select(".cm-bubble-name")
        .attr("dy", (d) => (d.r >= 26 ? "-0.2em" : "0.35em"))
        .attr("font-size", (d) => Math.max(10, Math.min(14, d.r / 3)))
        .text((d) => (d.r >= 16 ? truncate(d.data.artist.name, Math.floor((d.r * 2) / 6.5)) : ""));
      groups.select(".cm-bubble-count")
        .attr("dy", "1.1em")
        .text((d) => (d.r >= 26 ? countOf(d.value, "titre", "titres") : ""));

      groups.transition().duration(duration).delay((d, i) => (reduceMotion ? 0 : Math.min(i * 6, 300)))
        .attr("transform", (d) => `translate(${ox + d.x},${oy + d.y})`);
    }

    function renderRest(c, top, rest) {
      restBox.innerHTML = "";
      restBox.hidden = !rest.length;
      if (!rest.length) return;
      const shown = d3.sum(top, (a) => a.count);
      el("span", null, `Bulles : les ${fmtN(top.length)} artistes les plus présents, ${pct(shown, c.count)} des titres du pays. ` +
        `${countOf(rest.length, "autre artiste", "autres artistes")} (${countOf(c.count - shown, "titre", "titres")}) dans la liste.`, restBox);
      const b = el("button", "cm-btn", "Voir toute la liste", restBox);
      b.type = "button";
      b.addEventListener("click", () => {
        state.limit = Infinity;
        renderAside();
        aside.querySelector(".cm-artist-list")?.focus();
      });
    }

    function profileRows(parent, values, reference, color) {
      parent.innerHTML = "";
      for (const [key, name] of FEATURES) {
        const row = el("div", "cm-prow", null, parent);
        el("span", "cm-prow-label", name, row);
        const track = el("span", "cm-prow-track", null, row);
        const fill = el("span", "cm-prow-fill", null, track);
        const value = values[key];
        const ref = reference[key];
        fill.style.width = `${(value ?? 0) * 100}%`;
        fill.style.background = color;
        if (ref != null) {
          const mark = el("span", "cm-prow-ref", null, track);
          mark.style.left = `${ref * 100}%`;
        }
        el("span", "cm-prow-value", value == null ? "n/d" : fmt2(value), row);
        row.setAttribute("aria-label", `${name} : ${value == null ? "non disponible" : fmt2(value)}` +
          (ref == null ? "" : `, moyenne du pays ${fmt2(ref)}`));
      }
    }

    function openArtist(artist) {
      if (busy) return;
      hideTip();
      state.artist = artist;
      const c = data.byCode.get(state.country);
      const color = genreColor(artist.topGenre);
      detail.innerHTML = "";
      detail.hidden = false;
      detail.style.borderTopColor = color;
      gBubbles.attr("aria-hidden", "true");
      svgNode.setAttribute("aria-hidden", "true");

      const head = el("header", "cm-detail-head", null, detail);
      const title = el("h2", "cm-detail-title", artist.name, head);
      title.tabIndex = -1;
      const genres = Array.from(artist.genres, ([g, n]) => `${genreLabel(g)} ${pct(n, artist.count)}`).join(", ");
      el("p", "cm-detail-sub", `${countryName(state.country)} · ${countOf(artist.count, "titre", "titres")} · ` +
        `popularité moyenne des titres ${Math.round(artist.popMean)} · ${genres}`, head);

      const body = el("div", "cm-detail-body", null, detail);
      const profile = el("section", null, null, body);
      const profileTitle = el("h3", null, null, profile);
      const rows = el("div", "cm-prow-list", null, profile);
      const note = el("p", "cm-prow-note", null, profile);
      el("span", "cm-note-mark", null, note);
      el("span", null, `moyenne des titres du pays (${countryName(state.country)})`, note);
      const reference = featureMeans(c.tracks);
      const own = featureMeans(artist.tracks);
      const hasFeatures = FEATURES.some(([key]) => own[key] != null);
      const show = (values, label) => {
        if (!hasFeatures) {
          profileTitle.textContent = "Profil audio indisponible";
          note.hidden = true;
          return;
        }
        profileTitle.textContent = label;
        profileRows(rows, values, reference, color);
      };
      const showOwn = () => show(own, "Profil audio moyen de l'artiste");
      showOwn();

      const list = el("section", null, null, body);
      el("h3", null, "Titres, du plus au moins populaire", list);
      const ol = el("ol", "cm-tracks", null, list);
      const sorted = artist.tracks.slice().sort((a, b) => b.popularity - a.popularity || d3.ascending(a.name, b.name));
      for (const t of sorted) {
        const li = el("li", "cm-track", null, ol);
        li.tabIndex = 0;
        li.setAttribute("aria-label", `${t.name}, ${genreLabel(t.genre)}, ${Number.isFinite(t.year) ? t.year : "année inconnue"}, popularité ${t.popularity}`);
        el("span", "cm-dot", null, li).style.background = genreColor(t.genre);
        el("span", "cm-track-name", t.name, li);
        el("span", "cm-track-year", Number.isFinite(t.year) ? String(t.year) : "", li);
        const bar = el("span", "cm-track-bar", null, li);
        el("span", "cm-track-fill", null, bar).style.width = `${t.popularity}%`;
        el("span", "cm-track-pop", String(t.popularity), li);
        const showTrack = () => show(featureMeans([t]), `Profil audio de « ${t.name} »`);
        li.addEventListener("mouseenter", showTrack);
        li.addEventListener("focus", showTrack);
        li.addEventListener("mouseleave", showOwn);
        li.addEventListener("blur", showOwn);
      }

      renderNav();
      title.focus();
    }

    function closeArtist(silent) {
      if (!state.artist) return;
      const name = state.artist.name;
      state.artist = null;
      detail.hidden = true;
      detail.innerHTML = "";
      gBubbles.attr("aria-hidden", null);
      svgNode.removeAttribute("aria-hidden");
      if (silent) return;
      renderNav();
      const back = gBubbles.selectAll("g.cm-bubble").filter((d) => d.data.artist && d.data.artist.name === name).node()
        || aside.querySelector(`[data-artist="${CSS.escape(name)}"]`);
      if (back) back.focus();
    }

    function barRow(parent, { label, value, max, text, color, onClick, title }) {
      const row = el(onClick ? "button" : "div", "cm-row", null, parent);
      if (onClick) {
        row.type = "button";
        row.addEventListener("click", onClick);
      }
      if (title) row.setAttribute("aria-label", title);
      el("span", "cm-row-label", label, row);
      const bar = el("span", "cm-row-bar", null, row);
      const fill = el("span", "cm-row-fill", null, bar);
      fill.style.width = `${max ? (100 * value) / max : 0}%`;
      if (color) fill.style.background = color;
      el("span", "cm-row-value", text, row);
      return row;
    }

    function renderAside() {
      aside.innerHTML = "";
      if (state.country) renderCountryAside();
      else renderWorldAside();
    }

    function renderWorldAside() {
      const title = el("h2", "cm-aside-title", state.genre ? `Pays d'origine · ${genreLabel(state.genre)}` : "Pays d'origine", aside);
      title.tabIndex = -1;
      el("p", "cm-aside-note", "Classement par nombre de titres, regroupé par région. Cliquer un pays pour zoomer.", aside);
      const max = data.countries[0]?.count || 1;
      const regions = d3.group(data.countries, (c) => regionOf(c.code));
      const order = REGION_ORDER.filter((r) => regions.has(r)).concat(Array.from(regions.keys()).filter((r) => !REGION_ORDER.includes(r)));
      const scroll = el("div", "cm-aside-scroll", null, aside);
      for (const region of order) {
        const list = regions.get(region);
        const total = d3.sum(list, (c) => c.count);
        const block = el("section", "cm-region", null, scroll);
        const h = el("h3", "cm-region-title", null, block);
        el("span", null, region, h);
        el("span", "cm-region-value", `${fmtN(total)} · ${pct(total, data.all.count)}`, h);
        for (const c of list) {
          const row = barRow(block, {
            label: countryName(c.code),
            value: c.count,
            max,
            text: fmtN(c.count),
            color: genreColor(state.genre || c.topGenre),
            onClick: () => enterCountry(c.code),
            title: `${countryName(c.code)} : ${countOf(c.count, "titre", "titres")}. Explorer.`,
          });
          if (!geo.has(c.code)) el("small", "cm-row-flag", "absent du fond de carte", row);
        }
      }
      const other = el("section", "cm-region", null, scroll);
      const h = el("h3", "cm-region-title", null, other);
      el("span", null, "Sans pays", h);
      for (const [group, label, help] of [
        [data.unknown, "Origine inconnue", "artistes non trouvés dans MusicBrainz ou sans pays renseigné"],
        [data.pending, "Pas encore interrogés", "enrichissement en cours"],
      ]) {
        if (!group.count) continue;
        const row = barRow(other, { label, value: group.count, max, text: fmtN(group.count), title: `${label} : ${countOf(group.count, "titre", "titres")}, ${help}` });
        row.classList.add("cm-row-none");
        el("small", "cm-row-flag", `${countOf(group.artistList.length, "artiste", "artistes")}, ${help}`, row);
      }
    }

    function renderCountryAside() {
      const c = data.byCode.get(state.country);
      const title = el("h2", "cm-aside-title", countryName(c.code), aside);
      title.tabIndex = -1;
      el("p", "cm-aside-note", `${regionOf(c.code)} · ${c.rank}${c.rank === 1 ? "er" : "e"} pays sur ${data.countries.length} par nombre de titres`, aside);
      const stats = el("div", "cm-stats", null, aside);
      for (const [value, label] of [
        [fmtN(c.count), c.count > 1 ? "titres" : "titre"],
        [fmtN(c.artistList.length), c.artistList.length > 1 ? "artistes" : "artiste"],
        [String(Math.round(c.popMean)), "popularité moyenne"],
      ]) {
        const s = el("div", "cm-stat", null, stats);
        el("strong", null, value, s);
        el("span", null, label, s);
      }

      if (!state.genre) {
        const genres = el("section", "cm-genres", null, aside);
        el("h3", null, "Répartition par genre", genres);
        const ref = data.all;
        for (const g of DataLoader.GENRES) {
          const n = c.genres.get(g) || 0;
          const share = n / c.count;
          const refShare = (ref.genres.get(g) || 0) / ref.count;
          const row = barRow(genres, {
            label: genreLabel(g),
            value: share,
            max: 1,
            text: pct(n, c.count),
            color: genreColor(g),
            title: `${genreLabel(g)} : ${pct(n, c.count)} des titres du pays, ${Math.round(refShare * 100)} % dans tout le catalogue`,
          });
          const mark = el("span", "cm-row-ref", null, row.querySelector(".cm-row-bar"));
          mark.style.left = `${refShare * 100}%`;
        }
        const note = el("p", "cm-prow-note", null, genres);
        el("span", "cm-note-mark", null, note);
        el("span", null, "part du genre dans tout le catalogue", note);
      }

      const section = el("section", "cm-artists", null, aside);
      el("h3", null, `Artistes (${fmtN(c.artistList.length)})`, section);
      const list = el("div", "cm-artist-list", null, section);
      list.tabIndex = -1;
      const shown = c.artistList.slice(0, state.limit);
      const max = c.artistList[0]?.count || 1;
      for (const a of shown) {
        const row = barRow(list, {
          label: a.name,
          value: a.count,
          max,
          text: fmtN(a.count),
          color: genreColor(a.topGenre),
          onClick: () => openArtist(a),
          title: `${a.name} : ${countOf(a.count, "titre", "titres")}. Voir le détail.`,
        });
        row.dataset.artist = a.name;
      }
      if (shown.length < c.artistList.length) {
        el("p", "cm-aside-note", `${fmtN(shown.length)} artistes affichés sur ${fmtN(c.artistList.length)}`, section);
        const more = el("div", "cm-more", null, section);
        const next = el("button", "cm-btn", `Afficher ${Math.min(LIST_STEP, c.artistList.length - shown.length)} de plus`, more);
        next.type = "button";
        next.addEventListener("click", () => {
          state.limit += LIST_STEP;
          renderAside();
          aside.querySelector(".cm-more .cm-btn")?.focus();
        });
        const all = el("button", "cm-btn", "Tout afficher", more);
        all.type = "button";
        all.addEventListener("click", () => {
          state.limit = Infinity;
          renderAside();
          aside.querySelector(".cm-artist-list")?.focus();
        });
      }
    }

    function refresh() {
      data = aggregate(tracks, enrichment, state.genre);
      renderCoverage();
      if (state.country && !data.byCode.has(state.country)) {
        state.artist = null;
        detail.hidden = true;
        state.country = null;
        restBox.hidden = true;
        svgNode.classList.remove("cm-zoomed");
        gBubbles.selectAll("*").remove();
        gLand.selectAll("path").classed("cm-country-focus", false);
        svg.transition().duration(duration).call(zoom.transform, state.transform);
        gSymbols.attr("aria-hidden", null);
        gLabels.attr("opacity", 1);
      }
      drawLand();
      drawSymbols();
      if (state.country) {
        gSymbols.selectAll("circle").attr("tabindex", -1);
        const c = data.byCode.get(state.country);
        const g = geo.get(state.country);
        drawBubbles(c, g ? countryTransform(state.country).apply(g.anchor) : [W / 2, H / 2]);
        if (state.artist) {
          const a = c.artists.get(state.artist.name);
          if (a) openArtist(a);
          else closeArtist(true);
        }
      }
      renderNav();
      renderLegend();
      renderAside();
    }

    function onKeydown(event) {
      if (event.key !== "Escape") return;
      if (state.artist) closeArtist();
      else if (state.country) leaveCountry();
      else return;
      event.preventDefault();
    }
    container.addEventListener("keydown", onKeydown);

    Promise.all([d3.json("data/world.geojson"), DataLoader.countries(), DataLoader.tracksClean()])
      .then(([w, e, rows]) => {
        if (!e || !e.artists) {
          message.textContent = "Le fichier countries.json n'a pas le bon format : lancer scripts/enrich_countries.py.";
          return;
        }
        world = w;
        enrichment = e;
        tracks = rows.map(parseTrack).filter(Boolean);
        projection.fitExtent([[8, 8], [W - 8, H - 8]], world);
        geo = new Map(world.features.map((f) => {
          const main = mainPolygon(f);
          return [f.id, { feature: f, anchor: path.centroid(main), bounds: path.bounds(main) }];
        }));
        message.remove();
        if (window.Filters) {
          state.genre = DataLoader.GENRES.includes(Filters.get().genre) ? Filters.get().genre : null;
          Filters.onChange((s) => selectGenre(s.genre));
        }
        renderChips();
        refresh();
      })
      .catch(() => {
        message.textContent = "Impossible de charger les données de la carte.";
      });

    function destroy() {
      container.removeEventListener("keydown", onKeydown);
      svg.interrupt().on(".zoom", null);
      container.innerHTML = "";
      container.classList.remove("cm-root");
    }

    return { destroy };
  }

  window.CarteView = { mount };
})();
