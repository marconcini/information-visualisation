# Spotify · Information Visualization

Visualisations interactives en **D3.js** à partir du dataset **« 30000 Spotify Songs »**
([Kaggle](https://www.kaggle.com/datasets/joebeachcapital/30000-spotify-songs)).
Un même dataset, **4 visualisations coordonnées** (+ 1 bonus).

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
scripts/
  pipeline.ipynb               notebook de transformation des données
  enrich_countries.py          enrichissement artiste → pays (MusicBrainz)
js/
  core/   dataLoader · store · utils · config
  views/  parallelCoords · treemap · lines · heatmap · carte
  main.js
css/style.css
index.html
```

## Pipeline de transformation (étape 1)

Les données brutes sont transformées en datasets dérivés par
[`scripts/pipeline.ipynb`](scripts/pipeline.ipynb) — chaque étape lit un dataset et
en produit un nouveau (nettoyage → normalisation → hiérarchie → agrégats →
corrélation → pays).

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
Ce n'est pas le pays d'écoute.

```bash
python scripts/enrich_countries.py
```

## Les visualisations (étape 2)

Chaque vue réalise la **dernière transformation** : le *mapping* des données
dérivées vers les **variables visuelles** de la technique.

| Vue | Dataset | Membre |
|---|---|---|
| Coordonnées parallèles | `tracks_features.csv` | Adrien |
| Treemap / sunburst | `hierarchy.json` | Arij |
| Courbes multiples | `trends.json` | Amir |
| Heatmap de corrélation | `correlation.json` | Maud |
| Carte des pays d'origine (bonus) | `countries.json` + `tracks_clean.csv` | Maud, Arij |

Les vues partagent un même état (`js/core/store.js`) : un filtre posé dans une vue
reste actif quand on passe à une autre (**brushing & linking**).

## Lancer l'application

```bash
python3 -m http.server 8000
```
puis ouvrir <http://localhost:8000> (serveur nécessaire pour charger les données).
