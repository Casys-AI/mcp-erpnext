# Consulter les données et les joindre au contexte

Dans la bêta de travail, un clic ou un toucher bref ouvre le détail disponible.
Dans un tableau Compose lié, il peut aussi afficher la facture dans le panneau
voisin ou recalculer la marge sur le mois choisi. Si un point dispose uniquement
d’une valeur à lire, le clic affiche cette valeur.

Un double-clic ou un appui long sur un élément l’ajoute au contexte. Répéter le
geste sur le même élément le retire. L’identité provient de la cible du geste,
même si le détail d’une autre donnée est ouvert. Le panier reflète la dernière
réponse confirmée par l’hôte.

Pour joindre plusieurs éléments, tracer un rectangle sur la collection et
relâcher. Les éléments couverts sont ajoutés ensemble. Repasser sur un élément
déjà joint le conserve. Sur le Kanban, commencer dans l’espace libre pour
laisser le déplacement d’une carte disponible. Sur écran tactile, amorcer le
rectangle horizontalement pour conserver le défilement vertical.

| Vue                 | Exemple                                                                                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Liste de documents  | Cliquer sur une facture ouvre sa fiche. Épingler une autre ligne conserve la fiche ouverte.                                                                                       |
| Document et facture | Les lignes avec détail s’ouvrent au clic. Les lignes éligibles peuvent être jointes individuellement ou par rectangle. Le partage d’une pièce jointe conserve sa commande propre. |
| KPI                 | Cliquer sur octobre actualise la marge liée. Un appui long sur juin ajoute uniquement juin au contexte.                                                                           |
| Graphique           | Cliquer sur un point ouvre son détail disponible. Un rectangle permet de joindre plusieurs points.                                                                                |
| Tunnel de ventes    | Cliquer sur une étape donne accès au détail disponible. Un rectangle peut couvrir plusieurs étapes.                                                                               |
| Stock               | L’identité d’une ligne est le couple article–entrepôt. Deux lignes du même article peuvent être jointes séparément.                                                               |
| Kanban              | Une carte peut être ouverte, jointe au contexte ou déplacée. Le déplacement conserve son effet métier.                                                                            |
| Buy Evidence        | Une preuve de session validée fournit une seule référence de contexte, rattachée à sa version.                                                                                    |

## Retrouver les éléments joints

Le chevron devant l'identité d'un document indique que sa fiche peut s'ouvrir.
Le contour d'une donnée et le panier indiquent son appartenance au contexte. Ils
restent visibles lorsqu'on ouvre le détail d'une autre donnée. On peut retirer
un élément depuis le panier, par double-clic, par appui long ou avec Maj +
Espace lorsqu'il a le focus.

Les colonnes du tableau occupent toute la largeur disponible. La sélection se
dessine à l’intérieur des cellules. Des lignes jointes contiguës forment un
contour extérieur continu. Une seule séparation fine reste entre deux lignes.
Retirer la ligne du milieu ferme les contours des deux groupes restants.

Dans une liste filtrée ou paginée, le rectangle s'applique aux lignes visibles
qu’il recouvre. Les sélections précédentes restent disponibles dans le panier
lorsqu'on change de page. Si le nombre de références transmissibles est limité,
le panier indique combien de lignes sont jointes et combien peuvent être
transmises. [Sélections groupées et projections](selection-tiers/README.md)

## Portée du contexte et synchronisation

Une épingle est destinée au prochain tour de conversation où la vue fournit son
contexte. Son état est lié à la racine de la vue. Épingler Blue Harbour **dans
la liste**, puis afficher Amber **dans la fiche**, conserve Blue Harbour.
Remplacer une fiche change sa racine et retire les contributions propres au
document précédent. Le tableau Compose continue de fusionner les contributions
des autres panneaux. Rejouer un snippet crée un nouveau tableau.

Les vues installent les styles de `@mcpview/components/preact/controls` une fois
par document. La bibliothèque reconnaît le clic, le double-clic, l’appui long et
le rectangle. Elle dessine le contour des lignes marquées
`data-mcp-view-context-row="selected"`, y compris après un tri ou une ouverture
de détail. Le viewer fournit l’identité métier et déclenche explicitement chaque
effet. Une liaison Compose livre un événement tel que `invoice.selected` ou
`kpi.period.selected` ; le contrôleur de contexte utilise
`ui/update-model-context`. Le shell conserve le dernier état acquitté, y compris
si un effacement échoue, et peut réessayer à la livraison suivante. Le succès
d’une lecture, l’acquittement d’une épingle et une réponse du modèle à une
question sont vérifiés séparément.
[Routage des factures](../../src/ui/code-mode/invoice-panels.ts) ·
[Routage des périodes](../../src/ui/code-mode/kpi-period-panels.tsx) ·
[Contexte des panneaux](../../src/ui/code-mode/panel-hosts.ts)

## Parcours de vérification

Dans la bêta privée, `npm ci` dans `src/ui` installe les archives locales de
`@mcpview/components` et de `@mcpview/compose` identifiées dans le lockfile. La
première fournit les contrôles partagés. La seconde contient le routage de
panneaux du commit MCPView `112cabf`. Les bundles HTML distribués embarquent ces
modules au build.

- Épingler Blue avant d’ouvrir une facture, lire Amber, puis vérifier que l’hôte
  reçoit toujours Blue. Retirer Blue par un nouveau double-clic et vérifier que
  la fiche d’Amber reste ouverte.
- Filtrer la liste, tracer un rectangle sur trois lignes, puis changer de page
  et modifier la recherche. Le panier doit conserver les trois factures, ainsi
  que toute facture jointe auparavant. Vérifier les identités et les éventuelles
  limites annoncées dans le contexte reçu.
- Lire octobre, l’épingler, puis lire novembre. Vérifier la nouvelle marge et
  l’absence d’une nouvelle écriture de contexte. Demander au chat quel mois est
  épinglé.
- Vérifier les contrôles au clavier et au tactile, les erreurs d’acquittement et
  les lectures tardives. Le bouton de partage d’un fichier doit conserver son
  comportement et sa note.
- Charger une preuve Buy valide, puis une session rejetée. Le changement doit
  retirer le contexte de l’ancienne session sans altérer les contributions des
  autres panneaux.
