import { NextRequest, NextResponse } from "next/server";
import { pool, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/fix-commune-tokens { secret, communes: [{slug, hkey}] }
 *
 * Corrige le token atHome (`q_code`) des communes nationales. Le seed initial a
 * lu le bucket `towns` (niveau 9) de l'API suggest et, pour une commune, a pris
 * le « town » dont name==L7 — or pour les communes FUSIONNÉES ce town de niveau 9
 * est un fantôme qui ne renvoie AUCUNE annonce (ex. Rosport-Mompach `fb5f7b2b`,
 * Käerjeng `dd216047` → total:0). Les annonces sont rattachées à l'entrée
 * `urbandistricts` (niveau 7, la vraie commune : `725340c1`, `d77bd736` → des
 * dizaines de biens).
 *
 * atHome résout la localisation uniquement sur `q` (le hkey) ; `loc` est
 * cosmétique. On ne met donc à jour QUE `q_code` (loc_code inchangé) → les
 * configs sauvegardées et les sélections du ZonePicker continuent de matcher.
 *
 * Seules les zones de niveau commune (parent_id IS NULL) sont touchées, jamais
 * `luxembourg` (token L9 fonctionnel + arbre de quartiers Lux-Ville dédié).
 */
export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const body = await req.json().catch(() => null);
    const expected = process.env.INGEST_SECRET || "";
    if (expected && body?.secret !== expected) {
      return NextResponse.json({ error: "secret invalide" }, { status: 401 });
    }
    const communes: { slug?: string; hkey?: string }[] = Array.isArray(body?.communes)
      ? body.communes
      : [];
    if (!communes.length) return NextResponse.json({ error: "communes requis" }, { status: 400 });

    let updated = 0;
    const changed: { slug: string; from: string | null; to: string }[] = [];
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const c of communes) {
        const slug = (c.slug || "").trim();
        const hkey = (c.hkey || "").trim();
        if (!slug || !hkey || slug === "luxembourg") continue;
        const r = await client.query<{ id: string; q_code: string | null }>(
          `UPDATE zones SET q_code = $2
             WHERE id = $1 AND parent_id IS NULL AND id <> 'luxembourg'
               AND (q_code IS DISTINCT FROM $2)
           RETURNING id, q_code`,
          [slug, hkey]
        );
        if (r.rowCount) {
          updated += r.rowCount;
          changed.push({ slug, from: null, to: hkey });
        }
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      client.release();
      throw e;
    }
    client.release();

    return NextResponse.json({ ok: true, received: communes.length, updated, changed });
  } catch (e: any) {
    console.error("[fix-commune-tokens]", e);
    return NextResponse.json({ error: e?.message ?? "erreur" }, { status: 500 });
  }
}
