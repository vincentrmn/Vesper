// Distribution & fourchette d'estimation (méthodo CLAUDE.md §5).

export interface Distribution {
  n: number;
  min: number;
  p25: number;
  median: number;
  p75: number;
  max: number;
  mean: number;
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function distribution(values: number[]): Distribution | null {
  const clean = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (clean.length === 0) return null;
  const sum = clean.reduce((a, b) => a + b, 0);
  return {
    n: clean.length,
    min: clean[0],
    p25: percentile(clean, 0.25),
    median: percentile(clean, 0.5),
    p75: percentile(clean, 0.75),
    max: clean[clean.length - 1],
    mean: sum / clean.length,
  };
}

export type Confidence = "haute" | "moyenne" | "basse" | "insuffisante";

export interface EstimateInput {
  pricesM2: number[]; // €/m² des comparables
  prices: number[]; // prix absolus (utile maisons)
  propertyType: "house" | "apartment";
  surface?: number; // surface du bien à estimer
  observatoireDiscount?: number | null; // décote affiché→signé (ex 0.92)
  hasNotarial: boolean;
}

export interface EstimateResult {
  confidence: Confidence;
  nComps: number;
  // fourchette en €/m² (appliquée décote si dispo)
  lowM2: number | null;
  midM2: number | null;
  highM2: number | null;
  // fourchette en prix absolu si surface fournie
  lowTotal: number | null;
  midTotal: number | null;
  highTotal: number | null;
  notes: string[];
  basis: "eur_m2" | "absolu"; // base de raisonnement
}

/**
 * Fourchette honnête, jamais un chiffre magique (CLAUDE.md §0, §10).
 * - Apparts : raisonnement €/m² (médiane/P25-P75).
 * - Maisons : prix absolu privilégié (terrain rend le €/m² trompeur).
 * - Décote Observatoire appliquée affiché→signé si dispo.
 * - Confiance fonction du nb de comps, dispersion, présence de données notariales.
 */
export function estimate(input: EstimateInput): EstimateResult {
  const notes: string[] = [];
  const distM2 = distribution(input.pricesM2);
  const distAbs = distribution(input.prices);
  const n = distM2?.n ?? 0;

  let confidence: Confidence;
  if (n === 0) confidence = "insuffisante";
  else if (n < 4) confidence = "basse";
  else if (n < 10) confidence = "moyenne";
  else confidence = "haute";

  // Maisons : confiance plafonnée (comparables hétérogènes, CLAUDE.md §6.4).
  if (input.propertyType === "house" && confidence === "haute") {
    confidence = "moyenne";
    notes.push(
      "Maison : confiance plafonnée à moyenne (terrain hétérogène, €/m² trompeur)."
    );
  }

  if (!input.hasNotarial) {
    notes.push(
      "Pas de référence notariale (signée) pour cette commune : fourchette en prix AFFICHÉ, non en valeur."
    );
  }

  const discount = input.observatoireDiscount ?? null;
  if (discount != null) {
    notes.push(
      `Décote affiché→signé Observatoire appliquée : ×${discount.toFixed(2)}.`
    );
  }

  const apply = (v: number | undefined | null): number | null =>
    v == null || !Number.isFinite(v)
      ? null
      : Math.round((discount != null ? v * discount : v));

  const basis: "eur_m2" | "absolu" =
    input.propertyType === "house" ? "absolu" : "eur_m2";

  // €/m²
  const lowM2 = apply(distM2?.p25);
  const midM2 = apply(distM2?.median);
  const highM2 = apply(distM2?.p75);

  // Prix absolu
  let lowTotal: number | null = null;
  let midTotal: number | null = null;
  let highTotal: number | null = null;

  if (basis === "absolu" && distAbs) {
    // maison : fourchette large P25–P75 du prix absolu
    lowTotal = apply(distAbs.p25);
    midTotal = apply(distAbs.median);
    highTotal = apply(distAbs.p75);
  } else if (input.surface && distM2) {
    lowTotal = lowM2 != null ? Math.round(lowM2 * input.surface) : null;
    midTotal = midM2 != null ? Math.round(midM2 * input.surface) : null;
    highTotal = highM2 != null ? Math.round(highM2 * input.surface) : null;
  }

  return {
    confidence,
    nComps: n,
    lowM2,
    midM2,
    highM2,
    lowTotal,
    midTotal,
    highTotal,
    notes,
    basis,
  };
}
