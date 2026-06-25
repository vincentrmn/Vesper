# BBI tools — Design System (brief de session « design »)

> **But de ce doc :** être le point d'entrée d'une **session Claude Code dédiée au design**.
> Il fixe l'identité « BBI tools », les décisions déjà prises, l'état actuel, **comment
> utiliser les 2 outils branchés**, et le plan de migration sur Vesper.
> Première rédaction : 25/06/2026. Repo de test : **Vesper**.

---

## 0. TL;DR pour démarrer la session

1. Lire ce doc + `src/app/globals.css` (section « BBI tools — design system » en bas) + la page vitrine `src/app/style/page.tsx` (route **`/style`**).
2. **Vérifier les 2 outils :**
   - Skill **ui-ux-pro-max** : doit apparaître dans la liste des skills. Sinon `ls ~/.claude/skills/ui-ux-pro-max`. Scripts requêtables (voir §4).
   - MCP **magic** (21st.dev) : `ToolSearch "magic 21st component"`. **S'il ne remonte rien → demander à Vincent de confirmer que le serveur `magic` est bien chargé** (il se prend en compte au démarrage de session). Ne pas bloquer dessus : le skill + le craft suffisent à avancer.
3. Construire/ajuster les primitives (§3) en s'appuyant sur le skill (§4) et magic (§5), **rendre en image** (§6), valider avec Vincent, **puis migrer Vesper écran par écran** (§7).

---

## 1. Décisions verrouillées (ne pas reposer la question)

| Sujet | Décision |
|---|---|
| Stack | **CSS maison + primitives** (zéro dépendance UI, pas de Tailwind importé). magic/21st = **inspiration** qu'on **traduit** dans nos tokens. |
| Périmètre | **Vesper d'abord**, puis portage sur **BBIscout** (`vincentrmn/scout`). « BBI tools design » = système commun aux 2 outils. |
| Identité | **Outil métier dense** : compact, data-dense, tableaux ultra-soignés, peu de fioritures, usage quotidien intensif (agente Shawna). |
| Mode | **Clair** (PAS de dark mode par défaut). Le générateur auto du skill propose du dark/luxe/landing → **à ignorer**, hors-sujet pour un outil métier. |
| Accent | **Vert BBI `#0cbd8e`** comme accent unique (héritage Brouwers). Noir réservé au texte / boutons secondaires. |

---

## 2. Principes « dense pro »

- **Densité** : base 13.5 px desktop, contrôles 34 px, rayons courts (8 px), filets fins. On tient beaucoup d'info sans bruit.
- **Hiérarchie sobre** : 1 seul accent (vert), neutres froids, micro-labels en CAPITALES espacées, peu d'ombres.
- **Chiffres tabulaires partout** (`font-variant-numeric: tabular-nums`) pour aligner prix / €/m² / surfaces — signature « pro ».
- **Tableaux = produit** : header collant, hover de ligne, colonnes numériques alignées à droite, sur mobile → cartes empilées (déjà en place).
- **Honnêteté visuelle** (cf. CLAUDE.md §0) : la confiance / fourchette / sources doivent rester lisibles et non survendues.

---

## 3. Primitives (état actuel + à faire)

Définies dans `globals.css`, **namespacées `.ds-*`**, sous un conteneur `.ds-scope` (tokens). Aperçu isolé sur **`/style`** — **aucune page réelle migrée pour l'instant**.

| Primitive | Classe | État |
|---|---|---|
| Tokens (couleur/typo/espace/rayon/ombre/densité) | `.ds-scope` (variables `--ds-*`) | ✅ base |
| Titres / labels | `.ds-h1 .ds-h2 .ds-label .ds-muted .ds-num` | ✅ |
| Section + filet | `.ds-section .ds-rule` | ✅ |
| Button (primary/secondary/ghost/danger + `--sm`) | `.ds-btn .ds-btn--*` | ✅ |
| Field (input/select) | `.ds-field .ds-input .ds-select` | ✅ |
| Tag / Chip / Pill | `.ds-tag--* .ds-chip[data-on] .ds-pill .ds-dot` | ✅ |
| KPI | `.ds-stats .ds-stat .ds-stat__k .ds-stat__v` | ✅ |
| Toolbar | `.ds-toolbar .ds-toolbar__sep` | ✅ |
| Card (+ accent) | `.ds-card .ds-card__head .ds-card__body .ds-card--accent` | ✅ |
| Table dense | `.ds-table .ds-table__wrap` | ✅ |
| **À ajouter** | Modal/Dialog, Tooltip, Tabs, Badge de delta prix (↑/↓), barre de distribution (reprendre `.dist-*`), états vide/chargement (skeleton), photo strip stylée | ⬜ |

**Tokens clés actuels** (voir `globals.css` pour la liste complète) :
`--ds-accent #0cbd8e` · `--ds-accent-ink #07875f` · `--ds-ink #0f1412` · `--ds-ink-soft #6c7572` ·
`--ds-line #e4e8e6` · `--ds-bg-subtle #f6f8f7` · base `13.5px` · contrôles `34px` · rayons `6/8/12px`.

---

## 4. Outil n°1 — skill **ui-ux-pro-max** (intelligence design)

