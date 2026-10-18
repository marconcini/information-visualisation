(function () {
  "use strict";

  const TOP_ARTISTS = 60;
  const HEADER = 22;

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
    if (!artist.dec) return { name: artist.name, kind: "artist", count: artist.value || 0, popSum: 0, dec: {} };
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

  function prepare(raw, { decades = new Set(), minPopularity = 0, topN = TOP_ARTISTS } = {}) {
    const genres = raw.children.map((g) => {
      const subgenres = g.children.map((s) => {
        const artists = s.children
          .map((a) => ({ ...aggregateArtist(a, decades), genre: g.name }))
          .filter((a) => a.count > 0 && a.popSum / a.count >= minPopularity)
          .sort((a, b) => d3.descending(a.count, b.count) || d3.ascending(a.name, b.name));

        const kept = artists.slice(0, topN);
        const rest = artists.slice(topN);
        if (rest.length) {
          kept.push({
            name: `Autres (${rest.length} artistes)`,
            kind: "other",
            genre: g.name,
            artists: rest.length,
            count: d3.sum(rest, (a) => a.count),
            popSum: d3.sum(rest, (a) => a.popSum),
          });
        }
        return sumUp({ name: s.name, kind: "subgenre", genre: g.name, children: kept });
      }).filter((s) => s.count > 0);

      return sumUp({ name: g.name, kind: "genre", genre: g.name, children: subgenres });
    }).filter((g) => g.count > 0);

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

  const OTHER_FILL = "#a8a7a1";
  const isOther = (d) => d.data.kind === "other";

  function layout(data, width, height, sizeBy) {
    const root = d3.hierarchy(data)
      .sum((d) => (d.children ? 0 : sizeBy === "popularity" ? d.popSum : d.count))
      .sort((a, b) => isOther(a) - isOther(b) || b.value - a.value || d3.ascending(a.data.name, b.data.name));

    d3.treemap()
      .tile(d3.treemapSquarify.ratio(1))
      .size([width, height])
      .paddingOuter((d) => (d.depth === 0 ? 0 : 3))
      .paddingTop((d) => (d.depth === 0 ? 0 : d.depth === 1 && d.children ? HEADER : 3))
      .paddingInner((d) => (d.depth === 0 ? 6 : 2))
      .round(true)(root);

    return root;
  }

  const fillOf = (d) => (isOther(d) ? OTHER_FILL : DataLoader.genreColor(d.data.genre || d.data.name));
  const textOn = (fill) => (d3.lab(fill).l > 62 ? "#0b0b0b" : "#ffffff");
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
  const isZoomable = (d) => Boolean(d.children) && !isOther(d);
  const KIND_LABEL = { root: "catalogue", genre: "genre", subgenre: "sous-genre", artist: "artiste", other: "regroupement" };
  const CHILD_LABEL = { root: "Genres", genre: "Sous-genres", subgenre: "Principaux artistes" };
  const fmtPct = d3.format(".0%");
  const nameOf = (data) => (data.kind === "genre" && DataLoader.GENRE_LABELS[data.name]) || data.name;
  const box = (d) => ({ x: d.x0, y: d.y0, w: Math.max(1, d.x1 - d.x0), h: Math.max(1, d.y1 - d.y0) });

  function mount(container) {
    const state = {
      raw: null,
      focusPath: [],
      sizeBy: "count",
      decades: new Set(),
      minPopularity: 0,
      selectedPath: null,
    };
    let prepared = null;
    let currentTree = null;
    let busy = false;

    container.innerHTML = "";
    const root = el("div", "tm-root", null, container);
    const filters = el("div", "tm-filters", null, root);
    const nav = el("nav", "tm-nav", null, root);
    const scene = el("div", "tm-scene", null, root);
    const aside = el("aside", "tm-aside", null, root);
    nav.setAttribute("aria-label", "Fil d'Ariane");

    el("span", "tm-placeholder", "Filtres", filters);
    const card = el("section", "tm-card", null, aside);
    card.setAttribute("aria-live", "polite");

    const svg = d3.select(scene).append("svg")
      .attr("class", "tm-svg")
      .attr("role", "img")
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

    function update() {
      prepared = prepare(state.raw, state);
      renderNav();
      render();
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
      const info = stats(pathOf(d));
      if (!info) return;
      const { node, parent, share, pop } = info;
      tip.innerHTML = "";
      const head = el("div", "tm-tip-title", nameOf(node), tip);
      el("span", "tm-tip-kind", ` · ${KIND_LABEL[node.kind]}`, head);
      const parts = [`${fmtN(node.count)} titres`];
      if (share != null) parts.push(`${fmtPct(share)} de ${nameOf(parent)}`);
      el("div", null, parts.join(" · "), tip);
      if (node.kind === "other") el("div", null, `${fmtN(node.artists)} artistes avec peu de titres`, tip);
      if (pop != null) el("div", null, `Popularité moyenne : ${Math.round(pop)}`, tip);
      el("div", "tm-tip-hint", isZoomable(d) ? "Cliquer pour explorer" : "Cliquer pour le détail", tip);

      tip.hidden = false;
      const [x, y] = d3.pointer(event, scene);
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
      svg.selectAll("g.tm-group, g.tm-cell").classed("is-selected", (d) => key !== null && keyOf(d) === key);
    }

    function rectFor(path) {
      if (!currentTree) return null;
      const node = currentTree.descendants().find((d) => d.depth > 0 && samePath(pathOf(d), path));
      return node ? box(node) : null;
    }

    function open(path) {
      const node = findByPath(prepared, path);
      if (!node) return;
      if (node.children && node.kind !== "other") {
        zoomTo(path, rectFor(path) || { x: 0, y: 0, w: scene.clientWidth, h: scene.clientHeight });
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
      if (pop != null) stat("Popularité moyenne", String(Math.round(pop)));
      if (node.kind === "other") stat("Artistes regroupés", fmtN(node.artists));

      const color = node.kind === "root" ? null : DataLoader.genreColor(node.genre);

      if (node.children && node.kind !== "other") {
        const kids = node.children.filter((c) => c.kind !== "other")
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
      const previous = state.focusPath;
      state.focusPath = path;
      state.selectedPath = null;
      hideTip();
      renderNav();
      renderCard();
      render(path.length > previous.length ? { dir: "in", from } : { dir: "out", previous });
    }

    function zoomOut() {
      if (state.focusPath.length) zoomTo(state.focusPath.slice(0, -1));
    }

    function renderNav() {
      nav.innerHTML = "";
      const up = el("button", "tm-up", "↑", nav);
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

    function render(anim) {
      const width = scene.clientWidth, height = scene.clientHeight;
      if (!prepared || !width || !height) return;

      const focus = findByPath(prepared, state.focusPath);
      if (!focus) {
        state.focusPath = [];
        renderNav();
        return render();
      }
      if (!focus.count) {
        svg.selectAll("*").remove();
        showStatus("Aucun titre ne correspond aux filtres.");
        return;
      }
      status.hidden = true;

      const tree = layout(focus, width, height, state.sizeBy);
      currentTree = tree;
      svg.attr("viewBox", [0, 0, width, height]).attr("width", width).attr("height", height);

      const old = svg.select("g.tm-layer");
      const layer = anim || old.empty() ? svg.append("g").attr("class", "tm-layer") : old;
      draw(layer, tree);
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

      const t = svg.transition().duration(duration).ease(d3.easeCubicInOut);
      layer.transition(t).attr("transform", identity).attr("opacity", 1);
      old.transition(t)
        .attr("transform", zoomIn ? expand(target) : fit(target))
        .attr("opacity", 0)
        .remove();
      t.end().catch(() => {}).then(() => {
        busy = false;
        layer.attr("transform", null);
      });
    }

    function draw(layer, tree) {
      const groups = layer.selectAll("g.tm-group")
        .data(tree.children || [], keyOf)
        .join((enter) => {
          const g = enter.append("g").attr("class", "tm-group");
          g.append("rect").attr("class", "tm-frame");
          g.append("text").attr("class", "tm-group-label");
          return g;
        })
        .classed("is-zoomable", isZoomable)
        .classed("is-leaf", (d) => !d.children)
        .on("mousemove", showTip)
        .on("mouseleave", hideTip)
        .on("click", (event, d) => {
          if (isZoomable(d)) zoomTo(pathOf(d), box(d));
          else select(pathOf(d));
        });

      groups.select(".tm-frame")
        .call(placeRect, 4)
        .attr("fill", fillOf)
        .attr("fill-opacity", (d) => (d.children ? 0.22 : 1))
        .classed("is-other", isOther);

      groups.select(".tm-group-label")
        .attr("x", (d) => d.x0 + 6)
        .attr("y", (d) => d.y0 + (d.children ? HEADER / 2 + 4 : 16))
        .attr("fill", (d) => (d.children ? "var(--text)" : textOn(fillOf(d))))
        .text((d) => truncate(`${labelOf(d)} · ${fmtN(d.value)}`, Math.floor((widthOf(d) - 12) / 7)));

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
            if (isZoomable(d)) zoomTo(pathOf(d), box(d));
            else select(pathOf(d));
          });

        cells.select("rect")
          .call(placeRect, 2)
          .attr("fill", fillOf)
          .classed("is-other", isOther);

        cells.select(".tm-name")
          .attr("x", (d) => d.x0 + 5).attr("y", (d) => d.y0 + 15)
          .attr("fill", (d) => textOn(fillOf(d)))
          .text((d) => (heightOf(d) >= 20 ? truncate(labelOf(d), Math.floor((widthOf(d) - 10) / 7)) : ""));

        cells.select(".tm-count")
          .attr("x", (d) => d.x0 + 5).attr("y", (d) => d.y0 + 29)
          .attr("fill", (d) => textOn(fillOf(d)))
          .text((d) => (heightOf(d) >= 36 && widthOf(d) >= 60 ? `${fmtN(d.value)} titres` : ""));
      });
    }

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && root.isConnected) zoomOut();
    });

    let frame = 0;
    new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => render());
    }).observe(scene);

    DataLoader.hierarchy()
      .then((raw) => {
        state.raw = raw;
        update();
      })
      .catch((err) => {
        console.error(err);
        status.classList.add("is-error");
        status.innerHTML = "";
        el("strong", null, "Impossible de charger les données.", status);
        const hint = el("span", null, "Lancez un serveur local à la racine du projet : ", status);
        el("code", null, "python -m http.server 8000", hint);
      });

    return { state, update, render, zoomTo };
  }

  window.TreemapView = { mount, prepare, popMean };
})();
