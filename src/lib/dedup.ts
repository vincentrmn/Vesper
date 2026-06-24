// Dédup cross-source héritée de BBIscout (lib/dedup.ts).
// Règle : deux annonces de SOURCES DIFFÉRENTES sont le même bien si
//   distance(lat/lng) < 150 m  ET  |surface| <= 2 m²  ET  |prix| <= 3 %.
// On ne fusionne JAMAIS deux annonces de la même source (intra-source interdit).

export interface DedupListing {
  id?: number | string;
  source: string;
  price?: number | null;
  surface?: number | null;
  lat?: number | null;
  lng?: number | null;
}

const EARTH_R = 6371000; // m

export function haversine(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isSameBien(a: DedupListing, b: DedupListing): boolean {
  if (a.source === b.source) return false; // jamais intra-source
  if (
    a.lat == null ||
    a.lng == null ||
    b.lat == null ||
    b.lng == null ||
    a.surface == null ||
    b.surface == null ||
    a.price == null ||
    b.price == null
  ) {
    return false;
  }
  if (haversine(a.lat, a.lng, b.lat, b.lng) > 150) return false;
  if (Math.abs(a.surface - b.surface) > 2) return false;
  const priceDelta = Math.abs(a.price - b.price) / Math.max(a.price, b.price);
  if (priceDelta > 0.03) return false;
  return true;
}

export interface DedupGroup<T extends DedupListing> {
  primary: T; // l'annonce retenue (atHome prioritaire car CPE dispo)
  duplicates: T[]; // les autres annonces du même bien
  sources: string[];
}

/**
 * Regroupe une liste d'annonces cross-source. atHome est préféré comme primary
 * (CPE/fiche détail disponibles ; cf. CLAUDE.md piège #2).
 */
export function dedupCrossSource<T extends DedupListing>(
  listings: T[]
): DedupGroup<T>[] {
  const groups: DedupGroup<T>[] = [];
  for (const l of listings) {
    let placed = false;
    for (const g of groups) {
      if (
        g.duplicates.concat(g.primary).some((m) => isSameBien(m, l))
      ) {
        // n'ajoute que si la source n'est pas déjà présente (pas de fusion intra-source)
        if (!g.sources.includes(l.source)) {
          g.duplicates.push(l);
          g.sources.push(l.source);
          if (l.source === "athome" && g.primary.source !== "athome") {
            g.duplicates.push(g.primary);
            g.primary = l;
          }
          placed = true;
          break;
        }
      }
    }
    if (!placed) {
      groups.push({ primary: l, duplicates: [], sources: [l.source] });
    }
  }
  // retire le primary de la liste duplicates s'il y a été repoussé
  for (const g of groups) {
    g.duplicates = g.duplicates.filter((d) => d !== g.primary);
  }
  return groups;
}
