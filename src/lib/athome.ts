// atHome — seed géo national + normalisation (CLAUDE.md §4).
// L'API suggest sert les tokens de recherche directement :
//   GET https://new-api-lh.prd.athome.lu/lh/v2/suggest?query=<txt>&site=lu_at_home
//   -> data.locations.towns[].{ name, hkey, level, slug, levels{L2,L4,L7,L9}, slugs, lat, lon }
//   hkey = token `q` atHome ; loc_code = L<level>-<slug> ; L7 = commune, L9 = localité.

export const ATHOME_SUGGEST = "https://new-api-lh.prd.athome.lu/lh/v2/suggest";
export const ATHOME_SITE = "lu_at_home"; // obligatoire (athomelu -> 500)

export const ATHOME_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Accept: "application/json",
  Origin: "https://www.athome.lu",
  Referer: "https://www.athome.lu/",
};

export interface SuggestTown {
  name: string;
  hkey: string;
  level: number;
  slug: string;
  levels?: Record<string, string>; // { L2, L4, L7, L9 }
  slugs?: Record<string, string>;
  lat?: number;
  lon?: number;
}

export interface SeedZone {
  loc_code: string;
  q_code: string;
  name: string;
  level: number;
  commune: string | null;
  commune_slug: string | null;
  region: string | null;
  country: string | null;
  lat: number | null;
  lon: number | null;
}

/** Appelle l'API suggest atHome pour une chaîne donnée. */
export async function suggest(query: string): Promise<SuggestTown[]> {
  const url = `${ATHOME_SUGGEST}?query=${encodeURIComponent(
    query
  )}&site=${ATHOME_SITE}`;
  const res = await fetch(url, { headers: ATHOME_HEADERS });
  if (!res.ok) throw new Error(`suggest ${query} -> ${res.status}`);
  const json: any = await res.json();
  const towns: SuggestTown[] = json?.data?.locations?.towns ?? [];
  return towns;
}

/** Ne garde que le Luxembourg (le suggest renvoie aussi DE/BE/FR frontaliers). */
export function isLuxembourg(t: SuggestTown): boolean {
  return (t.levels?.L2 ?? "").toLowerCase() === "luxembourg";
}

/** Convertit un town suggest en zone seed (loc_code = L<level>-<slug>). */
export function townToZone(t: SuggestTown): SeedZone {
  return {
    loc_code: `L${t.level}-${t.slug}`,
    q_code: t.hkey,
    name: t.name,
    level: t.level,
    commune: t.levels?.L7 ?? (t.level === 7 ? t.name : null),
    commune_slug: t.slugs?.L7 ?? (t.level === 7 ? t.slug : null),
    region: t.levels?.L4 ?? null,
    country: t.levels?.L2 ?? null,
    lat: t.lat ?? null,
    lon: t.lon ?? null,
  };
}

// --- Normalisation d'une annonce atHome (SRP listing) vers notre modèle ---

export interface NormalizedListing {
  source: "athome" | "immotop";
  source_id: string;
  url: string | null;
  property_type: "house" | "apartment" | null;
  price: number | null;
  surface: number | null;
  land: number | null;
  rooms: number | null;
  bathrooms: number | null;
  cpe: string | null;
  state: string | null;
  lat: number | null;
  lng: number | null;
  is_new: boolean | null;
  raw: any;
}

function mapType(raw: string | undefined | null): "house" | "apartment" | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (s.includes("house") || s.includes("maison")) return "house";
  if (s.includes("flat") || s.includes("apart") || s.includes("appart"))
    return "apartment";
  return null;
}

/** Normalise un listing brut atHome (forme SRP). Tolérant aux champs absents. */
export function normalizeAthome(raw: any): NormalizedListing | null {
  const id = raw?.id ?? raw?.uuid ?? raw?.immoId;
  if (id == null) return null;
  const geo = raw?.geo ?? raw?.location ?? {};
  return {
    source: "athome",
    source_id: String(id),
    url: raw?.url ?? (raw?.slug ? `https://www.athome.lu/${raw.slug}` : null),
    property_type: mapType(raw?.immoType ?? raw?.type ?? raw?.propertyType),
    price: numeric(raw?.price ?? raw?.priceValue),
    surface: numeric(raw?.surface ?? raw?.livingSurface ?? raw?.characteristic?.surface),
    land: numeric(raw?.landSurface ?? raw?.groundSurface),
    rooms: int(raw?.bedrooms ?? raw?.numberOfBedrooms ?? raw?.characteristic?.bedrooms),
    bathrooms: int(raw?.bathrooms ?? raw?.numberOfBathrooms),
    cpe: raw?.energyClass ?? raw?.cpe ?? raw?.energy?.class ?? null,
    state: raw?.condition ?? raw?.state ?? null,
    lat: numeric(geo?.lat ?? geo?.latitude ?? raw?.lat),
    lng: numeric(geo?.lon ?? geo?.lng ?? geo?.longitude ?? raw?.lon),
    is_new: raw?.isNew ?? null,
    raw,
  };
}

export function numeric(v: any): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? parseFloat(v.replace(/[^\d.]/g, "")) : Number(v);
  return Number.isFinite(n) ? n : null;
}
export function int(v: any): number | null {
  const n = numeric(v);
  return n == null ? null : Math.round(n);
}
