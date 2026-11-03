# Rapport · Spotify · Information Visualization

Groupe 4 · Amir Benayhia, Arij Lemjid, Maud Marconcini, Adrien Verstraelen
Polytech Nice Sophia, SI5 IAID, cours d'Information Visualization

## Sommaire

1. [Résumé du projet](#résumé-du-projet) (ci-dessous)
2. [Utilisateurs et objectifs](1-utilisateurs.md)
3. [Le dataset et son traitement](2-donnees.md)
4. [Approche de visualisation et coordination des vues](3-approche.md)
5. Les visualisations, une page par technique :
   - [Coordonnées parallèles](vues/coordonnees.md) · Adrien Verstraelen
   - [Treemap zoomable](vues/treemap.md) · Arij Lemjid
   - [Courbes multiples](vues/courbes.md) · Amir Benayhia
   - [Heatmap de corrélation](vues/heatmap.md) · Maud Marconcini
   - [Carte des pays d'origine (bonus)](vues/carte.md) · Maud Marconcini et Arij Lemjid

Pour lancer l'application : voir le [README du dépôt](../README.md#lancer-lapplication).

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
