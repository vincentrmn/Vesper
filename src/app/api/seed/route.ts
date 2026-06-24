import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, query } from "@/lib/db";
import { suggest, isLuxembourg, townToZone } from "@/lib/athome";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/seed  body: { queries?: string[] }  (auth X-Ingest-Secret)
// Boucle l'API suggest atHome sur des préfixes/communes, dédup sur hkey,
// filtre Luxembourg, upsert dans `zones`. Tourne côté serveur (Railway atteint atHome).
// Cf. CLAUDE.md §4 : seed one-shot, pas de scraping page-par-page.

const DEFAULT_PREFIXES = "abcdefghijklmnopqrstuvwxyz".split("");

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-ingest-secret");
  if (!process.env.INGEST_SECRET || secret !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await ensureSchema();

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* corps vide accepté */
  }
  const queries: string[] = Array.isArray(body.queries) && body.queries.length
    ? body.queries
    : DEFAULT_PREFIXES;

  const seen = new Set<string>();
  let inserted = 0;
  const errors: string[] = [];

  for (const q of queries) {
    try {
      const towns = await suggest(q);
      for (const t of towns) {
        if (!isLuxembourg(t)) continue;
        if (seen.has(t.hkey)) continue;
        seen.add(t.hkey);
        const z = townToZone(t);
        await query(
          `INSERT INTO zones
            (loc_code, q_code, name, level, commune, commune_slug, region, country, lat, lon)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (loc_code) DO UPDATE SET
             q_code=EXCLUDED.q_code, name=EXCLUDED.name, level=EXCLUDED.level,
             commune=EXCLUDED.commune, commune_slug=EXCLUDED.commune_slug,
             region=EXCLUDED.region, country=EXCLUDED.country,
             lat=EXCLUDED.lat, lon=EXCLUDED.lon`,
          [z.loc_code, z.q_code, z.name, z.level, z.commune, z.commune_slug,
           z.region, z.country, z.lat, z.lon]
        );
        inserted++;
      }
    } catch (e: any) {
      errors.push(`${q}: ${e?.message ?? e}`);
    }
  }

  return NextResponse.json({ ok: true, communes: inserted, distinct: seen.size, errors });
}
