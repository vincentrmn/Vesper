// Immotop — couverture des comparables uniquement (PAS pour un chiffre officiel :
// données sales, cf. CLAUDE.md §0 et pièges §6). Pas de CPE accessible.
// Geo : /api-next/geography/autocomplete/?query=<commune> -> idComune (type 2).

import { NormalizedListing, numeric, int } from "./athome";

export const IMMOTOP_GEO =
  "https://www.immotop.lu/api-next/geography/autocomplete/";

export interface ImmotopGeo {
  id: string; // idComune
  label: string;
  type: number; // 2 = commune
  parents?: any;
}

function mapType(raw: string | undefined | null): "house" | "apartment" | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (s.includes("villa") || s.includes("hous") || s.includes("maison") || s.includes("casa"))
    return "house";
  if (s.includes("appart") || s.includes("apart") || s.includes("flat"))
    return "apartment";
  return null;
}

/** Normalise un listing Immotop (forme api-next search-list/listings). */
export function normalizeImmotop(raw: any): NormalizedListing | null {
  const re = raw?.realEstate ?? raw;
  const id = re?.id ?? raw?.id;
  if (id == null) return null;
  const props = re?.properties?.[0] ?? {};
  const loc = props?.location ?? {};
  return {
    source: "immotop",
    source_id: String(id),
    url: raw?.seo?.url ?? re?.url ?? null,
    property_type: mapType(props?.typology?.name ?? re?.typology?.name ?? props?.category?.name),
    price: numeric(re?.price?.value ?? props?.price?.value),
    surface: numeric(props?.surface ?? props?.surfaceValue),
    land: null,
    rooms: int(props?.bedRoomsNumber ?? props?.rooms),
    bathrooms: int(props?.bathrooms),
    cpe: null, // jamais de CPE Immotop (CLAUDE.md piège #2)
    state: props?.condition ?? null,
    lat: numeric(loc?.latitude),
    lng: numeric(loc?.longitude),
    is_new: null, // isNew non fiable (CLAUDE.md piège #1) -> ignoré
    raw,
  };
}
