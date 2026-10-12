import DataLoader from "../core/DataLoader.js";


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

        this.genres = [...new Set(this.data.map(d => d.genre))];

        this.selectedGenres = new Set(
            data.map(d => d.genre)
        );

        this.colorScale = d3.scaleOrdinal()
            .domain([...new Set(data.map(d => d.genre))])
            .range(d3.schemeTableau10);


        this.subGenresByGenre = d3.nest()
            .key(d => d.genre)
            .rollup(values => [...new Set(values.map(d => d.subgenre))])
            .object(this.data);

        this.selectedSubGenres = new Set(
            data.map(d => d.subgenre)
        );

        const popularityValues = this.data
            .map(d => +d.popularity)
            .filter(Number.isFinite);
        this.popularityBounds = d3.extent(popularityValues);
        this.popularityRange = [...this.popularityBounds];

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

        // Jauges de sélection de la popularité
        const popularityControls = container.append("div")
            .attr("class", "popularity-controls")
            .style("display", "flex")
            .style("flex-direction", "column")
            .style("gap", "4px")
            .style("margin-bottom", "15px");

        popularityControls.append("span")
            .attr("class", "popularity-label");

        const popularitySliders = popularityControls.append("div")
            .style("display", "flex")
            .style("gap", "10px")
            .style("align-items", "center");

        popularitySliders.append("span")
            .text("Min");

        popularitySliders.append("input")
            .attr("class", "popularity-min")
            .attr("type", "range")
            .attr("min", this.popularityBounds[0])
            .attr("max", this.popularityBounds[1])
            .attr("value", this.popularityRange[0])
            .on("input", () => {
                const value = +d3.event.target.value;
                this.popularityRange[0] = Math.min(value, this.popularityRange[1]);
                this.syncPopularityControls();
                this.render();
            });

        popularitySliders.append("span")
            .text("Max");

        popularitySliders.append("input")
            .attr("class", "popularity-max")
            .attr("type", "range")
            .attr("min", this.popularityBounds[0])
            .attr("max", this.popularityBounds[1])
            .attr("value", this.popularityRange[1])
            .on("input", () => {
                const value = +d3.event.target.value;
                this.popularityRange[1] = Math.max(value, this.popularityRange[0]);
                this.syncPopularityControls();
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
            .text(genre => genre);


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

        this.syncPopularityControls();
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

    syncPopularityControls() {
        const [minPopularity, maxPopularity] = this.popularityRange;
        const popularityControls = d3.select(this.containerSelector)
            .select(".popularity-controls");

        popularityControls.select(".popularity-min")
            .property("value", minPopularity);
        popularityControls.select(".popularity-max")
            .property("value", maxPopularity);
        popularityControls.select(".popularity-label")
            .text(`Popularité : ${minPopularity} - ${maxPopularity}`);
    }


    calcutateAverageByGenre() {
        // Remplacer d3.group par un regroupement classique
        const groups = d3.nest()
            .key(d => d.genre)
            .entries(this.data.filter(d =>
                this.selectedSubGenres.has(d.subgenre) &&
                this.isPopularityInRange(d)
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

    isPopularityInRange(track) {
        const popularity = +track.popularity;
        return Number.isFinite(popularity) &&
            popularity >= this.popularityRange[0] &&
            popularity <= this.popularityRange[1];
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


        let displayedData = this.mode === 'average'
            ? this.calcutateAverageByGenre()
            : this.data;

        displayedData = displayedData.filter(d =>
            this.selectedGenres.has(d.genre) &&
            (this.mode === "average" ||
                (this.selectedSubGenres.has(d.subgenre) && this.isPopularityInRange(d)))
        );


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
            .attr('opacity', this.mode === 'average' ? 1 : 0.08);

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
        }

        // 5. Redessiner les axes existants sans en créer de nouveaux
        axisGroup.each((dim, i, nodes) => {
            d3.select(nodes[i])
                .call(d3.axisLeft(this.yScales[dim]));
        });
    }
}