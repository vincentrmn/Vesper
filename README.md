# Sextant

Outil interne d'**estimation / contexte marché** immobilier luxembourgeois pour Shawna (agente).
Fork de la plomberie BBIscout (`vincentrmn/scout`), recentré sur l'estimation (pas de scoring de flip).

> **Honnêteté méthodologique (non négociable).** Sextant estime le prix **affiché** à partir
> d'annonces (atHome + Immotop) et le confronte au prix **signé** (actes notariés via
> l'Observatoire de l'Habitat). Le livrable n'est pas un nombre magique : c'est un tableau de
> comparables interprété + une fourchette honnête avec confiance. Cf. `CLAUDE.md`.

## Stack

- **Next.js 14** (App Router, `src/`), CSS maison (aucun framework).
- **Postgres** (Railway) — schéma idempotent via `ensureSchema()`.
- **Scrapers n8n** (Railway) → poussent les annonces dans `/api/ingest`.
- Déploiement Railway auto sur push `main`.

## Architecture

| Fichier | Rôle |
|---|---|
| `src/lib/db.ts` | Pool Postgres + `ensureSchema()` (zones, listings, snapshots, observatoire, runs). |
| `src/lib/athome.ts` | API suggest (seed géo national, tokens `hkey`/`q`) + normalisation listings atHome. |
| `src/lib/immotop.ts` | Normalisation listings Immotop (couverture comparables, pas de CPE). |
| `src/lib/dedup.ts` | Dédup cross-source (lat/lng <150 m + surface ±2 + prix ±3 %, jamais intra-source). |
| `src/lib/observatoire.ts` | Référence commune (annoncé vs signé) + décote + garde-fou aberrants. |
| `src/lib/stats.ts` | Distribution (min/P25/médiane/P75/max) + fourchette d'estimation + confiance. |
| `src/lib/search.ts` | Service produit : comparables → dédup → distribution → Observatoire → fourchette. |
| `src/app/api/ingest` | Upsert listings + snapshots (appelé par n8n, auth `X-Ingest-Secret`). |
| `src/app/api/seed` | Seed géo national depuis l'API suggest atHome (tourne côté serveur). |
| `src/app/api/zones` | Autocomplete commune/localité depuis le seed local. |
| `src/app/api/search` | Lance une estimation. |
| `src/app/page.tsx` | UI : recherche, fourchette, distribution, comparatif Observatoire, tableau. |

## Mise en route

```bash
npm install
cp .env.example .env.local   # renseigner DATABASE_URL, INGEST_SECRET
npm run build
npm start
```

### Seed géo (une fois, depuis un environnement qui atteint atHome)

```bash
npm run seed:geo
# ou via HTTP (le serveur Railway atteint atHome) :
curl -X POST $PUBLIC_APP_URL/api/seed -H "X-Ingest-Secret: $INGEST_SECRET"
```

### Ingestion (scrapers n8n)

```bash
curl -X POST $PUBLIC_APP_URL/api/ingest \
  -H "X-Ingest-Secret: $INGEST_SECRET" -H "Content-Type: application/json" \
  -d '{"source":"athome","zone_loc_code":"L7-esch-sur-alzette","listings":[ ... ]}'
```

## État actuel

- **Phase 1 (MVP)** posée et testée de bout en bout en local (Postgres + données mock) :
  ingest → dédup cross-source → distribution → garde-fou aberrants → comparatif Observatoire
  → fourchette + confiance, rendu dans l'UI.
- **À brancher** : seed géo national réel (atHome bloqué depuis l'environnement de dev, à lancer
  depuis Railway), scrapers n8n atHome/Immotop, peuplement de la table `observatoire` par commune.

## Garde-fous hérités (cf. `CLAUDE.md` §6)

- Immotop `isNew` non fiable → ignoré ; filtrage par **prix vs Observatoire**, pas par flags.
- Pas de CPE Immotop ; CPE seulement côté atHome.
- Affiché ≠ signé : décote Observatoire appliquée et affichée partout.
- Maisons : €/m² trompeur (terrain) → raisonnement en prix absolu, confiance plafonnée.
