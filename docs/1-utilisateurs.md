# Utilisateurs et objectifs

[← Sommaire](../README.md)

Nous avons défini trois profils d'utilisateurs. Pour chacun, nous avons listé ses objectifs, les questions concrètes qu'il se pose, puis les tâches de visualisation qui en découlent. Ce sont ces tâches qui ont guidé le choix des techniques, et non l'inverse.

![Profils sur la page d'accueil](img/index-3-profils.png)

## Mélomane

**Qui** : une personne qui écoute beaucoup de musique et veut mieux connaître le catalogue, sans connaissances en statistiques.

**Objectif** : explorer et comparer la musique par plaisir, découvrir des artistes et des sous-genres.

**Questions typiques**
- Quels sont les sous-genres du rap, et quels artistes y dominent ?
- Dans quels styles est classé un artiste que j'aime ?
- Quels titres ressemblent, par leur profil audio, à ceux que j'écoute ?
- D'où viennent les artistes d'un genre ?

**Vues utiles** : treemap, coordonnées parallèles, carte.

## Journaliste

**Qui** : un journaliste culture ou data qui prépare un article sur l'évolution de la musique.

**Objectif** : trouver une tendance ou une relation à raconter, et pouvoir l'illustrer avec des exemples concrets.

**Questions typiques**
- Le rock est-il devenu plus énergique et moins acoustique au fil des décennies ?
- La musique est-elle plus « positive » quand elle est plus dansante ?
- Les titres les plus populaires ont-ils un profil audio particulier ?

**Vues utiles** : courbes multiples, heatmap de corrélation.

## Analyste de label (A&R)

**Qui** : une personne chargée de repérer des artistes et des tendances pour une maison de disques.

**Objectif** : tirer du catalogue des informations exploitables pour décider : où se concentre la production, quels genres restent populaires, quels pays produisent quoi.

**Questions typiques**
- Quels sous-genres sont dominés par quelques artistes, et lesquels sont ouverts ?
- Quels genres gardent beaucoup de titres populaires ?
- Quelles caractéristiques audio vont ensemble dans un genre donné ?
- Quels pays sont spécialisés dans un genre ?

**Vues utiles** : heatmap, coordonnées parallèles, treemap, carte.

## Des objectifs aux tâches

Nous avons traduit ces questions en tâches abstraites, avec le vocabulaire du cours (Munzner, Shneiderman), puis vérifié que chaque tâche est couverte par au moins une vue.

| Tâche | Exemple de question | Vue principale |
|---|---|---|
| Vue d'ensemble | Comment le catalogue se répartit-il ? | Treemap, carte |
| Comparer | Le profil audio de l'EDM diffère-t-il de celui du rock ? | Coordonnées parallèles |
| Partie / tout | Quelle part du rap fait le southern hip hop ? | Treemap |
| Tendance | Comment l'énergie du rock évolue-t-elle ? | Courbes multiples |
| Corréler | L'énergie va-t-elle avec le volume sonore ? | Heatmap |
| Distribution, anomalies | Quels titres sortent du profil de leur genre ? | Coordonnées parallèles, nuage de points de la heatmap |
| Extrêmes | Quand l'acoustique du rock a-t-elle été la plus basse ? | Courbes multiples |
| Localiser | Où se trouve un artiste dans le catalogue, dans le monde ? | Treemap (recherche), carte |
| Filtrer | Ne regarder qu'un genre, une période, des titres populaires | Toutes les vues (filtre de genre commun) |
| Détails à la demande | Quels sont les titres derrière une moyenne ? | Toutes les vues (infobulles, panneaux, listes de titres) |

Chaque page de visualisation reprend ces tâches et montre, avec un scénario concret, comment la vue les supporte.
