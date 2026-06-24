// Observatoire de l'Habitat (data.public.lu) — actif central de Sextant.
// Publie par commune le prix annoncé (affiché) ET le prix de vente notarié (signé).
// La décote affiché→signé locale est LE garde-fou prix (CLAUDE.md §0, §5.3).

import { query } from "./db";

export interface ObservatoireRef {
  commune: string;
  commune_slug: string;
  property_type: string;
  period: string;
  announced_eur_m2: number | null;
  signed_eur_m2: number | null;
  n_transactions: number | null;
  /** décote affiché→signé = signé / annoncé (ex 0.92 = -8 %). null si incalculable. */
  discount: number | null;
}

export async function getObservatoireRef(
  communeSlug: string,
  propertyType: "house" | "apartment"
): Promise<ObservatoireRef | null> {
  const { rows } = await query<any>(
    `SELECT commune, commune_slug, property_type, period,
            announced_eur_m2, signed_eur_m2, n_transactions
       FROM observatoire
      WHERE commune_slug = $1 AND property_type = $2
      ORDER BY period DESC
      LIMIT 1`,
    [communeSlug, propertyType]
  );
  let row = rows[0];
  if (!row) {
    // fallback : n'importe quel type pour cette commune (mieux que rien, signalé en UI)
    const alt = await query<any>(
      `SELECT commune, commune_slug, property_type, period,
              announced_eur_m2, signed_eur_m2, n_transactions
         FROM observatoire WHERE commune_slug = $1
         ORDER BY period DESC LIMIT 1`,
      [communeSlug]
    );
    row = alt.rows[0];
  }
  if (!row) return null;

  const announced = row.announced_eur_m2 != null ? Number(row.announced_eur_m2) : null;
  const signed = row.signed_eur_m2 != null ? Number(row.signed_eur_m2) : null;
  const discount =
    announced && signed && announced > 0 ? signed / announced : null;

  return {
    commune: row.commune,
    commune_slug: row.commune_slug,
    property_type: row.property_type,
    period: row.period,
    announced_eur_m2: announced,
    signed_eur_m2: signed,
    n_transactions: row.n_transactions != null ? Number(row.n_transactions) : null,
    discount,
  };
}

/**
 * Plafonne un comparable jugé aberrant vs la référence Observatoire.
 * Un comp >> réf signée = neuf/luxe à écarter d'une estimation d'ancien
 * (CLAUDE.md §5.5 garde-fous hérités).
 */
export function isAberrant(
  compEurM2: number,
  ref: ObservatoireRef | null,
  factor = 1.6
): boolean {
  if (!ref) return false;
  const base = ref.signed_eur_m2 ?? ref.announced_eur_m2;
  if (!base) return false;
  return compEurM2 > base * factor;
}
