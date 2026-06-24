// Seed géo national one-shot (CLAUDE.md §4).
// Boucle l'API suggest atHome sur des préfixes a..z, filtre Luxembourg,
// dédup sur hkey, upsert dans `zones`. À lancer depuis un env qui atteint atHome
// (Railway / local hors proxy restrictif) : `npm run seed:geo`.

import { ensureSchema, query, getPool } from "../src/lib/db";
import { suggest, isLuxembourg, townToZone } from "../src/lib/athome";

const PREFIXES = "abcdefghijklmnopqrstuvwxyz".split("");

async function main() {
  await ensureSchema();
  const seen = new Set<string>();
  let inserted = 0;

  for (const p of PREFIXES) {
    try {
      const towns = await suggest(p);
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
             q_code=EXCLUDED.q_code, name=EXCLUDED.name, lat=EXCLUDED.lat, lon=EXCLUDED.lon`,
          [z.loc_code, z.q_code, z.name, z.level, z.commune, z.commune_slug,
           z.region, z.country, z.lat, z.lon]
        );
        inserted++;
      }
      process.stdout.write(`  [${p}] ${towns.length} suggestions, ${inserted} zones cumulées\n`);
    } catch (e: any) {
      process.stdout.write(`  [${p}] erreur: ${e?.message ?? e}\n`);
    }
  }

  console.log(`\nSeed terminé : ${inserted} upserts, ${seen.size} hkeys distincts.`);
  await getPool().end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
