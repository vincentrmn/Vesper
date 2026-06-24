import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, query } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/zones?q=esch  -> recherche dans le seed local (zones table)
export async function GET(req: NextRequest) {
  await ensureSchema();
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    // top communes par défaut
    const { rows } = await query(
      `SELECT loc_code, q_code, name, level, commune, region, lat, lon
         FROM zones ORDER BY name LIMIT 50`
    );
    return NextResponse.json({ zones: rows });
  }
  const { rows } = await query(
    `SELECT loc_code, q_code, name, level, commune, region, lat, lon
       FROM zones
      WHERE name ILIKE $1 OR commune ILIKE $1
      ORDER BY level ASC, name ASC
      LIMIT 50`,
    [`%${q}%`]
  );
  return NextResponse.json({ zones: rows });
}
