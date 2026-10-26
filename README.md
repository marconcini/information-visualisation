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
  DataLoader.js    accès unique aux données dérivées (partagé par les vues)
  filters.js       état commun : filtre par genre + thème, synchronisé entre les vues
  index.js         hub : onglets, cartes, barre de filtre genre + bouton thème
  main.js          point d'entrée des coordonnées parallèles
  heatmap/heatmap.js
  courbes/courbes.js
  views/           treemap.js · parallels_coords.js
css/
  index.css        hub
  treemap.css      treemap
index.html         hub (un onglet par vue)
heatmap.html · treemap.html · courbes.html · coord-para.html
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

## État commun (« un seul système »)

Les vues partagent un même état via [`js/filters.js`](js/filters.js) (mémorisé dans
`localStorage`, synchronisé entre les cadres) :

- **Filtre par genre** — posé dans le hub *ou* dans une vue, il s'applique à **toutes**
  les vues et reste actif quand on change d'onglet (*brushing & linking*). Chaque vue
  l'interprète à sa manière : la heatmap recalcule sa matrice, le treemap zoome sur le
  genre, les courbes l'isolent, les coordonnées parallèles le sélectionnent.
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
