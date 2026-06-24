// Service de recherche / estimation — assemble comparables, dédup, distribution,
// Observatoire et fourchette. C'est le livrable produit (CLAUDE.md §5).

import { query } from "./db";
import { dedupCrossSource } from "./dedup";
import { distribution, estimate, Distribution, EstimateResult } from "./stats";
import { getObservatoireRef, isAberrant, ObservatoireRef } from "./observatoire";

export interface SearchFilters {
  zoneLocCode: string;
  propertyType: "house" | "apartment";
  minSurface?: number;
  maxSurface?: number;
  minRooms?: number;
  minPrice?: number;
  maxPrice?: number;
  targetSurface?: number; // surface du bien à estimer
}

export interface Comparable {
  id: number;
  source: string;
  url: string | null;
  property_type: string | null;
  price: number | null;
  surface: number | null;
  land: number | null;
  rooms: number | null;
  bathrooms: number | null;
  cpe: string | null;
  state: string | null;
  eur_m2: number | null;
  also_on: string[]; // autres sources du même bien (dédup)
  aberrant: boolean;
}

export interface SearchResult {
  zone: any;
  filters: SearchFilters;
  comparables: Comparable[];
  distributionM2: Distribution | null;
  distributionAbs: Distribution | null;
  observatoire: ObservatoireRef | null;
  estimate: EstimateResult;
  counts: { raw: number; afterDedup: number; aberrant: number };
}

export async function runSearch(filters: SearchFilters): Promise<SearchResult> {
  const zoneRows = await query<any>(
    `SELECT * FROM zones WHERE loc_code = $1`,
    [filters.zoneLocCode]
  );
  const zone = zoneRows.rows[0] ?? null;
  const communeSlug = zone?.commune_slug ?? zone?.loc_code?.replace(/^L\d+-/, "");

  // Comparables bruts depuis la DB (alimentée par les scrapers n8n via /api/ingest).
  const conds: string[] = ["zone_loc_code = $1", "property_type = $2"];
  const params: any[] = [filters.zoneLocCode, filters.propertyType];
  let i = 3;
  if (filters.minSurface != null) { conds.push(`surface >= $${i++}`); params.push(filters.minSurface); }
  if (filters.maxSurface != null) { conds.push(`surface <= $${i++}`); params.push(filters.maxSurface); }
  if (filters.minRooms != null) { conds.push(`rooms >= $${i++}`); params.push(filters.minRooms); }
  if (filters.minPrice != null) { conds.push(`price >= $${i++}`); params.push(filters.minPrice); }
  if (filters.maxPrice != null) { conds.push(`price <= $${i++}`); params.push(filters.maxPrice); }

  const { rows } = await query<any>(
    `SELECT id, source, url, property_type, price, surface, land, rooms,
            bathrooms, cpe, state, lat, lng
       FROM listings
      WHERE ${conds.join(" AND ")}
      ORDER BY last_seen DESC
      LIMIT 500`,
    params
  );

  const rawCount = rows.length;

  // Dédup cross-source (atHome prioritaire).
  const groups = dedupCrossSource(
    rows.map((r) => ({
      id: r.id,
      source: r.source,
      price: r.price != null ? Number(r.price) : null,
      surface: r.surface != null ? Number(r.surface) : null,
      lat: r.lat != null ? Number(r.lat) : null,
      lng: r.lng != null ? Number(r.lng) : null,
      _row: r,
    }))
  );

  const ref = await getObservatoireRef(communeSlug, filters.propertyType);

  const comparables: Comparable[] = [];
  for (const g of groups) {
    const r = (g.primary as any)._row;
    const price = r.price != null ? Number(r.price) : null;
    const surface = r.surface != null ? Number(r.surface) : null;
    const eur_m2 = price && surface && surface > 0 ? price / surface : null;
    const aberrant = eur_m2 != null ? isAberrant(eur_m2, ref) : false;
    comparables.push({
      id: r.id,
      source: r.source,
      url: r.url,
      property_type: r.property_type,
      price,
      surface,
      land: r.land != null ? Number(r.land) : null,
      rooms: r.rooms,
      bathrooms: r.bathrooms,
      cpe: r.cpe,
      state: r.state,
      eur_m2: eur_m2 != null ? Math.round(eur_m2) : null,
      also_on: g.sources.filter((s) => s !== r.source),
      aberrant,
    });
  }

  // Garde-fou : on exclut les comps aberrants du calcul de fourchette (mais on les affiche).
  const kept = comparables.filter((c) => !c.aberrant);
  const pricesM2 = kept.map((c) => c.eur_m2!).filter((v) => v != null) as number[];
  const prices = kept.map((c) => c.price!).filter((v) => v != null) as number[];

  const est = estimate({
    pricesM2,
    prices,
    propertyType: filters.propertyType,
    surface: filters.targetSurface,
    observatoireDiscount: ref?.discount ?? null,
    hasNotarial: !!ref?.signed_eur_m2,
  });

  return {
    zone,
    filters,
    comparables,
    distributionM2: distribution(pricesM2),
    distributionAbs: distribution(prices),
    observatoire: ref,
    estimate: est,
    counts: {
      raw: rawCount,
      afterDedup: comparables.length,
      aberrant: comparables.filter((c) => c.aberrant).length,
    },
  };
}
