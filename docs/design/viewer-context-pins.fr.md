# Explorer une vue ERPNext et épingler des éléments au contexte

Inventaire des neuf viewers enregistrés dans `src/ui/viewers.ts`. Le point de comparaison est la candidate Code Mode `fb32608`. La règle de la bêta distingue le contenu que la personne regarde de celui qu’elle choisit de communiquer au prochain tour de conversation.

## Trois gestes sur les commandes d’octobre

1. Cliquer sur la barre **octobre** active ce mois. Dans un tableau où le programme a relié les commandes à la marge, le panneau voisin recalcule la marge pour octobre. Cliquer ensuite sur novembre remplace le filtre. Une plage de deux mois fait l’objet d’un choix explicite.
2. Activer **l’épingle** du point d’octobre le joint au contexte. On peut ensuite regarder novembre et poser une question sur octobre. Le bouton indique l’état confirmé par l’hôte. Un clic sur une autre barre n’ajoute rien au panier.
3. Utiliser l’action de **détail** pour poursuivre l’examen. Sa destination dépend de l’opération ERP. Sur le KPI des commandes, le grand nombre peut mener à la liste des commandes du mois courant. L’action associée à la tendance peut demander un graphique des douze derniers mois. Le titre du contrôle doit annoncer l’action effectivement disponible.

## Inventaire par vue

| Vue | Avant cette migration | Règle de la bêta |
| --- | --- | --- |
| Liste de documents | Seule, clic ou Espace joignait la ligne. Le double-clic, Entrée ou le chevron dépliait la fiche. Dans une liste de factures liée, le clic ouvrait déjà le panneau voisin. Les cases étaient à gauche. | Ouvrir depuis la ligne, sous celle-ci en solo ou dans la fiche voisine si elle est reliée. Épingle indépendante à droite. L’en-tête permet d’épingler en bloc les résultats filtrés chargés, même au-delà de la page à l’écran. Replier la colonne conserve les épingles. |
| Document | L’en-tête et les lignes enfants sélectionnables alimentaient le contexte. Des chevrons ouvraient les détails disponibles. | Épingles sur le document et les lignes partageables. Déplier un enfant reste une action de lecture. L’aperçu des pièces jointes et le partage du fichier avec sa note restent deux opérations distinctes. |
| Facture | L’en-tête et les articles pouvaient être joints. Un article s’ouvrait au double-clic, avec Entrée ou par son chevron. | Épingler la facture ou un article depuis son propre contrôle à droite. L’ouverture d’un article et le changement de facture ont leur propre état. |
| KPI | Le clic sur la barre ajoutait son mois au contexte. Dans le tableau lié, une seconde rangée de boutons répétait les mois pour piloter la marge. | Le clic active le mois et transmet la période au panneau lié. Épingler le point est un choix séparé. Un chiffre scalaire seul sans composant sélectionnable garde son affichage simple. |
| Graphique | Clic sur une marque pour partager, titre ou fond pour joindre le graphique visible, flèches pour explorer, double-clic ou commande pour les détails. | Explorer la marque et épingler la valeur active, une série ou le graphique visible selon le cas. La légende garde son rôle de visibilité. Les mini-graphiques imbriqués utilisent le panier de leur vue racine. |
| Tunnel de ventes | Clic ou Espace partageait l’étape et son effectif. La commande de détail pouvait lire une liste ou demander une réponse dans le chat. | Inspecter l’étape au clic. Son épingle est distincte du détail et de la demande conversationnelle. Les lignes mobiles donnent accès aux mêmes actions. |
| Stock | Clic ou Espace partageait le couple article–entrepôt. Double-clic, Entrée ou chevron ouvrait le détail. | Lire le détail depuis la ligne et épingler le couple article–entrepôt à droite. Deux lignes du même article dans deux entrepôts restent deux éléments différents. |
| Kanban | Le titre ouvrait la carte. Le glisser-déposer avait une incidence sur l’état ERP. Les vues imbriquées disposaient d’un panier. | Ouvrir la carte par son titre, l’épingler depuis son angle supérieur droit ou déplacer la carte par son geste métier. L’épingle d’une colonne porte sur ses cartes chargées. |
| Buy Evidence | La vue affichait une projection de session enregistrée, à partir d’une preuve vérifiée. Le résultat brut et les appels ERP en direct étaient exclus. | Lire la preuve enregistrée. Seule une projection validée peut fournir une référence à épingler, bornée et rattachée à sa version. Une session invalide ou indisponible ne fournit aucun résultat à épingler. |

## Épingler les résultats d’une liste

Au repos, le chevron en bout de ligne permet d’ouvrir le détail. Quand on déplie « Épingler au contexte », un trait occupe son emplacement. La ligne reste cliquable pour ouvrir la fiche et les colonnes gardent leur largeur. Le trait est oblique au repos et vertical lorsque la ligne est épinglée. Dans l’en-tête, un trait vertical interrompu signale une sélection partielle. Le bouton collectif agit sur toutes les lignes chargées qui correspondent à la recherche et aux filtres, en conservant les autres épingles.

Lorsque le contexte peut contenir moins de références que l’utilisateur n’en a épinglées, un statut indique les deux nombres. Par exemple, 30 lignes épinglées peuvent fournir 8 références si l’opération de lecture de liste est indisponible. Avec cette opération, une sélection de 130 lignes peut fournir une requête portant sur 100 identifiants. [Sélections groupées et projections](selection-tiers/README.md)

Le focus clavier, la ligne ouverte et l’épingle représentent trois états différents. Le bouton d’épingle a un nom accessible, reste utilisable au tactile et conserve le focus quand on l’active. Les boutons ou chevrons de détail donnent un chemin utilisable sans double-clic. Un double-clic de compatibilité ne doit ni ouvrir deux fois ni envoyer de message.

## Portée du contexte et synchronisation

Une épingle est destinée au prochain tour de conversation où la vue fournit son contexte. Son état est lié à la racine de la vue. Épingler Blue Harbour **dans la liste**, puis afficher Amber **dans la fiche**, conserve Blue Harbour. Remplacer une fiche change sa racine et retire les contributions propres au document précédent. Le tableau Compose continue de fusionner les contributions des autres panneaux. Rejouer un snippet crée un nouveau tableau.

Le viewer déclenche explicitement chaque effet. Une liaison Compose livre un événement tel que `invoice.selected` ou `kpi.period.selected` ; le contrôleur de contexte utilise `ui/update-model-context`. Le succès d’une lecture, l’acquittement d’une épingle et une réponse du modèle à une question sont vérifiés séparément. [Routage des factures](../../src/ui/code-mode/invoice-panels.ts) · [Routage des périodes](../../src/ui/code-mode/kpi-period-panels.tsx) · [Contexte des panneaux](../../src/ui/code-mode/panel-hosts.ts)

## Parcours de vérification

- Épingler Blue avant d’ouvrir une facture, lire Amber, puis vérifier que l’hôte reçoit toujours Blue. Répéter avec la colonne repliée.
- Filtrer la liste, épingler le résultat, changer de page et modifier la recherche. L’épingle collective et le compteur doivent refléter les identités réellement jointes.
- Lire octobre, l’épingler, puis lire novembre. Vérifier la nouvelle marge et l’absence d’une nouvelle écriture de contexte. Demander au chat quel mois est épinglé.
- Vérifier les contrôles au clavier et au tactile, les erreurs d’acquittement et les lectures tardives. Le bouton de partage d’un fichier doit conserver son comportement et sa note.
- Charger une preuve Buy valide, puis une session rejetée. Le changement doit retirer le contexte de l’ancienne session sans altérer les contributions des autres panneaux.
