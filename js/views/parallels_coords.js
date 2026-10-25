export class ParallelCoordinates {
    /**
     * @param {string} containerSelector - Ex: '#parallel-coords'
     * @param {Array} data - Les données Spotify
     * @param {Array<string>} characteristics - Liste des variables à afficher (ex: ['danceability', 'energy', 'tempo'])
     */
    constructor(containerSelector, data, characteristics) {
        this.containerSelector = containerSelector;
        this.data = data;
        this.characteristics = characteristics;

        this.margin = { top: 30, right: 40, bottom: 20, left: 40 };
        this.width = 800 - this.margin.left - this.margin.right;
        this.height = 400 - this.margin.top - this.margin.bottom;

        this.modes = [
            { value: "average", label: "Moyenne par genre" },
            { value: "individual", label: "Musiques individuelles" }
        ];

        this.mode = 'average'; // Mode par défaut : moyenne par genre

        this.genres = DataLoader.GENRES.filter(genre =>
            this.data.some(d => d.genre === genre)
        );

        this.selectedGenres = new Set(
            this.genres
        );

        this.colorScale = d3.scaleOrdinal()
            .domain(DataLoader.GENRES)
            .range(d3.schemeTableau10);


        this.subGenresByGenre = d3.nest()
            .key(d => d.genre)
            .rollup(values => [...new Set(values.map(d => d.subgenre))])
            .object(this.data);

        this.selectedSubGenres = new Set(
            data.map(d => d.subgenre)
        );

        this.brushRanges = {};
        this.artistSearch = "";

        this.init();
    }

    init() {
        console.log("Initialisation du graphique de coordonnées parallèles");

        // 1. Nettoyage et création du SVG
        d3.select(this.containerSelector).html('');

        this.svg = d3.select(this.containerSelector)
            .append('svg')
            .attr('viewBox', `0 0 ${this.width + this.margin.left + this.margin.right} ${this.height + this.margin.top + this.margin.bottom}`)
            .append('g')
            .attr('transform', `translate(${this.margin.left},${this.margin.top})`);

        // 2. Échelle X : Répartition des axes verticaux
        this.xScale = d3.scalePoint()
            .range([0, this.width])
            .padding(1)
            .domain(this.characteristics);

        // 3. Échelles Y : Une échelle propre à chaque dimension
        this.yScales = {};
        this.characteristics.forEach(dim => {
            this.yScales[dim] = d3.scaleLinear()
                .domain(d3.extent(this.data, d => +d[dim]))
                .range([this.height, 0]);
        });





        const container = d3.select(this.containerSelector);

        this.tooltip = container.append("div")
            .attr("class", "parallel-coordinates-tooltip")
            .style("display", "none")
            .style("position", "fixed")
            .style("pointer-events", "none")
            .style("z-index", "10")
            .style("min-width", "190px")
            .style("max-width", "280px")
            .style("padding", "12px 14px")
            .style("background", "#ffffff")
            .style("color", "#273142")
            .style("border", "1px solid #e2e8f0")
            .style("border-left", "4px solid #64748b")
            .style("border-radius", "8px")
            .style("box-shadow", "0 8px 24px rgba(15, 23, 42, 0.18)")
            .style("font-family", "Arial, sans-serif")
            .style("font-size", "12px")
            .style("line-height", "1.4");


        // Sélecteur du mode d'affichage
        const modeControls = container.append("div")
            .attr("class", "mode-controls")
            .style("display", "flex")
            .style("gap", "10px")
            .style("margin-bottom", "10px");

        this.modes.forEach(mode => {
            const label = modeControls.append("label")
                .style("display", "inline-flex")
                .style("align-items", "center")
                .style("gap", "5px")
                .style("cursor", "pointer");

            label.append("input")
                .attr("type", "radio")
                .attr("name", "parallel-coordinates-mode")
                .attr("value", mode.value)
                .property("checked", mode.value === this.mode)
                .on("change", () => {
                    this.mode = d3.event.target.value;

                    if (this.mode === "individual") {
                        this.ensureSingleGenre();
                        this.ensureSingleSubGenre();
                        this.syncGenreCheckboxes();
                        this.syncSubGenreCheckboxes();
                    }

                    this.render();
                });

            label.append("span")
                .text(mode.label);
        });

        // Recherche d'un artiste
        const artistControls = container.append("div")
            .attr("class", "artist-search-controls")
            .style("display", "flex")
            .style("gap", "8px")
            .style("align-items", "center")
            .style("margin-bottom", "15px");

        artistControls.append("label")
            .attr("for", "parallel-coordinates-artist-search")
            .text("Artiste");

        artistControls.append("input")
            .attr("id", "parallel-coordinates-artist-search")
            .attr("class", "artist-search")
            .attr("type", "search")
            .attr("placeholder", "Rechercher un artiste")
            .on("input", () => {
                this.artistSearch = d3.event.target.value.trim();
                this.render();
            });

        // Conteneur de la légende
        this.legend = container.append("div")
            .attr("class", "genre-legend")
            .style("display", "flex")
            .style("flex-wrap", "wrap")
            .style("gap", "10px")
            .style("margin-bottom", "15px");

        // Une case à cocher par genre
        const genreItems = this.legend.selectAll(".genre-item")
            .data(this.genres)
            .enter()
            .append("label")
            .attr("class", "genre-item")
            .style("display", "inline-flex")
            .style("align-items", "center")
            .style("gap", "5px")
            .style("cursor", "pointer");

        genreItems.append("input")
            .attr("type", "checkbox")
            .property("checked", true)
            .on("change", genre => {
                const checked = d3.event.target.checked;

                if (this.mode === "individual") {
                    if (checked) {
                        this.selectedGenres = new Set([genre]);
                    } else {
                        this.selectedGenres.add(genre);
                    }
                } else {
                    if (checked) {
                        this.selectedGenres.add(genre);
                    } else {
                        this.selectedGenres.delete(genre);
                    }
                }

                if (this.mode === "individual") {
                    this.ensureSingleGenre();
                    this.ensureSingleSubGenre();
                }

                this.syncGenreCheckboxes();
                this.syncSubGenreCheckboxes();
                this.render();
            });

        genreItems.append("span")
            .style("color", genre => DataLoader.genreColor(genre))
            .style("font-weight", "bold")
            .text(genre => DataLoader.GENRE_LABELS[genre] || genre);


        // Une case à cocher par sous-genre, regroupée par genre
        const subGenreGroups = this.legend.selectAll(".subgenre-group")
            .data(this.genres)
            .enter()
            .append("div")
            .attr("class", "subgenre-group")
            .style("display", genre => this.selectedGenres.has(genre) ? "flex" : "none")
            .style("flex-direction", "column")
            .style("gap", "4px")
            .style("margin-left", "15px")
            .style("width", "100%");

        subGenreGroups.append("span")
            .attr("class", "subgenre-group-title")
            .style("font-weight", "bold")
            .text(genre => genre);

        subGenreGroups.each((genre, i, nodes) => {
            const group = d3.select(nodes[i]);
            const subgenres = this.subGenresByGenre[genre] || [];

            const subGenreItems = group.selectAll(".subgenre-item")
                .data(subgenres)
                .enter()
                .append("label")
                .attr("class", "subgenre-item")
                .style("display", "inline-flex")
                .style("align-items", "center")
                .style("gap", "5px")
                .style("cursor", "pointer");

            subGenreItems.append("input")
                .attr("type", "checkbox")
                .property("checked", subgenre => this.selectedSubGenres.has(subgenre))
                .on("change", subgenre => {
                    const checked = d3.event.target.checked;

                    if (this.mode === "individual") {
                        this.selectedSubGenres = checked
                            ? new Set([subgenre])
                            : this.selectedSubGenres;
                    } else if (checked) {
                        this.selectedSubGenres.add(subgenre);
                    } else {
                        this.selectedSubGenres.delete(subgenre);
                    }

                    this.syncSubGenreCheckboxes();
                    this.render();
                });

            subGenreItems.append("span")
                .text(subgenre => subgenre);
        });

        this.render();
    }

    ensureSingleGenre() {
        const selectedGenre = this.genres.find(genre => this.selectedGenres.has(genre));
        this.selectedGenres = new Set(selectedGenre ? [selectedGenre] : [this.genres[0]]);
    }

    ensureSingleSubGenre() {
        const selectedGenre = this.genres.find(genre => this.selectedGenres.has(genre));
        const subgenres = this.subGenresByGenre[selectedGenre] || [];
        const selectedSubGenre = subgenres.find(subgenre => this.selectedSubGenres.has(subgenre));

        this.selectedSubGenres = new Set(
            selectedSubGenre ? [selectedSubGenre] : subgenres.slice(0, 1)
        );
    }

    syncGenreCheckboxes() {
        this.legend.selectAll(".genre-item input")
            .property("checked", genre => this.selectedGenres.has(genre));

        this.legend.selectAll(".subgenre-group")
            .style("display", genre => this.selectedGenres.has(genre) ? "flex" : "none");
    }

    syncSubGenreCheckboxes() {
        this.legend.selectAll(".subgenre-item input")
            .property("checked", subgenre => this.selectedSubGenres.has(subgenre));
    }

    calcutateAverageByGenre() {
        // Remplacer d3.group par un regroupement classique
        const groups = d3.nest()
            .key(d => d.genre)
            .entries(this.data.filter(d =>
                this.selectedSubGenres.has(d.subgenre) &&
                this.matchesArtist(d)
            ));

        return groups.map(group => {
            const genre = group.key;
            const songs = group.values;
            const average = { 'genre': genre };

            this.characteristics.forEach(dim => {
                const values = songs
                    .map(d => +d[dim])
                    .filter(Number.isFinite);

                average[dim] = values.length
                    ? d3.mean(values)
                    : NaN;
            });

            return average;
        });
    }

    isWithinBrushes(track) {
        return this.characteristics.every(dim => {
            const range = this.brushRanges[dim];
            const value = +track[dim];

            return !range ||
                (Number.isFinite(value) &&
                    value >= range[0] &&
                    value <= range[1]);
        });
    }

    matchesArtist(track) {
        return !this.artistSearch ||
            String(track.artist || "")
                .toLocaleLowerCase()
                .includes(this.artistSearch.toLocaleLowerCase());
    }

    path(d) {
        // Crée un chemin pour une chanson donnée
        return d3.line()(
            this.characteristics.map(dim => [
                this.xScale(dim),
                this.yScales[dim](+d[dim])
            ])
        );
    }

    render() {
        // Ne garder que les genres sélectionnés
        this.hideTooltip();


        let displayedData = this.mode === 'average'
            ? this.calcutateAverageByGenre()
            : this.data;

        displayedData = displayedData.filter(d =>
            this.selectedGenres.has(d.genre) &&
            (this.mode === "average" ||
                (this.selectedSubGenres.has(d.subgenre) &&
                    this.isWithinBrushes(d) &&
                    this.matchesArtist(d)))
        );

        if (this.mode === "average") {
            displayedData = displayedData.filter(d => this.isWithinBrushes(d));
        }


        // 3. Créer le groupe des lignes une seule fois
        let linesGroup = this.svg.select('.lines');

        if (linesGroup.empty()) {
            linesGroup = this.svg.append('g')
                .attr('class', 'lines');
        }

        // Supprimer les anciennes lignes avant de dessiner les nouvelles
        linesGroup.selectAll('path').remove();

        this.lines = linesGroup
            .selectAll('path')
            .data(displayedData)
            .enter()
            .append('path')
            .attr('d', d => this.path(d))
            .attr('fill', 'none')
            .attr('stroke', d => DataLoader.genreColor(d.genre))
            .attr('stroke-width', this.mode === 'average' ? 3 : 1.5)
            .attr('opacity', this.mode === 'average' ? 1 : 0.08)
            .on("mouseover", d => this.showTooltip(d, d3.event))
            .on("mousemove", () => this.positionTooltip(d3.event))
            .on("mouseout", () => this.hideTooltip());

        // 4. Créer les axes une seule fois
        let axisGroup = this.svg.selectAll('.dimension-axis');

        if (axisGroup.empty()) {
            axisGroup = this.svg
                .selectAll('.dimension-axis')
                .data(this.characteristics)
                .enter()
                .append('g')
                .attr('class', 'dimension-axis')
                .attr('transform', dim =>
                    `translate(${this.xScale(dim)}, 0)`
                );

            // Ajouter les titres une seule fois
            axisGroup.append('text')
                .attr('class', 'dimension-label')
                .style('text-anchor', 'middle')
                .attr('y', -10)
                .text(dim => dim)
                .style('fill', '#333')
                .style('font-weight', 'bold')
                .style('font-size', '12px');

            axisGroup.append("g")
                .attr("class", "brush")
                .each((dim, i, nodes) => {
                    const brush = d3.brushY()
                        .extent([[-12, 0], [12, this.height]])
                        .on("brush", () => {
                            const selection = d3.event.selection;

                            if (!selection) {
                                delete this.brushRanges[dim];
                            } else {
                                this.brushRanges[dim] = [
                                    this.yScales[dim].invert(selection[1]),
                                    this.yScales[dim].invert(selection[0])
                                ];
                            }

                            this.render();
                        });

                    d3.select(nodes[i])
                        .datum(dim)
                        .call(brush);
                });
        }

        // 5. Redessiner les axes existants sans en créer de nouveaux
        axisGroup.each((dim, i, nodes) => {
            d3.select(nodes[i])
                .call(d3.axisLeft(this.yScales[dim]));

        });
    }

    showTooltip(track, event) {
        this.clearHighlightedLine();
        this.highlightedLine = d3.select(event.currentTarget);
        this.highlightedLine
            .attr("stroke-width", this.mode === "average" ? 5 : 3)
            .attr("opacity", 1)
            .style("filter", "drop-shadow(0 0 3px rgba(15, 23, 42, 0.45))");

        this.tooltip
            .style("border-left-color", DataLoader.genreColor(track.genre))
            .style("display", "block");

        this.tooltip.selectAll("*").remove();

        const title = this.mode === "individual"
            ? track.track_name || "Titre inconnu"
            : `Moyenne - ${track.genre || "Genre inconnu"}`;

        this.tooltip.append("div")
            .style("margin-bottom", "8px")
            .style("color", DataLoader.genreColor(track.genre))
            .style("font-size", "14px")
            .style("font-weight", "bold")
            .style("line-height", "1.25")
            .text(title);

        const rows = this.mode === "individual"
            ? [
                ["Artiste", track.artist || "Inconnu"],
                ["Genre", track.genre || "Inconnu"],
                ["Sous-genre", track.subgenre || "Inconnu"],
                ["Popularité", track.popularity ?? "Inconnue"]
            ]
            : [["Caractéristiques", "Moyenne du genre"]];

        rows.forEach(([label, value]) => {
            const row = this.tooltip.append("div")
                .style("display", "flex")
                .style("justify-content", "space-between")
                .style("gap", "16px")
                .style("padding", "3px 0")
                .style("border-top", "1px solid #f1f5f9");

            row.append("span")
                .style("color", "#64748b")
                .text(`${label} :`);
            row.append("span")
                .style("font-weight", "600")
                .style("text-align", "right")
                .text(value);
        });

        this.positionTooltip(event);
    }

    positionTooltip(event) {
        if (this.tooltip.style("display") === "none") {
            return;
        }

        const tooltipNode = this.tooltip.node();
        const offset = 14;
        const left = Math.min(
            event.clientX + offset,
            window.innerWidth - tooltipNode.offsetWidth - offset
        );
        const top = Math.min(
            event.clientY + offset,
            window.innerHeight - tooltipNode.offsetHeight - offset
        );

        this.tooltip
            .style("left", `${Math.max(offset, left)}px`)
            .style("top", `${Math.max(offset, top)}px`);
    }

    hideTooltip() {
        this.clearHighlightedLine();
        this.tooltip.style("display", "none");
    }

    clearHighlightedLine() {
        if (!this.highlightedLine || this.highlightedLine.empty()) {
            return;
        }

        this.highlightedLine
            .attr("stroke-width", this.mode === "average" ? 3 : 1.5)
            .attr("opacity", this.mode === "average" ? 1 : 0.08)
            .style("filter", null);
        this.highlightedLine = null;
    }
}