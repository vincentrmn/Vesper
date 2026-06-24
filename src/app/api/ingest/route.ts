import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, query } from "@/lib/db";
import { normalizeAthome, NormalizedListing } from "@/lib/athome";
import { normalizeImmotop } from "@/lib/immotop";

export const dynamic = "force-dynamic";

// Endpoint d'ingestion appelé par les scrapers n8n (atHome + Immotop).
// Upsert listings + snapshot prix (méthode BBIscout : upsert, snapshots, dédup en lecture).
// Auth simple via header X-Ingest-Secret == INGEST_SECRET.

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-ingest-secret");
  if (!process.env.INGEST_SECRET || secret !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await ensureSchema();

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const source: string = body.source;
  const zoneLocCode: string | null = body.zone_loc_code ?? null;
  const items: any[] = Array.isArray(body.listings) ? body.listings : [];
  if (source !== "athome" && source !== "immotop") {
    return NextResponse.json({ error: "source must be athome|immotop" }, { status: 400 });
  }

  let upserted = 0;
  let skipped = 0;
  for (const raw of items) {
    const n: NormalizedListing | null =
      source === "athome" ? normalizeAthome(raw) : normalizeImmotop(raw);
    if (!n || n.price == null) {
      skipped++;
      continue;
    }
    const { rows } = await query<{ id: number; price: string | null }>(
      `INSERT INTO listings
        (source, source_id, url, property_type, price, surface, land, rooms,
         bathrooms, cpe, state, lat, lng, zone_loc_code, is_new, raw, last_seen)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, now())
       ON CONFLICT (source, source_id) DO UPDATE SET
         url=EXCLUDED.url, price=EXCLUDED.price, surface=EXCLUDED.surface,
         land=EXCLUDED.land, rooms=EXCLUDED.rooms, bathrooms=EXCLUDED.bathrooms,
         cpe=EXCLUDED.cpe, state=EXCLUDED.state, lat=EXCLUDED.lat, lng=EXCLUDED.lng,
         zone_loc_code=COALESCE(EXCLUDED.zone_loc_code, listings.zone_loc_code),
         is_new=EXCLUDED.is_new, raw=EXCLUDED.raw, last_seen=now()
       RETURNING id, price`,
      [
        n.source, n.source_id, n.url, n.property_type, n.price, n.surface,
        n.land, n.rooms, n.bathrooms, n.cpe, n.state, n.lat, n.lng,
        zoneLocCode, n.is_new, n.raw,
      ]
    );
    const id = rows[0]?.id;
    if (id) {
      // snapshot uniquement si prix nouveau ou premier passage
      await query(
        `INSERT INTO snapshots (listing_id, price, surface)
         SELECT $1, $2, $3
         WHERE NOT EXISTS (
           SELECT 1 FROM snapshots s WHERE s.listing_id = $1
             AND s.price = $2 AND s.seen_at > now() - interval '1 day'
         )`,
        [id, n.price, n.surface]
      );
      upserted++;
    }
  }

  return NextResponse.json({ ok: true, upserted, skipped, received: items.length });
}
