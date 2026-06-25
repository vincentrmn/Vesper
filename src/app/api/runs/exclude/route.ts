import { NextRequest, NextResponse } from "next/server";
import { pool, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/runs/exclude { runId, id, excluded }
 * Inclure/exclure un comparable de l'étude (donc de la distribution €/m²).
 * Met à jour runs.excluded_ids (tableau d'ids). Idempotent.
 */
export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const body = await req.json().catch(() => null);
    const runId = body?.runId;
    const id = body?.id;
    const excluded = !!body?.excluded;
    if (!runId || !id) return NextResponse.json({ error: "runId et id requis" }, { status: 400 });

    const cur = await pool.query<{ excluded_ids: any }>(
      `SELECT excluded_ids FROM runs WHERE id = $1`,
      [runId]
    );
    if (!cur.rows.length) return NextResponse.json({ error: "run introuvable" }, { status: 404 });
    const set = new Set<string>(Array.isArray(cur.rows[0].excluded_ids) ? cur.rows[0].excluded_ids : []);
    if (excluded) set.add(String(id));
    else set.delete(String(id));
    const next = Array.from(set);
    await pool.query(`UPDATE runs SET excluded_ids = $2 WHERE id = $1`, [runId, JSON.stringify(next)]);
    return NextResponse.json({ ok: true, excluded_ids: next });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "erreur" }, { status: 500 });
  }
}
