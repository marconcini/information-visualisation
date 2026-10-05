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
    countries.json     (D5)    pays d'origine (bonus, à enrichir)
scripts/
  pipeline.ipynb               notebook de transformation des données
js/
  core/   dataLoader · store · utils · config
  views/  parallelCoords · treemap · lines · heatmap · choropleth
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

## Les visualisations (étape 2)

Chaque vue réalise la **dernière transformation** : le *mapping* des données
dérivées vers les **variables visuelles** de la technique.

| Vue | Dataset | Membre |
|---|---|---|
| Coordonnées parallèles | `tracks_features.csv` | Adrien |
| Treemap / sunburst | `hierarchy.json` | Arij |
| Courbes multiples | `trends.json` | Amir |
| Heatmap de corrélation | `correlation.json` | Maud |
| Carte (bonus) | `countries.json` | équipe |

Les vues partagent un même état (`js/core/store.js`) : un filtre posé dans une vue
reste actif quand on passe à une autre (**brushing & linking**).

## Lancer l'application

```bash
python3 -m http.server 8000
```
puis ouvrir <http://localhost:8000> (serveur nécessaire pour charger les données).
