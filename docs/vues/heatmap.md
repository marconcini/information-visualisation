# Heatmap de corrélation : quelles caractéristiques vont ensemble ?

[← Sommaire](../../README.md)

**Auteure : Maud Marconcini**

Fichiers : [`heatmap.html`](../../heatmap.html) · [`js/heatmap/heatmap.js`](../../js/heatmap/heatmap.js)
Données : [`data/derived/correlation.json`](../../data/derived/correlation.json) (D4) et [`data/derived/tracks_features.csv`](../../data/derived/tracks_features.csv) (D1) pour le recalcul par genre et le nuage de points

![Matrice de corrélation, tous genres](../img/heatmap-1.png)

## 1. Question et données représentées

La vue répond à la question : **quelles caractéristiques audio varient ensemble ?**

La donnée affichée est une **matrice** : pour chaque paire parmi 10 variables (7 caractéristiques audio, tempo, volume sonore, popularité), le coefficient de corrélation de Pearson, entre −1 et +1. C'est une variable calculée à partir des 28 356 titres.

## 2. Pourquoi une heatmap

- Une matrice 10 × 10 contient 45 paires différentes : une heatmap les montre toutes en même temps, à la même taille, dans une grille où l'on retrouve facilement une paire par sa ligne et sa colonne.
- La valeur va de −1 à +1 avec un zéro qui a un sens (pas de relation) : une **échelle de couleur divergente** (bleu pour négatif, gris pour zéro, rouge pour positif) est la bonne échelle pour ce type de donnée.
- Un coefficient résume une relation mais peut cacher sa forme : d'où le **nuage de points** au clic, qui montre les titres réels derrière le chiffre.

## 3. Utilisateurs et tâches

- **Journaliste** : trouver une relation à raconter (« plus c'est fort, plus c'est énergique »).
- **Analyste label** : savoir quelles caractéristiques vont ensemble dans un genre donné.

| Tâche | Comment la vue la supporte |
|---|---|
| Vue d'ensemble | Les 45 paires en une seule grille, valeur écrite dans chaque case |
| Corréler | Couleur divergente, case la plus foncée = relation la plus forte |
| Comparer | Filtre par genre qui recalcule la matrice sur ce genre |
| Détails à la demande | Infobulle sur une case, nuage de points de la paire au clic |
| Anomalies | Points éloignés de la droite de tendance dans le nuage, avec le nom du titre au survol |

## 4. Mode d'emploi

### 4.1 Lire la matrice

Chaque case donne la corrélation entre la variable de sa ligne et celle de sa colonne. Le survol d'une case met en avant les deux noms de variables et affiche la valeur. La diagonale (une variable avec elle-même) est grisée.

### 4.2 Voir la relation réelle

Un clic sur une case affiche à droite le **nuage de points** des deux variables, avec une **droite de tendance** en pointillés. Les points sont colorés par genre. Pour rester lisible, le nuage montre un échantillon d'au plus 2 500 titres, ce qui est indiqué en bas de la page : le coefficient, lui, est calculé sur tous les titres.

![Nuage de points énergie / volume sonore](../img/heatmap-2-nuage.png)

*Scénario (journaliste) :* « Les morceaux plus forts sont-ils plus énergiques ? » La case la plus rouge est énergie × volume sonore (r = 0,68). Le nuage confirme une relation nette et régulière. La relation la plus négative est énergie × acoustique (r = −0,55) : les titres acoustiques sont plus calmes.

*Scénario (analyste label) :* « Peut-on prédire la popularité à partir du profil audio ? » Toute la ligne « Popularity » est presque grise : aucune corrélation ne dépasse 0,12 en valeur absolue. Dans ce dataset, la popularité d'un titre ne s'explique pas par ses caractéristiques audio.

### 4.3 Filtrer par genre

Choisir un genre **recalcule la matrice** sur les titres de ce genre, et le nuage de points suit.

![Matrice recalculée sur le rock](../img/heatmap-3-rock.png)

*Scénario (analyste label) :* « Les relations sont-elles les mêmes dans tous les genres ? » Non : énergie × volume sonore monte à 0,76 dans le rock, et dansabilité × valence passe de 0,33 (tous genres) à 0,51 dans le rock, contre 0,25 seulement dans le rap.

Ce filtre est le filtre de genre commun du projet : il est partagé avec les autres vues.

## 5. Choix de conception

- **Interpolation Lab** de l'échelle divergente, pour que les corrélations moyennes restent distinguables (une interpolation RGB les rend toutes grisâtres).
- **Valeur écrite dans chaque case**, avec une couleur de texte choisie selon la clarté du fond, pour ne pas dépendre uniquement de la couleur.
- **Couleurs adaptées au thème** : la vue relit ses couleurs quand on passe en sombre et se redessine.
- **Honnêteté** : le texte en bas de page explique que le nuage est un échantillon.

## 6. Fonctions principales

| Fonction (`js/heatmap/heatmap.js`) | Entrée | Sortie |
|---|---|---|
| `pearson(xs, ys)` | Deux listes de valeurs | Coefficient de corrélation de Pearson |
| `computeMatrix(rows)` | Titres (d'un genre) de D1 | Matrice 10 × 10 arrondie au millième |
| `renderMatrix(matrix)` | Une matrice | Grille de cases colorées, libellés, interactions |
| `showScatter(i, j)` | Indices d'une paire | Nuage de points échantillonné et droite de régression linéaire |
| `buildGenreFilter()` | Genres du projet, filtre commun | Liste déroulante synchronisée avec les autres vues |

## 7. Limites et pistes

- La corrélation de Pearson ne mesure que les relations linéaires : une relation en U n'apparaîtrait pas. Le nuage de points permet de le vérifier pour une paire.
- L'échantillon du nuage est pris à intervalles réguliers dans le fichier : un tirage aléatoire stratifié par genre serait plus représentatif.
- Les cases ne sont pas accessibles au clavier pour l'instant.