Base de données interrogeable : 67 styles, 96 palettes, 57 paires de typo, 99 règles UX, 25 charts.
Dossier : `~/.claude/skills/ui-ux-pro-max/`. **Utiliser les recherches ciblées, PAS le générateur global** (biaisé landing/dark).

```bash
cd ~/.claude/skills/ui-ux-pro-max
# Règles UX (accessibilité, responsive, table, contraste…) :
python3 scripts/search.py "dashboard data table dense" --domain ux -n 8
# Typo (déjà étudié — voir verdicts ci-dessous) :
python3 scripts/search.py "professional dashboard data" --domain typography -n 4
# Palettes / styles si on veut explorer :
python3 scripts/search.py "professional neutral teal" --domain color -n 5
python3 scripts/search.py "minimal flat enterprise" --domain style -n 5
```

**Verdicts déjà extraits :**
- **Typo** : « Minimal Swiss » = **Inter seul** (best pour dashboards / design systems / enterprise) → **on garde Inter** pour l'UI. Alternative « Dashboard Data » = **Fira Code (mono) + Fira Sans** → option : un **mono pour les cellules chiffrées** (Fira Code / IBM Plex Mono / JetBrains Mono) comme signature « pro ». **À trancher avec Vincent.**
- **Règles UX à appliquer** (issues du skill) :
  - Body **≥ 16px sur mobile** (et **inputs ≥ 16px** sinon iOS zoome au focus) → notre densité 13.5px est OK desktop, mais **remonter le body/inputs à 16px en < 640px**. ⚠️ point d'attention.
  - Tableaux : overflow-x **ou** cartes empilées (on fait déjà les cartes ✅).
  - **Jamais l'info par la couleur seule** → garder libellés texte sur les tags source/état (déjà ✅).
  - Contraste **≥ 4.5:1** ; focus visibles ; `prefers-reduced-motion` ; transitions hover 150–300 ms.
- **Checklist pré-livraison** : icônes en **SVG (Lucide/Heroicons), pas d'emoji** ; `cursor-pointer` sur tout cliquable ; responsive testé **375 / 768 / 1024 / 1440**.

---

## 5. Outil n°2 — MCP **magic** (21st.dev)

Génère des composants **React + Tailwind/shadcn**. Comme on est en **CSS maison**, on l'utilise pour :
1. **Inspiration / patterns** : voir comment 21st structure une carte, une toolbar, une table, un empty state.
2. **Récupérer la logique/markup**, puis **retraduire dans nos `.ds-*`** (remplacer les classes Tailwind par nos tokens). **Ne PAS importer Tailwind ni coller le JSX tel quel.**

```
ToolSearch "magic 21st component"   # vérifier la présence des tools mcp__magic__*
```
Tools attendus (selon version) : inspiration / builder / refiner / logo-search. Workflow : demander une variante (« dense data table for a real-estate comparables tool, light, single green accent »), récupérer le rendu, **adapter** dans `globals.css` + composants.

> ⚠️ Si magic n'est pas chargé : demander à Vincent de relancer la session avec le serveur, ou continuer au skill + craft.

---

## 6. Boucle de validation (rapide, hors-ligne)

Le navigateur ne peut PAS atteindre le site live (egress), mais **localhost oui** :
```bash
cd /home/user/Vesper && npm run build && (PORT=3100 npm run start &) ; sleep 7
# puis Playwright (global) sur http://127.0.0.1:3100/<route> en 1024px ET 390px :
#   chromium executablePath: /opt/pw-browsers/chromium-1194/chrome-linux/chrome
#   import via createRequire('/opt/node22/lib/node_modules/playwright')
```
La page `/style` (pas de DB) rend en local sans `DATABASE_URL`. Envoyer les captures à Vincent (`SendUserFile`) avant toute migration.

---

## 7. Plan de migration Vesper (après validation du style)

Ordre conseillé (du moins risqué au cœur du produit) :
1. **`/style`** : compléter les primitives manquantes (§3).
2. **Dashboard** `src/app/page.tsx` : topbar, liste des recherches, runs → `.ds-*`. Petit, forte visibilité.
3. **Formulaire** `src/app/search/new/page.tsx` (+ `ZonePicker.tsx`) : Field/Chip/Toolbar.
4. **Page run** `src/app/runs/[id]/page.tsx` : **le cœur** — KPI, Card Analyse, **Table dense** des comparables, barre d'export. (Garder le responsive cartes mobile déjà fait.)
5. **Tuer les `style={{…}}` inline** au passage (c'est eux qui font le côté « vibe coding »).
6. Quand stable → **promouvoir les tokens `.ds-*` en base globale** et **porter sur BBIscout**.

**Règle de migration :** une page à la fois, build vert, capture avant/après, validation Vincent, commit. Ne jamais pousser une page cassée (CLAUDE.md §9).

---

## 8. Questions ouvertes pour Vincent (à trancher en début de session design)

1. **Police des chiffres** : Inter partout, ou **mono dédié** (Fira Code / IBM Plex Mono) pour les cellules €/m², prix, surfaces ?
2. **Couleur** : on garde le **vert BBI** comme accent unique, ou on explore une 2ᵉ couleur de marque (ex. bleu institutionnel) ?
3. **Niveau de densité** : la base actuelle (13.5px / 34px) te va, ou plus aéré / plus compact ?
4. **Référence** : un screenshot 21st.dev (ou autre) d'un écran dont tu aimes le style = cible visuelle.
