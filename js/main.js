import {ParallelCoordinates} from "./views/parallels_coords.js";

async function init() {
    // 1. Chargement des données
    const data = await d3.csv("data/derived/tracks_clean.csv");

    // 2. Définition des dimensions à afficher
    const characteristics = ['popularity', 'danceability', 'energy', 'valence', 'acousticness', 'speechiness', 'instrumentalness', 'liveness'];

    // 3. Création de l'instance de ParallelCoordinates
    const parallelCoords = new ParallelCoordinates('#parallel-coords-chart', data, characteristics);
}

init();