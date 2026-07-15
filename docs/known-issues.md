# ERPNext MCP — Known Issues & TODO

## Bugs fixés

### TimestampMismatchError sur submit (2026-02-18)

**Symptome** : `frappe.client.submit` renvoie `TimestampMismatchError` quand on
passe `{doctype, name}` sans le champ `modified`.

**Cause** : Frappe utilise un optimistic locking basé sur `modified`. L'API
`submit` attend le doc complet avec son timestamp `modified` pour vérifier qu'il
n'a pas été modifié entre-temps.

**Fix appliqué** : Tous les handlers submit font maintenant un `GET` du doc
avant de le passer à `frappe.client.submit` :

```typescript
const doc = await ctx.client.get("Sales Order", input.name as string);
const result = await ctx.client.callMethod("frappe.client.submit", {
  doc: { ...doc, doctype: "Sales Order" },
});
```

**Fichiers corrigés** :

- `src/tools/operations.ts` — `erpnext_doc_submit`
- `src/tools/sales.ts` — `erpnext_sales_order_submit`,
  `erpnext_sales_invoice_submit`

**Note** : `frappe.client.cancel` n'a PAS ce problème — il accepte
`{doctype, name}`.

### Fix `uom` → `stock_uom` (inventory.ts)

Le champ `uom` dans `erpnext_item_create` s'appelle `stock_uom` dans ERPNext.
Corrigé.

### FrappeClient parse maintenant `_server_messages`

**Symptome historique** : Les erreurs Frappe ont 2 niveaux : `exc_type` (ex:
`MandatoryError`) et `_server_messages` (ex:
`["selling_price_list is required"]`). `FrappeClient.handleError()` n'extrayait
que le premier — messages cryptiques côté agent.

**Fix appliqué** : Parser dédié `extractServerMessages()` qui décode le
double-encodage JSON Frappe et concatène les messages utiles :

- `src/api/frappe-client.ts:80` — fonction `extractServerMessages()`
- `src/api/frappe-client.ts:181` — usage dans le chemin d'erreur HTTP

### `erpnext_sales_order_create` accepte les defaults critiques

**Symptome historique** : Création d'un Sales Order échouait avec
`MandatoryError: selling_price_list` sur instance fraîche, parce que le champ
n'était ni dans le schema ni transmis.

**Fix appliqué** :

- `src/tools/sales.ts:324` — `selling_price_list` ajouté au schema
- `src/tools/sales.ts:381` — passé au payload de création

### `FrappeClient` retry les erreurs transitoires de lecture

**Symptome historique** : Un 429/5xx temporaire ou une erreur réseau faisait
échouer immédiatement les lectures, même quand une relance courte aurait suffi.

**Fix appliqué** : `FrappeClient` retry maintenant les `GET` sur les statuts
transitoires configurés (`408`, `429`, `502`, `503`, `504`) et sur les erreurs
réseau, avec backoff exponentiel et support de `Retry-After`.

### `kanban-viewer` garde les sauvegardes sans `serverTools`

**Symptome historique** : Dans le modal de détail d'une carte kanban,
`handleSaveDetail` appelait `app.callServerTool` sans vérifier
`app.getHostCapabilities()?.serverTools`, contrairement aux autres mutations du
viewer.

**Fix appliqué** : `handleSaveDetail` échoue maintenant explicitement avec le
même guard que les déplacements de cartes quand l'hôte ne supporte pas les
appels serveur proxifiés.

---

## Bugs ouverts

### P0 — Fresh instance: `base_rounded_total = None` → TypeError

**Symptome** : Sur une instance ERPNext fraîche (sans setup wizard), soumettre
un Sales Order/Invoice échoue avec `TypeError: abs(None)` dans
`validate_grand_total()`.

**Cause** : ERPNext calcule `base_rounded_total` automatiquement mais le champ
reste `None` si la configuration de rounding n'est pas initialisée.

**Workaround actuel** : Passer `disable_rounded_total: 1` dans le document avant
submit.

**Fix souhaité** : Soit le faire automatiquement dans les submit handlers quand
le champ est `None`, soit documenter que le setup wizard ERPNext est requis.

---

### RuntimeError: `Deno is not defined` on Node.js

**Symptom**: Running the npm bundle (`npx @casys/mcp-erpnext --http`) crashes
with `ReferenceError: Deno is not defined` at `loadYamlAuth`.

**Cause**: The transitive dependency `@casys/mcp-server` (v0.18.x) contains
`Deno.readTextFile` calls that esbuild inlines into the bundle. The project's
own runtime adapter (`src/runtime.ts` / `src/runtime.node.ts`) handles the
swap correctly, but `@casys/mcp-server`'s internal auth-config loader bypasses
it.

**Workaround**: Run with the Deno runtime instead:

```bash
deno run -A npm:@casys/mcp-erpnext --http --port=3012
```

**Fix needed**: Patch the upstream `@casys/mcp-server` to use a runtime adapter
or a pure-Node YAML reader.

---

## Améliorations souhaitées

### Setup wizard automation

ERPNext fraîche nécessite du master data avant de pouvoir créer des documents
transactionnels. Les tools `erpnext_company_create` et `erpnext_doc_create`
existent maintenant, mais le workflow complet est :

1. Créer Company
2. Créer Price Lists (Standard Selling, Standard Buying)
3. Créer Warehouses (ou utiliser les auto-créés par Company)
4. Créer Item Groups si besoin
5. Créer UOMs si non standard (Nos, Kg, etc. existent par défaut)

**Idée** : Un tool `erpnext_setup_check` qui vérifie que les prérequis existent
et retourne ce qui manque.

### Retry / error context enrichment

Quand une opération échoue (ex: MandatoryError), le handler pourrait :

1. Parser l'erreur Frappe
2. Retourner un message structuré avec le champ manquant
3. Suggérer la correction (ex: "Add selling_price_list field")

### Rate limits / throttling

Aucun rate limiting côté client. Un agent qui boucle peut bombarder l'API
ERPNext. `FrappeClient` retry les lectures sur 429/5xx, mais il ne fait pas
encore de throttling global ni de budget de requêtes par session.

### Tests d'intégration

Les tests actuels sont tous mockés. Il faudrait des tests d'intégration qui
tournent contre un vrai ERPNext (Docker) pour valider les workflows end-to-end.
Pattern Deno suggéré :

```typescript
const runIntegration = Deno.env.get("ERPNEXT_INTEGRATION") === "1";
Deno.test({
  name: "integration: sales order create validates ERPNext defaults",
  ignore: !runIntegration,
  fn: async () => {
    /* requires ERPNEXT_URL, ERPNEXT_API_KEY, ERPNEXT_API_SECRET */
  },
});
```
