import { Pool } from "pg";

// Pool partagé (réutilisé entre requêtes / hot-reload Next).
declare global {
  // eslint-disable-next-line no-var
  var _sextantPool: Pool | undefined;
}

export function getPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL manquant");
  }
  if (!global._sextantPool) {
    global._sextantPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Railway exige souvent SSL ; on tolère le certificat auto-signé.
      ssl: process.env.DATABASE_URL.includes("localhost")
        ? undefined
        : { rejectUnauthorized: false },
      max: 5,
    });
  }
  return global._sextantPool;
}

export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<{ rows: T[]; rowCount: number }> {
  const pool = getPool();
  const res = await pool.query(text, params);
  return { rows: res.rows as T[], rowCount: res.rowCount ?? 0 };
}

let schemaReady: Promise<void> | null = null;

/**
 * Crée le schéma si absent. Idempotent (méthode BBIscout : ensureSchema()).
 * - zones      : seed géo national atHome (loc_code, q_code/hkey, hiérarchie, lat/lon)
 * - listings   : comparables dédupliqués cross-source (atHome + Immotop)
 * - snapshots  : historique prix par annonce
 * - observatoire: référence par commune (prix annoncé vs prix signé notarial)
 */
export function ensureSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const pool = getPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS zones (
        loc_code    TEXT PRIMARY KEY,        -- L9-<slug> (ou L7-<slug> pour la commune)
        q_code      TEXT NOT NULL,           -- hkey atHome (token de recherche q)
        name        TEXT NOT NULL,
        level       INTEGER NOT NULL,        -- 7 = commune, 9 = localité
        commune     TEXT,                    -- L7 parent (commune)
        commune_slug TEXT,
        region      TEXT,                    -- L4 (canton)
        country     TEXT,                    -- L2
        lat         DOUBLE PRECISION,
        lon         DOUBLE PRECISION,
        immotop_id  TEXT,                    -- idComune Immotop (seedé séparément)
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS listings (
        id            BIGSERIAL PRIMARY KEY,
        source        TEXT NOT NULL,         -- 'athome' | 'immotop'
        source_id     TEXT NOT NULL,
        url           TEXT,
        property_type TEXT,                  -- 'house' | 'apartment'
        price         NUMERIC,
        surface       NUMERIC,               -- m² habitables
        land          NUMERIC,               -- m² terrain (maisons)
        rooms         INTEGER,               -- chambres
        bathrooms     INTEGER,
        cpe           TEXT,                   -- classe énergétique (atHome uniquement)
        state         TEXT,                   -- état déclaré
        lat           DOUBLE PRECISION,
        lng           DOUBLE PRECISION,
        zone_loc_code TEXT,                   -- commune/localité de rattachement
        is_new        BOOLEAN,                -- flag source (NON fiable, cf. CLAUDE.md)
        raw           JSONB,
        first_seen    TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_seen     TIMESTAMPTZ NOT NULL DEFAULT now(),
        dedup_key     TEXT,                   -- rempli après dédup cross-source
        UNIQUE (source, source_id)
      );
      CREATE INDEX IF NOT EXISTS idx_listings_zone ON listings (zone_loc_code);
      CREATE INDEX IF NOT EXISTS idx_listings_type ON listings (property_type);

      CREATE TABLE IF NOT EXISTS snapshots (
        id         BIGSERIAL PRIMARY KEY,
        listing_id BIGINT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
        price      NUMERIC,
        surface    NUMERIC,
        seen_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_snapshots_listing ON snapshots (listing_id);

      CREATE TABLE IF NOT EXISTS observatoire (
        commune          TEXT NOT NULL,
        commune_slug     TEXT NOT NULL,
        property_type    TEXT NOT NULL DEFAULT 'apartment', -- 'apartment' | 'house'
        period           TEXT NOT NULL,        -- ex '2025' ou '2025-S1'
        announced_eur_m2 NUMERIC,              -- prix annoncé moyen (affiché)
        signed_eur_m2    NUMERIC,              -- prix de vente notarié (signé)
        n_transactions   INTEGER,
        source           TEXT DEFAULT 'observatoire-habitat',
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (commune_slug, property_type, period)
      );

      CREATE TABLE IF NOT EXISTS runs (
        id         BIGSERIAL PRIMARY KEY,
        kind       TEXT NOT NULL,            -- 'athome' | 'immotop' | 'seed'
        loc_code   TEXT,
        status     TEXT NOT NULL DEFAULT 'running',
        meta       JSONB,
        started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        ended_at   TIMESTAMPTZ
      );
    `);
  })();
  return schemaReady;
}
