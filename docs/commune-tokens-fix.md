# Correctif tokens atHome des communes (q_code) — 25/06/2026

## Symptôme
Des recherches atHome renvoyaient **0 bien** côté Vesper alors qu'à la main on
voyait des annonces (ex. Rosport-Mompach, Käerjeng).

## Cause racine
Le seed géo (`/api/admin/seed-geo`) n'a lu que le bucket **`towns`** (niveau 9)
de l'API suggest atHome et, pour une commune, a retenu le « town » dont
`name == levels.L7`. Or l'API suggest renvoie **deux** entrées par commune :

- `urbandistricts` → **niveau 7 = la vraie commune**, qui agrège toutes ses
  localités (ex. Rosport-Mompach `725340c1` → 45 maisons).
- `towns` → niveau 9. Pour une commune **fusionnée**, le town homonyme est un
  **fantôme** sans aucune annonce (Rosport-Mompach `fb5f7b2b` → 0 ;
  Käerjeng `dd216047` → 0).

Le seed a stocké le token L9 → 0 résultat sur toutes les communes fusionnées.
Vérifié : les **101 communes** du pays avaient un `q_code` L9 (différent du L7).
Pour les communes mono-localité (ex. Bertrange) le L9 renvoyait par chance le
même total que le L7 ; pour les fusionnées il était vide.

## Fait marquant
atHome résout la localisation **uniquement sur `q`** (le hkey) ; le paramètre
`loc` est cosmétique (`q=725340c1&loc=L9-rosport-mompach` → 45, identique à
`loc=L7-…` ou sans `loc`). On ne corrige donc **que `q_code`**, `loc_code`
inchangé → les configs sauvegardées et le ZonePicker continuent de matcher.

## Correctif
- `commune-l7-tokens.json` : mapping `slug → hkey (L7)` des 101 communes,
  énuméré depuis le bucket `urbandistricts` du suggest et **validé** (les 101
  tokens renvoient > 0 annonce, 12 771 biens cumulés).
- `POST /api/admin/fix-commune-tokens { secret, communes:[{slug,hkey}] }` :
  met à jour `q_code` des zones commune (`parent_id IS NULL`, hors `lux-ville`).
- `/api/admin/seed-geo` accepte désormais un bucket `urbandistricts` et l'utilise
  en priorité comme `q_code` de commune (corrige aussi à la volée sur ré-seed).

Les localités (towns L9) ne sont pas touchées : elles ont leurs propres annonces
(ex. Rosport L9 → 10).
