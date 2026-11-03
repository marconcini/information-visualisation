# Spotify · Information Visualization

Visualisations interactives en **D3.js** à partir du dataset **« 30000 Spotify Songs »**
([Kaggle](https://www.kaggle.com/datasets/joebeachcapital/30000-spotify-songs)).
Un même dataset, **4 visualisations coordonnées** (+ 1 bonus).

Le **rapport** du projet (utilisateurs, données et pipeline, approche, une page par visualisation) est dans [`docs/`](docs/README.md).

## Structure

```
data/
  raw/spotify_songs.csv        dataset brut
  derived/                     datasets générés par le pipeline
    tracks_clean.csv   (D0)    titres nettoyés + variables calculées
    tracks_features.csv(D1)    features normalisées 0-1 (multivarié)
    hierarchy.json     (D2)    genre → sous-genre → artiste
    trends.json        (D3)    décennie × genre × feature moyenne
    correlation.json   (D4)    matrice de corrélation (heatmap)
    countries.json     (D5)    artiste → pays d'origine (MusicBrainz)
  samples/                     extraits CSV à charger dans la treemap
  world.geojson                fond de carte (pays, codes ISO alpha-3)
scripts/
  pipeline.ipynb               notebook de transformation des données
  enrich_countries.py          enrichissement artiste → pays (MusicBrainz)
js/
  DataLoader.js    accès unique aux données dérivées (partagé par les vues)
  filters.js       état commun : filtre par genre + thème, synchronisé entre les vues
  index.js         hub : onglets, cartes, barre de filtre genre + bouton thème
  main.js          point d'entrée des coordonnées parallèles
  heatmap/heatmap.js
  courbes/courbes.js
  views/           treemap.js · parallels_coords.js · carte.js
css/
  index.css        hub
  treemap.css      treemap
  carte.css        carte
index.html         hub (un onglet par vue)
heatmap.html · treemap.html · courbes.html · coord-para.html · carte.html
```

## Pipeline de transformation (étape 1)

Les données brutes sont transformées en datasets dérivés par
[`scripts/pipeline.ipynb`](scripts/pipeline.ipynb) — chaque étape lit un dataset et
en produit un nouveau (nettoyage → normalisation → hiérarchie → agrégats →
corrélation). Le pays d'origine vient d'un script à part (voir plus bas).

```bash
pip install pandas numpy jupyter
cd scripts
jupyter notebook pipeline.ipynb      # exécuter toutes les cellules
```

Les fichiers de `data/derived/` sont régénérés dans ce dossier.

### Enrichissement : pays d'origine des artistes

Le dataset ne contient pas de pays. `scripts/enrich_countries.py` interroge
MusicBrainz pour chacun des 10 692 artistes (une requête par seconde, environ 3 h,
reprise possible grâce au cache) et écrit `data/derived/countries.json`.
« Pays d'origine » = pays de l'artiste, ou du groupe, renseigné dans MusicBrainz.
Ce n'est pas le pays d'écoute. Quand MusicBrainz ne donne qu'une ville, on remonte
jusqu'au pays (Londres → Angleterre → Royaume-Uni).

Résultat : 7 973 artistes sur 10 692 ont un pays, soit 85 % des titres. Les autres
ne sont pas retirés : la carte les compte dans un bloc « Sans pays ».

```bash
python scripts/enrich_countries.py
```

## Les visualisations (étape 2)

Chaque vue réalise la **dernière transformation** : le *mapping* des données
dérivées vers les **variables visuelles** de la technique.

| Vue | Dataset | Membre |
|---|---|---|
| Coordonnées parallèles | `tracks_features.csv` | Adrien |
| Treemap zoomable | `hierarchy.json` + `tracks_clean.csv` | Arij |
| Courbes multiples | `trends.json` + `tracks_clean.csv` | Amir |
| Heatmap de corrélation | `correlation.json` + `tracks_features.csv` | Maud |
| Carte des pays d'origine (bonus) | `countries.json` + `tracks_clean.csv` | Maud, Arij |

## État commun (« un seul système »)

Les vues partagent un même état via [`js/filters.js`](js/filters.js) (mémorisé dans
`localStorage`, synchronisé entre les cadres) :

- **Filtre par genre** — posé dans le hub *ou* dans une vue, il s'applique à **toutes**
  les vues et reste actif quand on change d'onglet (*brushing & linking*). Chaque vue
  l'interprète à sa manière : la heatmap recalcule sa matrice, le treemap zoome sur le
  genre, les courbes l'isolent, les coordonnées parallèles le sélectionnent, la carte
  ne garde que les titres de ce genre.
- **Thème** (auto / clair / sombre) — appliqué à toutes les vues depuis le hub.

Le **genre** est le seul filtre commun à toutes les techniques ; les autres contrôles
(décennie, popularité, feature, sous-genre…) restent **propres à chaque vue**, car ils
n'ont pas de sens partagé (p. ex. isoler une seule décennie viderait les courbes).

## Lancer l'application

```bash
python3 -m http.server 8000
```
puis ouvrir <http://localhost:8000> (serveur nécessaire pour charger les données).

`index.html` rassemble les visualisations : un onglet par vue, chacune affichée
dans un cadre à partir de sa propre page (`treemap.html`, `heatmap.html`, …).
Une page pas encore fusionnée dans `main` est signalée « à venir » et apparaît
automatiquement dès qu'elle est présente.

Pour ajouter ou renommer une visualisation, modifier uniquement la liste `VISUS`
en haut de [`js/index.js`](js/index.js) (fichier, titre, membre, données, tâches).
