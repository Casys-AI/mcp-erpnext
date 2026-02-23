# ERPNext MCP — Known Issues & TODO

## Bugs fixés (2026-02-18)

### TimestampMismatchError sur submit

**Symptome** : `frappe.client.submit` renvoie `TimestampMismatchError` quand on passe `{doctype, name}` sans le champ `modified`.

**Cause** : Frappe utilise un optimistic locking basé sur `modified`. L'API `submit` attend le doc complet avec son timestamp `modified` pour vérifier qu'il n'a pas été modifié entre-temps.

**Fix appliqué** : Tous les handlers submit font maintenant un `GET` du doc avant de le passer à `frappe.client.submit` :
```typescript
const doc = await ctx.client.get("Sales Order", input.name as string);
const result = await ctx.client.callMethod("frappe.client.submit", {
  doc: { ...doc, doctype: "Sales Order" },
});
```

**Fichiers corrigés** :
- `src/tools/operations.ts` — `erpnext_doc_submit`
- `src/tools/sales.ts` — `erpnext_sales_order_submit`, `erpnext_sales_invoice_submit`

**Note** : `frappe.client.cancel` n'a PAS ce problème — il accepte `{doctype, name}`.

### Fix `uom` → `stock_uom` (inventory.ts)

Le champ `uom` dans `erpnext_item_create` s'appelle `stock_uom` dans ERPNext. Corrigé.

---

## Bugs ouverts

### P0 — Fresh instance: `base_rounded_total = None` → TypeError

**Symptome** : Sur une instance ERPNext fraîche (sans setup wizard), soumettre un Sales Order/Invoice échoue avec `TypeError: abs(None)` dans `validate_grand_total()`.

**Cause** : ERPNext calcule `base_rounded_total` automatiquement mais le champ reste `None` si la configuration de rounding n'est pas initialisée.

**Workaround actuel** : Passer `disable_rounded_total: 1` dans le document avant submit.

**Fix souhaité** : Soit le faire automatiquement dans les submit handlers quand le champ est `None`, soit documenter que le setup wizard ERPNext est requis.

### P1 — FrappeClient perd les `_server_messages`

**Symptome** : Les erreurs Frappe ont 2 niveaux : `exc_type` (ex: `MandatoryError`) et `_server_messages` (ex: `["selling_price_list is required"]`). Notre `FrappeClient.handleError()` n'extrait que le premier.

**Impact** : Les messages d'erreur sont cryptiques — on voit `MandatoryError` sans savoir quel champ manque.

**Fix** : Parser `_server_messages` dans `frappe-client.ts:handleError()` et l'inclure dans le message d'erreur.

### P1 — `erpnext_sales_order_create` ne passe pas les defaults critiques

**Symptome** : Créer un Sales Order échoue avec `MandatoryError: selling_price_list` sur une instance fraîche.

**Cause** : Le handler n'inclut pas `selling_price_list` ni `set_warehouse` dans l'input schema.

**Fix** : Ajouter ces champs optionnels dans le schema :
- `selling_price_list` (default: "Standard Selling" ?)
- `set_warehouse` (default: aucun — laisser vide, mais le documenter)
- `company` (déjà dans le schema mais optionnel)

---

## Améliorations souhaitées

### Setup wizard automation

ERPNext fraîche nécessite du master data avant de pouvoir créer des documents transactionnels. Les tools `erpnext_company_create` et `erpnext_doc_create` existent maintenant, mais le workflow complet est :

1. Créer Company
2. Créer Price Lists (Standard Selling, Standard Buying)
3. Créer Warehouses (ou utiliser les auto-créés par Company)
4. Créer Item Groups si besoin
5. Créer UOMs si non standard (Nos, Kg, etc. existent par défaut)

**Idée** : Un tool `erpnext_setup_check` qui vérifie que les prérequis existent et retourne ce qui manque.

### Retry / error context enrichment

Quand une opération échoue (ex: MandatoryError), le handler pourrait :
1. Parser l'erreur Frappe
2. Retourner un message structuré avec le champ manquant
3. Suggérer la correction (ex: "Add selling_price_list field")

### Rate limits / throttling

Aucun rate limiting côté client. Un agent qui boucle peut bombarder l'API ERPNext.

### Tests d'intégration

Les tests actuels sont tous mockés. Il faudrait des tests d'intégration qui tournent contre un vrai ERPNext (Docker) pour valider les workflows end-to-end.
