# Spotify · Information Visualization

Visualisations interactives en **D3.js** à partir du dataset **« 30000 Spotify Songs »**
([Kaggle](https://www.kaggle.com/datasets/joebeachcapital/30000-spotify-songs)).
Un même dataset, **4 visualisations coordonnées** (+ 1 bonus).

Groupe 4 · Amir Benayhia, Arij Lemjid, Maud Marconcini, Adrien Verstraelen · Polytech Nice Sophia, SI5 IAID

## Le rapport

1. [Résumé du projet](#résumé-du-projet) (ci-dessous)
2. [Utilisateurs et objectifs](docs/1-utilisateurs.md)
3. [Le dataset et son traitement](docs/2-donnees.md)
4. [Approche de visualisation et coordination des vues](docs/3-approche.md)
5. Les visualisations, une page par technique :
   - [Coordonnées parallèles](docs/vues/coordonnees.md) · Adrien Verstraelen
   - [Treemap zoomable](docs/vues/treemap.md) · Arij Lemjid
   - [Courbes multiples](docs/vues/courbes.md) · Amir Benayhia
   - [Heatmap de corrélation](docs/vues/heatmap.md) · Maud Marconcini
   - [Carte des pays d'origine (bonus)](docs/vues/carte.md) · Maud Marconcini et Arij Lemjid

Pour lancer l'application : voir [Lancer l'application](#lancer-lapplication).

## Résumé du projet

Le projet propose une application web interactive, réalisée en D3.js, pour explorer le catalogue musical de Spotify à partir du dataset public **« 30000 Spotify Songs »** publié sur Kaggle (joebeachcapital). Ce dataset a été constitué à partir de 471 playlists Spotify classées en 6 genres (pop, rap, rock, latin, R&B, EDM) et 24 sous-genres. Pour chaque titre, il donne l'artiste, l'album, la date de sortie, un score de popularité entre 0 et 100, et une dizaine de caractéristiques audio calculées par Spotify : dansabilité, énergie, valence (humeur positive), caractère acoustique, part de parole, caractère instrumental, présence de public, tempo, volume sonore.

Le fichier brut contient 32 833 lignes, mais un même titre peut apparaître dans plusieurs playlists. Après nettoyage, il reste **28 356 titres uniques** de **10 692 artistes**, sortis entre 1957 et 2020, avec une forte concentration sur les années 2010 (70 % des titres).

Nous avons cherché à répondre à des questions que se posent trois profils d'utilisateurs : un mélomane qui veut explorer et découvrir, un journaliste qui cherche une tendance à raconter, et un analyste de label qui veut des informations exploitables. Chaque question a conduit à une technique adaptée à la structure de la donnée concernée :

- les **coordonnées parallèles** pour comparer le profil audio multivarié des genres et des titres ;
- une **treemap zoomable** pour la hiérarchie genre → sous-genre → artiste ;
- des **courbes multiples** pour l'évolution des caractéristiques par décennie ;
- une **heatmap de corrélation** pour voir quelles caractéristiques varient ensemble ;
- en bonus, une **carte** des pays d'origine des artistes, après avoir enrichi le dataset avec MusicBrainz.

Les données brutes sont transformées par un pipeline (un notebook Python et un script d'enrichissement) en jeux de données dérivés, un par vue. Les vues sont réunies dans une page d'accueil à onglets et partagent un même état : un filtre par genre et un thème clair ou sombre, appliqués à toutes les vues en même temps.

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
docs/              pages du rapport (+ captures dans docs/img/)
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
