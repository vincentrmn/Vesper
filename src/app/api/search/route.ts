import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, query } from "@/lib/db";
import { runSearch, SearchFilters } from "@/lib/search";

export const dynamic = "force-dynamic";

// GET /api/search?zone=L9-...&type=apartment&minSurface=...&targetSurface=...
export async function GET(req: NextRequest) {
  await ensureSchema();
  const sp = req.nextUrl.searchParams;
  const zoneLocCode = sp.get("zone");
  const propertyType = (sp.get("type") as "house" | "apartment") || "apartment";
  if (!zoneLocCode) {
    return NextResponse.json({ error: "zone requis" }, { status: 400 });
  }
  const num = (k: string) => {
    const v = sp.get(k);
    return v != null && v !== "" ? Number(v) : undefined;
  };
  const filters: SearchFilters = {
    zoneLocCode,
    propertyType,
    minSurface: num("minSurface"),
    maxSurface: num("maxSurface"),
    minRooms: num("minRooms"),
    minPrice: num("minPrice"),
    maxPrice: num("maxPrice"),
    targetSurface: num("targetSurface"),
  };
  try {
    const result = await runSearch(filters);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}

// GET zones list helper via /api/search?zones=1
