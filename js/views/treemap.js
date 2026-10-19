(function () {
  "use strict";

  const ARTIST_STEP = 30;
  const SUMMARY_ARTISTS = 5;
  const CONCENTRATION = 10;
  const HEADER = 22;
  const BLUE_RAMP = ["#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5",
    "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281", "#0d366b"];
  const POPULARITY_DOMAIN = [0, 100];

  const fmtN = (n) => d3.format(",")(n).replace(/,/g, " ");
  const truncate = (str, max) => (max < 3 ? "" : str.length > max ? str.slice(0, max - 1) + "…" : str);

  function el(tag, cls, text, parent) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }

  function aggregateArtist(artist, decades) {
    let count = 0, popSum = 0;
    for (const [dec, [n, pop]] of Object.entries(artist.dec)) {
      if (decades.size && !decades.has(+dec)) continue;
      count += n;
      popSum += pop;
    }
    return { name: artist.name, kind: "artist", count, popSum, dec: artist.dec };
  }

  function sumUp(node) {
    node.count = d3.sum(node.children, (c) => c.count);
    node.popSum = d3.sum(node.children, (c) => c.popSum);
    return node;
  }

  function prepare(raw, { decades = new Set() } = {}) {
    const genres = raw.children.map((g) => {
      const subgenres = g.children.map((s) => {
        const artists = s.children
          .map((a) => ({ ...aggregateArtist(a, decades), genre: g.name }))
          .filter((a) => a.count > 0)
          .sort((a, b) => d3.descending(a.count, b.count) || d3.ascending(a.name, b.name));
        return sumUp({ name: s.name, kind: "subgenre", genre: g.name, children: artists });
      }).filter((s) => s.count > 0);

      return sumUp({ name: g.name, kind: "genre", genre: g.name, children: subgenres });
    }).filter((g) => g.count > 0);

    return sumUp({ name: "Catalogue", kind: "root", children: genres });
  }

  const UNKNOWN_ARTIST = "(artiste inconnu)";

  function parseTrack(row) {
    return {
      id: row.track_id,
      name: row.track_name,
      artist: row.artist || UNKNOWN_ARTIST,
      genre: row.genre,
      subgenre: row.subgenre,
      popularity: +row.popularity,
      year: +row.year,
      decade: +row.decade,
      row,
    };
  }

  function artistFromTracks(name, genre, tracks) {
    const dec = {};
    for (const t of tracks) {
      const entry = dec[t.decade] || (dec[t.decade] = [0, 0]);
      entry[0] += 1;
      entry[1] += t.popularity;
    }
    return {
      name,
      kind: "artist",
      genre,
      count: tracks.length,
      popSum: d3.sum(tracks, (t) => t.popularity),
      dec,
      tracks,
    };
  }

  function prepareFromTracks(tracks, { decades = new Set(), minPopularity = 0 } = {}) {
    const kept = tracks.filter((t) => (!decades.size || decades.has(t.decade)) && t.popularity >= minPopularity);
    const grouped = d3.group(kept, (t) => t.genre, (t) => t.subgenre, (t) => t.artist);
    const genres = [...grouped].map(([genre, subs]) => {
      const subgenres = [...subs].map(([subgenre, artists]) => {
        const children = [...artists]
          .map(([name, list]) => artistFromTracks(name, genre, list))
          .sort((a, b) => d3.descending(a.count, b.count) || d3.ascending(a.name, b.name));
        return sumUp({ name: subgenre, kind: "subgenre", genre, children });
      });
      return sumUp({ name: genre, kind: "genre", genre, children: subgenres });
    });
    return sumUp({ name: "Catalogue", kind: "root", children: genres });
  }

  const popMean = (d) => (d.count ? d.popSum / d.count : null);

  function findByPath(tree, path) {
    let node = tree;
    for (const name of path) {
      node = (node.children || []).find((c) => c.name === name);
      if (!node) return null;
    }
    return node;
  }

  function display(node) {
    return {
      name: node.name,
      kind: node.kind,
      genre: node.genre,
      count: node.count,
      popSum: node.popSum,
      zoomable: Boolean(node.children && node.children.length),
    };
  }

  function summarize(sub, parent) {
    const artists = sub.children;
    return {
      share: parent.count ? sub.count / parent.count : 0,
      artists: artists.length,
      top: artists.slice(0, SUMMARY_ARTISTS).map((a) => ({ name: a.name, count: a.count })),
      concentration: artists.length > CONCENTRATION
        ? d3.sum(artists.slice(0, CONCENTRATION), (a) => a.count) / sub.count
        : null,
    };
  }

  function displayTree(focus, limit) {
    const kids = focus.children || [];
    if (focus.kind === "subgenre") {
      return { ...display(focus), children: kids.slice(0, limit).map(display) };
    }
    if (focus.kind === "genre") {
      return {
        ...display(focus),
        children: kids.map((s) => ({ ...display(s), summary: summarize(s, focus) })),
      };
    }
    return { ...display(focus), children: kids.map((g) => ({ ...display(g), children: g.children.map(display) })) };
  }

  function layout(data, width, height) {
    const root = d3.hierarchy(data)
      .sum((d) => (d.children ? 0 : d.count))
      .sort((a, b) => b.value - a.value || d3.ascending(a.data.name, b.data.name));

    d3.treemap()
      .tile(d3.treemapSquarify.ratio(1))
      .size([width, height])
      .paddingOuter((d) => (d.depth === 0 ? 0 : 3))
      .paddingTop((d) => (d.depth === 0 ? 0 : d.depth === 1 && d.children ? HEADER : 3))
      .paddingInner((d) => (d.depth === 0 ? 6 : 2))
      .round(true)(root);

    return root;
  }

  const DARK_TEXT = "#0b0b0b";
  const LIGHT_TEXT = "#ffffff";

  function luminance(color) {
    const { r, g, b } = d3.rgb(color);
    const channel = (v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  }

  function contrastRatio(a, b) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  }

  const textOn = (fill) => (contrastRatio(fill, DARK_TEXT) >= contrastRatio(fill, LIGHT_TEXT) ? DARK_TEXT : LIGHT_TEXT);
  const titlesRange = (min, max) => (min === max ? `${min} titre${min > 1 ? "s" : ""}` : `${min} à ${max} titres`);
  const labelOf = (d) => (d.data.kind === "genre" && DataLoader.GENRE_LABELS[d.data.name]) || d.data.name;
  const widthOf = (d) => Math.max(0, d.x1 - d.x0);
  const heightOf = (d) => Math.max(0, d.y1 - d.y0);

  function placeRect(sel, radius) {
    sel.attr("x", (d) => d.x0).attr("y", (d) => d.y0)
      .attr("width", widthOf).attr("height", heightOf)
      .attr("rx", radius);
  }

  const SEP = "\u0001";
  const DURATION = 750;
  const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const samePath = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  const isZoomable = (d) => Boolean(d.data.zoomable);
  const KIND_LABEL = { root: "catalogue", genre: "genre", subgenre: "sous-genre", artist: "artiste" };
  const CHILD_LABEL = { root: "Genres", genre: "Sous-genres", subgenre: "Principaux artistes" };
  const fmtPct = (v) => `${Math.round(v * 100)}\u00a0%`;
  const nameOf = (data) => (data.kind === "genre" && DataLoader.GENRE_LABELS[data.name]) || data.name;
  const box = (d) => ({ x: d.x0, y: d.y0, w: Math.max(1, d.x1 - d.x0), h: Math.max(1, d.y1 - d.y0) });

  function mount(container) {
    const state = {
      raw: null,
      focusPath: [],
      decades: new Set(),
      minPopularity: 0,
      selectedPath: null,
      limit: ARTIST_STEP,
      colorBy: "genre",
    };
    let prepared = null;
    let tracks = null;
    let currentTree = null;
    let busy = false;
    let renderPending = false;

    function requestRender(smooth = false) {
      if (busy) {
        renderPending = true;
        return;
      }
      render(null, smooth);
    }

    container.innerHTML = "";
    const root = el("div", "tm-root", null, container);
    const filters = el("div", "tm-filters", null, root);
    const nav = el("nav", "tm-nav", null, root);
    const scene = el("div", "tm-scene", null, root);
    const tailBar = el("div", "tm-tail", null, root);
    const aside = el("aside", "tm-aside", null, root);
    nav.setAttribute("aria-label", "Fil d'Ariane");

    const colorControl = el("div", "tm-control", null, filters);
    el("span", "tm-control-label", "Couleur", colorControl);
    const segment = el("div", "tm-seg", null, colorControl);
    segment.setAttribute("role", "group");
    segment.setAttribute("aria-label", "Ce que représente la couleur");
    const colorButtons = [["genre", "Genre"], ["popularity", "Popularité moyenne"]].map(([value, label]) => {
      const button = el("button", "tm-seg-btn", label, segment);
      button.type = "button";
      button.dataset.value = value;
      button.addEventListener("click", () => {
        if (state.colorBy === value) return;
        state.colorBy = value;
        syncColorButtons();
        hideTip();
        requestRender();
      });
      return button;
    });
    const decadeControl = el("div", "tm-control", null, filters);
    el("span", "tm-control-label", "Décennies", decadeControl);
    const chips = el("div", "tm-chips", null, decadeControl);
    chips.setAttribute("role", "group");
    chips.setAttribute("aria-label", "Filtrer par décennie");
    const popControl = el("div", "tm-control", null, filters);
    const popLabel = el("label", "tm-control-label", "Popularité min. des titres", popControl);
    const popInput = el("input", "tm-range", null, popControl);
    popInput.type = "range";
    popInput.min = 0;
    popInput.max = 100;
    popInput.step = 5;
    popInput.value = 0;
    popInput.id = `tm-pop-${Math.random().toString(36).slice(2, 8)}`;
    popLabel.htmlFor = popInput.id;
    popInput.disabled = true;
    const popValue = el("output", "tm-range-value", "chargement des titres…", popControl);

    let popFrame = 0;
    popInput.addEventListener("input", () => {
      state.minPopularity = +popInput.value;
      popValue.textContent = String(state.minPopularity);
      cancelAnimationFrame(popFrame);
      popFrame = requestAnimationFrame(() => update(true));
    });

    const legend = el("div", "tm-legend", null, filters);

    function decadeCounts(raw) {
      const counts = new Map();
      for (const g of raw.children) {
        for (const s of g.children) {
          for (const a of s.children) {
            for (const [dec, [n]] of Object.entries(a.dec)) counts.set(+dec, (counts.get(+dec) || 0) + n);
          }
        }
      }
      return [...counts].sort(([a], [b]) => a - b);
    }

    function renderChips() {
      chips.innerHTML = "";
      const all = el("button", "tm-chip", "Toutes", chips);
      all.type = "button";
      all.setAttribute("aria-pressed", String(state.decades.size === 0));
      all.addEventListener("click", () => setDecades(new Set()));

      for (const [dec, count] of decadeCounts(state.raw)) {
        const chip = el("button", "tm-chip", String(dec), chips);
        chip.type = "button";
        chip.title = `Années ${dec} : ${fmtN(count)} titres`;
        chip.setAttribute("aria-label", `Années ${dec}, ${fmtN(count)} titres`);
        chip.setAttribute("aria-pressed", String(state.decades.has(dec)));
        chip.addEventListener("click", () => {
          const next = new Set(state.decades);
          if (next.has(dec)) next.delete(dec);
          else next.add(dec);
          setDecades(next);
        });
      }
    }

    function setDecades(decades) {
      const focused = chips.contains(document.activeElement) ? document.activeElement.textContent : null;
      state.decades = decades;
      renderChips();
      if (focused) [...chips.children].find((b) => b.textContent === focused)?.focus();
      update(true);
    }

    function syncColorButtons() {
      colorButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.value === state.colorBy)));
    }
    syncColorButtons();

    let popScale = null;
    let theme = { dark: false, surface: "#fcfcfb", frame: "#f0efec" };
    const byPopularity = () => state.colorBy === "popularity";

    function readTheme() {
      const css = getComputedStyle(root);
      theme = {
        dark: css.colorScheme === "dark",
        surface: css.getPropertyValue("--surface").trim(),
        frame: css.getPropertyValue("--frame").trim(),
      };
    }

    const tint = (hue, amount) => d3.interpolateRgb(theme.surface, hue)(amount);
    const genreTint = (g, isGroup) => tint(DataLoader.genreColor(g), isGroup ? 0.22 : theme.dark ? 0.62 : 0.52);

    function paint(d) {
      if (!byPopularity()) return genreTint(d.data.genre || d.data.name, Boolean(d.children));
      const pop = popMean(d.data);
      return d.children || pop == null ? theme.frame : popScale(pop);
    }
    const ink = (d) => textOn(paint(d));

    function renderLegend() {
      legend.innerHTML = "";
      el("span", "tm-legend-key", "Aire : nombre de titres", legend);
      el("span", "tm-legend-key", "Couleur :", legend);
      if (byPopularity() && popScale) {
        const [lo, hi] = popScale.domain();
        el("span", null, "Popularité moyenne des titres", legend);
        const scale = el("span", "tm-scale", null, legend);
        el("span", "tm-legend-value", String(Math.round(lo)), scale);
        const ramp = el("span", "tm-ramp", null, scale);
        ramp.style.background = `linear-gradient(to right, ${d3.range(0, 1.01, 0.1).map((t) => popScale.interpolator()(t)).join(", ")})`;
        el("span", "tm-legend-value", String(Math.round(hi)), scale);
        return;
      }
      DataLoader.GENRES.forEach((g) => {
        const item = el("span", "tm-swatch-item", null, legend);
        const swatch = el("span", "tm-swatch", null, item);
        swatch.style.background = genreTint(g, false);
        swatch.style.boxShadow = `inset 3px 0 0 ${DataLoader.genreColor(g)}`;
        el("span", null, DataLoader.GENRE_LABELS[g] || g, item);
      });
    }
    const card = el("section", "tm-card", null, aside);
    card.setAttribute("aria-live", "polite");

    const svg = d3.select(scene).append("svg")
      .attr("class", "tm-svg")
      .attr("role", "group")
      .attr("aria-label", "Treemap du catalogue Spotify");
    const status = el("div", "tm-status", "Chargement des données…", scene);
    status.setAttribute("role", "status");
    const tip = el("div", "tm-tip", null, scene);
    tip.hidden = true;

    const pathOf = (d) => [...state.focusPath, ...d.ancestors().reverse().slice(1).map((n) => n.data.name)];
    const keyOf = (d) => pathOf(d).join(SEP);

    function showStatus(msg) {
      status.hidden = false;
      status.classList.remove("is-error");
      status.textContent = msg;
    }

    function update(smooth = false) {
      if (!state.raw) return;
      prepared = tracks ? prepareFromTracks(tracks, state) : prepare(state.raw, state);

      while (state.focusPath.length && !findByPath(prepared, state.focusPath)) {
        state.focusPath = state.focusPath.slice(0, -1);
      }
      if (state.selectedPath && !findByPath(prepared, state.selectedPath)) {
        state.selectedPath = null;
      }

      hideTip();
      renderNav();
      requestRender(smooth);
      renderCard();
    }

    function stats(path) {
      const node = findByPath(prepared, path);
      if (!node) return null;
      const parent = path.length ? findByPath(prepared, path.slice(0, -1)) : null;
      return {
        node,
        parent,
        share: parent && parent.count ? node.count / parent.count : null,
        pop: popMean(node),
      };
    }

    function showTip(event, d) {
      if (fillTip(d, "Cliquer")) placeTip(...d3.pointer(event, scene));
    }

    function showTipFor(d) {
      if (fillTip(d, "Entrée")) placeTip(d.x0 + 12, d.y0 + 28);
    }

    function fillTip(d, action) {
      tip.innerHTML = "";
      const info = stats(pathOf(d));
      if (!info) return false;
      const { node, parent, share, pop } = info;
      const head = el("div", "tm-tip-title", nameOf(node), tip);
      el("span", "tm-tip-kind", ` · ${KIND_LABEL[node.kind]}`, head);
      const parts = [`${fmtN(node.count)} titres`];
      if (share != null) parts.push(`${fmtPct(share)} de ${nameOf(parent)}`);
      el("div", null, parts.join(" · "), tip);
      if (pop != null) el("div", null, `Popularité moyenne des titres : ${Math.round(pop)}`, tip);
      el("div", "tm-tip-hint", `${action} pour ${isZoomable(d) ? "explorer" : "le détail"}`, tip);
      return true;
    }

    function placeTip(x, y) {
      tip.hidden = false;
      const { clientWidth: w, clientHeight: h } = scene;
      const left = x + 14 + tip.offsetWidth > w ? x - 14 - tip.offsetWidth : x + 14;
      const top = y + 14 + tip.offsetHeight > h ? y - 14 - tip.offsetHeight : y + 14;
      tip.style.left = `${Math.max(4, left)}px`;
      tip.style.top = `${Math.max(4, top)}px`;
    }

    function hideTip() {
      tip.hidden = true;
    }

    function select(path) {
      state.selectedPath = path;
      renderCard();
      highlight();
    }

    function highlight() {
      const key = state.selectedPath ? state.selectedPath.join(SEP) : null;
      svg.selectAll("g.tm-head, g.tm-cell").classed("is-selected", (d) => key !== null && keyOf(d) === key);
    }

    function rectFor(path) {
      if (!currentTree) return null;
      const node = currentTree.descendants().find((d) => d.depth > 0 && samePath(pathOf(d), path));
      return node ? box(node) : null;
    }

    function open(path) {
      const node = findByPath(prepared, path);
      if (!node) return;
      if (node.children && node.children.length) {
        zoomTo(path);
      } else {
        select(path);
      }
    }

    function barList(parent, rows, max, onClick) {
      const list = el("ul", "tm-bars", null, parent);
      rows.forEach((row) => {
        const li = el("li", null, null, list);
        const item = el(onClick ? "button" : "div", "tm-bar", null, li);
        if (onClick) {
          item.type = "button";
          item.addEventListener("click", () => onClick(row));
        }
        el("span", "tm-bar-label", row.label, item);
        el("span", "tm-bar-value", fmtN(row.value), item);
        const track = el("span", "tm-bar-track", null, item);
        const fill = el("span", "tm-bar-fill", null, track);
        fill.style.width = `${(row.value / max) * 100}%`;
        if (row.color) fill.style.background = row.color;
      });
    }

    function renderCard() {
      card.innerHTML = "";
      const path = state.selectedPath || state.focusPath;
      const info = prepared && stats(path);
      if (!info) {
        el("h2", null, "Détails", card);
        el("p", "tm-placeholder", "Survolez ou cliquez un rectangle.", card);
        return;
      }
      const { node, parent, share, pop } = info;

      if (node.kind !== "root") el("p", "tm-card-kind", KIND_LABEL[node.kind], card);
      el("h2", "tm-card-title", nameOf(node), card);

      const grid = el("dl", "tm-stats", null, card);
      const stat = (label, value) => {
        el("dt", null, label, grid);
        el("dd", null, value, grid);
      };
      stat("Titres", fmtN(node.count));
      if (share != null) stat(`Part de ${nameOf(parent)}`, fmtPct(share));
      if (pop != null) stat("Popularité moyenne des titres", String(Math.round(pop)));
      if (node.kind === "subgenre") {
        stat("Artistes", fmtN(node.children.length));
        if (node.children.length > CONCENTRATION) {
          const top = d3.sum(node.children.slice(0, CONCENTRATION), (a) => a.count);
          stat(`Part des ${CONCENTRATION} premiers`, fmtPct(top / node.count));
        }
      }

      const color = node.kind === "root" ? null : DataLoader.genreColor(node.genre);

      if (node.children && node.children.length) {
        const kids = node.children.slice()
          .sort((a, b) => b.count - a.count)
          .slice(0, 8);
        el("h3", null, CHILD_LABEL[node.kind], card);
        barList(card, kids.map((c) => ({
          label: nameOf(c),
          value: c.count,
          color: color || DataLoader.genreColor(c.name),
          path: [...path, c.name],
        })), kids[0] ? kids[0].count : 1, (row) => open(row.path));
      }

      if (node.kind === "artist") {
        const rows = Object.entries(node.dec || {})
          .filter(([dec]) => !state.decades.size || state.decades.has(+dec))
          .sort(([a], [b]) => a - b)
          .map(([dec, [n]]) => ({ label: `${dec}s`, value: n, color }));
        if (rows.length) {
          el("h3", null, "Titres par décennie", card);
          barList(card, rows, d3.max(rows, (r) => r.value));
        }
      }
    }

    function zoomTo(path, from) {
      if (busy || samePath(path, state.focusPath)) return;
      const start = from || rectFor(path) || { x: 0, y: 0, w: scene.clientWidth, h: scene.clientHeight };
      const active = document.activeElement;
      const keyboard = Boolean(active && root.contains(active) && active.matches(":focus-visible"));
      const previous = state.focusPath;
      state.focusPath = path;
      state.selectedPath = null;
      state.limit = ARTIST_STEP;
      hideTip();
      renderNav();
      renderCard();
      render(path.length > previous.length ? { dir: "in", from: start, keyboard } : { dir: "out", previous, keyboard });
    }

    function zoomOut() {
      if (state.focusPath.length) zoomTo(state.focusPath.slice(0, -1));
    }

    function renderNav() {
      nav.innerHTML = "";
      const up = el("button", "tm-up", "↑ Remonter", nav);
      up.type = "button";
      up.title = "Remonter d'un niveau (Échap)";
      up.setAttribute("aria-label", "Remonter d'un niveau");
      up.disabled = state.focusPath.length === 0;
      up.addEventListener("click", zoomOut);

      const crumbs = ["Catalogue", ...state.focusPath.map((name, i) =>
        (i === 0 && DataLoader.GENRE_LABELS[name]) || name)];
      crumbs.forEach((label, i) => {
        if (i > 0) el("span", "tm-sep", "›", nav);
        if (i === crumbs.length - 1) {
          el("span", "tm-crumb is-current", label, nav).setAttribute("aria-current", "location");
        } else {
          const b = el("button", "tm-crumb", label, nav);
          b.type = "button";
          b.addEventListener("click", () => zoomTo(state.focusPath.slice(0, i)));
        }
      });
    }

    function render(anim, smooth = false) {
      const width = scene.clientWidth, height = scene.clientHeight;
      if (!prepared || !width || !height) return;

      const focus = findByPath(prepared, state.focusPath) || prepared;
      if (!focus.count) {
        svg.selectAll("g.tm-layer").remove();
        tailBar.hidden = true;
        showStatus("Aucun titre ne correspond aux filtres.");
        return;
      }
      status.hidden = true;

      const tree = layout(displayTree(focus, state.limit), width, height);
      currentTree = tree;
      readTheme();
      const ramp = theme.dark ? [...BLUE_RAMP].reverse() : BLUE_RAMP;
      popScale = d3.scaleSequential(d3.interpolateRgbBasis(ramp)).domain(POPULARITY_DOMAIN).clamp(true);
      renderLegend();
      renderTail(focus);
      svg.attr("viewBox", [0, 0, width, height]).attr("width", width).attr("height", height);

      const old = svg.select("g.tm-layer");
      const layer = anim || old.empty() ? svg.append("g").attr("class", "tm-layer") : old;
      draw(layer, tree, smooth && !anim);
      highlight();
      if (anim && !old.empty()) animate(old, layer, anim, tree, width, height);
      else svg.selectAll("g.tm-layer").filter(function () { return this !== layer.node(); }).remove();
    }

    function animate(old, layer, anim, tree, width, height) {
      const fit = (b) => `translate(${b.x},${b.y}) scale(${b.w / width},${b.h / height})`;
      const expand = (b) => `scale(${width / b.w},${height / b.h}) translate(${-b.x},${-b.y})`;
      const identity = "translate(0,0) scale(1,1)";

      let target;
      if (anim.dir === "in") {
        target = anim.from;
      } else {
        const rel = anim.previous.slice(state.focusPath.length, state.focusPath.length + 2);
        const node = tree.descendants().find((d) => d.depth > 0 && samePath(pathOf(d), [...state.focusPath, ...rel]))
          || tree.descendants().find((d) => d.depth === 1 && d.data.name === rel[0]);
        target = node ? box(node) : { x: 0, y: 0, w: width, h: height };
      }

      const zoomIn = anim.dir === "in";
      const duration = reducedMotion() ? 0 : DURATION;
      busy = duration > 0;
      layer.raise()
        .attr("transform", zoomIn ? fit(target) : expand(target))
        .attr("opacity", zoomIn ? 1 : 0);
      if (!zoomIn) old.raise();
      old.attr("pointer-events", "none").attr("aria-hidden", "true");
      old.selectAll("[tabindex]").attr("tabindex", null);

      const t = svg.transition().duration(duration).ease(d3.easeCubicInOut);
      layer.transition(t).attr("transform", identity).attr("opacity", 1);
      old.transition(t)
        .attr("transform", zoomIn ? expand(target) : fit(target))
        .attr("opacity", 0)
        .remove();
      t.end().catch(() => {}).then(() => {
        if (destroyed) return;
        busy = false;
        layer.attr("transform", null);
        if (anim.keyboard) restoreFocus(layer, anim);
        if (renderPending) {
          renderPending = false;
          render();
        }
      });
    }

    function renderTail(focus) {
      tailBar.innerHTML = "";
      const artists = focus.kind === "subgenre" ? focus.children : [];
      tailBar.hidden = artists.length === 0;
      if (!artists.length) return;

      const shown = artists.slice(0, state.limit);
      const rest = artists.slice(state.limit);
      const text = el("p", "tm-tail-text", null, tailBar);
      if (!rest.length) {
        el("strong", null, `${fmtN(artists.length)} artistes affichés`, text);
        el("span", null, ". L'aire de chaque rectangle correspond à son nombre de titres.", text);
        return;
      }

      const shownCount = d3.sum(shown, (a) => a.count);
      const restCount = d3.sum(rest, (a) => a.count);
      const range = titlesRange(d3.min(rest, (a) => a.count), d3.max(rest, (a) => a.count));
      el("strong", null, `${shown.length} artistes affichés sur ${fmtN(artists.length)}`, text);
      el("span", null, `, soit ${fmtPct(shownCount / focus.count)} des titres du sous-genre. ` +
        `La taille des rectangles est calculée entre ces ${shown.length} artistes. ` +
        `Les ${fmtN(rest.length)} autres ont ${range} chacun (${fmtN(restCount)} titres).`, text);

      const actions = el("div", "tm-tail-actions", null, tailBar);
      const showMore = (limit) => {
        state.limit = limit;
        hideTip();
        requestRender();
      };
      const more = el("button", "tm-more", `Afficher ${Math.min(ARTIST_STEP, rest.length)} de plus`, actions);
      more.type = "button";
      more.addEventListener("click", () => showMore(state.limit + ARTIST_STEP));
      const all = el("button", "tm-more", `Tout afficher (${fmtN(artists.length)})`, actions);
      all.type = "button";
      all.addEventListener("click", () => showMore(Infinity));
    }

    function activate(d) {
      if (isZoomable(d)) zoomTo(pathOf(d), box(d));
      else select(pathOf(d));
    }

    function summaryRows(d) {
      const s = d.data.summary;
      if (!s || widthOf(d) < 110) return [];
      const rows = [
        { key: "meta", type: "meta", order: 0, priority: 0, text: `${fmtPct(s.share)} du genre · ${fmtN(s.artists)} artistes` },
        ...s.top.map((a, i) => ({
          key: `artist-${i}`, type: "artist", order: 1 + i, priority: i < 3 ? 1 + i : 6 + i,
          text: a.name, value: fmtN(a.count),
        })),
        { key: "hint", type: "hint", order: 9, priority: 4, text: `Explorer les ${fmtN(s.artists)} artistes →` },
      ];
      if (s.concentration != null) {
        rows.push({ key: "top", type: "meta", order: 8, priority: 5,
          text: `${CONCENTRATION} premiers : ${fmtPct(s.concentration)} des titres` });
      }
      const max = Math.max(0, Math.floor((heightOf(d) - 36) / 18));
      return rows
        .sort((a, b) => a.priority - b.priority)
        .slice(0, max)
        .sort((a, b) => a.order - b.order)
        .map((r, i) => ({ ...r, i }));
    }

    function restoreFocus(layer, anim) {
      const items = layer.selectAll("g.tm-head, g.tm-cell");
      let target = null;
      if (anim.dir === "out") {
        const back = anim.previous.slice(0, state.focusPath.length + 2);
        target = items.filter((d) => samePath(pathOf(d), back)).node()
          || items.filter((d) => samePath(pathOf(d), back.slice(0, -1))).node();
      }
      target = target || items.node();
      if (target) target.focus({ preventScroll: true });
    }

    function ariaLabel(d) {
      const kind = KIND_LABEL[d.data.kind];
      const action = isZoomable(d) ? "Entrée pour explorer" : "Entrée pour le détail";
      return `${labelOf(d)}, ${kind}, ${fmtN(d.value)} titres. ${action}.`;
    }

    function makeAccessible(selection) {
      selection
        .attr("tabindex", 0)
        .attr("role", "button")
        .attr("aria-label", ariaLabel)
        .on("keydown", (event, d) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          event.stopPropagation();
          activate(d);
        })
        .on("focus", function (event, d) {
          if (this.matches(":focus-visible")) showTipFor(d);
        })
        .on("blur", hideTip);
    }

    function draw(layer, tree, smooth) {
      const move = (sel) => (smooth ? sel.transition().duration(450).ease(d3.easeCubicOut) : sel);
      const groups = layer.selectAll("g.tm-group")
        .data(tree.children || [], keyOf)
        .join((enter) => {
          const g = enter.append("g").attr("class", "tm-group");
          const head = g.append("g").attr("class", "tm-head");
          head.append("rect").attr("class", "tm-frame");
          head.append("text").attr("class", "tm-group-label");
          return g;
        })
        .classed("is-zoomable", isZoomable)
        .classed("is-leaf", (d) => !d.children)
        .attr("role", (d) => (d.children ? "group" : null))
        .attr("aria-label", (d) => (d.children ? labelOf(d) : null));

      groups.select(".tm-head")
        .on("mousemove", showTip)
        .on("mouseleave", hideTip)
        .on("click", (event, d) => activate(d))
        .call(makeAccessible);

      move(groups.select(".tm-frame"))
        .call(placeRect, 4)
        .attr("fill", paint);

      groups.classed("has-summary", (d) => Boolean(d.data.summary));

      groups.select(".tm-group-label")
        .attr("fill", (d) => (d.children ? "var(--text)" : ink(d)))
        .text((d) => truncate(`${labelOf(d)} · ${fmtN(d.value)}`, Math.floor((widthOf(d) - 12) / 7)));
      move(groups.select(".tm-group-label"))
        .attr("x", (d) => d.x0 + (d.data.summary ? 8 : 6))
        .attr("y", (d) => d.y0 + (d.children ? HEADER / 2 + 4 : d.data.summary ? 22 : 16));

      groups.each(function (d) {
        const rows = summaryRows(d);
        const color = ink(d);
        const y = (r) => d.y0 + 44 + r.i * 18;
        const g = d3.select(this);
        g.selectAll("text.tm-row")
          .data(rows, (r) => r.key)
          .join("text")
          .attr("class", (r) => `tm-row is-${r.type}`)
          .attr("x", d.x0 + 8)
          .attr("y", y)
          .attr("fill", color)
          .text((r) => truncate(r.text, Math.floor((widthOf(d) - (r.value ? 56 : 16)) / 6.6)));
        g.selectAll("text.tm-row-value")
          .data(rows.filter((r) => r.value), (r) => r.key)
          .join("text")
          .attr("class", "tm-row-value")
          .attr("x", d.x1 - 8)
          .attr("y", y)
          .attr("fill", color)
          .text((r) => r.value);
      });

      groups.each(function (parent) {
        const cells = d3.select(this).selectAll("g.tm-cell")
          .data(parent.children || [], keyOf)
          .join((enter) => {
            const c = enter.append("g").attr("class", "tm-cell");
            c.append("rect");
            c.append("text").attr("class", "tm-name");
            c.append("text").attr("class", "tm-count");
            return c;
          })
          .classed("is-zoomable", isZoomable)
          .on("mousemove", (event, d) => {
            event.stopPropagation();
            showTip(event, d);
          })
          .on("click", (event, d) => {
            event.stopPropagation();
            activate(d);
          })
          .call(makeAccessible);

        move(cells.select("rect"))
          .call(placeRect, 2)
          .attr("fill", paint);

        cells.select(".tm-name")
          .attr("fill", ink)
          .text((d) => (heightOf(d) >= 20 ? truncate(labelOf(d), Math.floor((widthOf(d) - 10) / 7)) : ""));
        move(cells.select(".tm-name")).attr("x", (d) => d.x0 + 5).attr("y", (d) => d.y0 + 15);

        cells.select(".tm-count")
          .attr("fill", ink)
          .text((d) => (heightOf(d) >= 36 && widthOf(d) >= 60 ? `${fmtN(d.value)} titres` : ""));
        move(cells.select(".tm-count")).attr("x", (d) => d.x0 + 5).attr("y", (d) => d.y0 + 29);
      });
    }

    function onKeydown(event) {
      if (event.key === "Escape") zoomOut();
    }
    document.addEventListener("keydown", onKeydown);

    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (busy) {
        renderPending = true;
        return;
      }
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => render());
    });
    observer.observe(scene);

    function showLoadError(err) {
      console.error(err);
      status.hidden = false;
      status.classList.add("is-error");
      status.innerHTML = "";
      el("strong", null, "Impossible de charger ou de préparer les données.", status);
      el("span", null, "Le détail de l'erreur est dans la console du navigateur.", status);
    }

    let destroyed = false;
    DataLoader.hierarchy()
      .then((raw) => {
        if (destroyed) return;
        state.raw = raw;
        renderChips();
        update();
        loadTracks();
      })
      .catch((err) => {
        if (!destroyed) showLoadError(err);
      });

    function loadTracks() {
      DataLoader.tracksClean()
        .then((rows) => {
          if (destroyed) return;
          tracks = rows.map(parseTrack);
          popInput.disabled = false;
          popValue.textContent = String(state.minPopularity);
          update();
        })
        .catch((err) => {
          console.error(err);
          if (!destroyed) popValue.textContent = "titres indisponibles";
        });
    }

    function destroy() {
      destroyed = true;
      observer.disconnect();
      cancelAnimationFrame(frame);
      cancelAnimationFrame(popFrame);
      document.removeEventListener("keydown", onKeydown);
      svg.interrupt();
      svg.selectAll("*").interrupt();
      container.innerHTML = "";
    }

    return { state, update, render, zoomTo, destroy };
  }

  window.TreemapView = { mount, prepare, prepareFromTracks, parseTrack, popMean };
})();
