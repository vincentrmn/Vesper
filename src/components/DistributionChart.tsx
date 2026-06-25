"use client";
// Graphique de distribution des €/m² affichés, construit avec visx.
// Honnêteté (CLAUDE.md §0) : on montre l'HISTOGRAMME réel (axe Y = nombre de
// biens) + une densité lissée (KDE) par-dessus — pas une gaussienne
// paramétrique qui supposerait une normalité qu'on n'a pas. Un « rug » épais
// rappelle chaque comparable. Sous ~4 biens : histogramme seul, pas de courbe.
import { scaleLinear } from "@visx/scale";
import { AreaClosed, Bar, Line } from "@visx/shape";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { Group } from "@visx/group";
import { curveBasis } from "@visx/curve";

type Quartiles = { min: number; p25: number; median: number; p75: number; max: number };

const gauss = (u: number) => Math.exp(-0.5 * u * u) / Math.sqrt(2 * Math.PI);

export default function DistributionChart({
  values,
  q,
  signed,
  fmt,
}: {
  values: number[];
  q: Quartiles;
  signed?: number | null;
  fmt: (n: number) => string;
}) {
  const vals = values.filter((v) => typeof v === "number" && v > 0).sort((a, b) => a - b);
  const n = vals.length;

  const W = 720, H = 300;
  const m = { top: 44, right: 18, bottom: 66, left: 46 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;

  // Domaine x : englobe min/max + la référence signée.
  let lo = Math.min(q.min, signed ?? Infinity);
  let hi = Math.max(q.max, signed ?? -Infinity);
  if (!(hi > lo)) { lo = q.min - 1; hi = q.max + 1; }
  const pad = (hi - lo) * 0.06 || 1;
  lo -= pad; hi += pad;

  // Histogramme (comptes réels).
  const B = Math.min(Math.max(Math.ceil(Math.sqrt(n)) + 1, 6), 14);
  const bw = (hi - lo) / B;
  const bins = Array.from({ length: B }, (_, i) => ({ x0: lo + i * bw, x1: lo + (i + 1) * bw, c: 0 }));
  vals.forEach((v) => { const i = Math.min(B - 1, Math.max(0, Math.floor((v - lo) / bw))); bins[i].c++; });
  const maxCount = Math.max(1, ...bins.map((b) => b.c));

  // Densité lissée (KDE Silverman), exprimée en « biens attendus par tranche »
  // pour partager l'axe Y avec l'histogramme.
  const mean = vals.reduce((a, b) => a + b, 0) / (n || 1);
  const std = n > 1 ? Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  const showCurve = n >= 4 && std > 0;
  const h = 1.06 * std * Math.pow(n, -1 / 5) || 1;
  const K = 120;
  const curve = Array.from({ length: K + 1 }, (_, i) => {
    const x = lo + (i / K) * (hi - lo);
    const dens = vals.reduce((s, vi) => s + gauss((x - vi) / h), 0) / (n * h);
    return { x, y: dens * n * bw };
  });
  const yMax = Math.max(maxCount, showCurve ? Math.max(...curve.map((p) => p.y)) : 0) * 1.12;

  const xScale = scaleLinear({ domain: [lo, hi], range: [0, iw] });
  const yScale = scaleLinear({ domain: [0, yMax], range: [ih, 0], nice: true });

  const accent = "var(--ds-accent)";
  const accentInk = "var(--ds-accent-ink)";
  const ink = "var(--ds-ink)";
  const inkSoft = "var(--ds-ink-soft)";
  const line2 = "var(--ds-line-2)";

  const kEur = (v: number) => `${Math.round(v / 100) / 10}k`;

  // Étiquette de valeur (petit cartouche) au sommet d'un trait vertical.
  const Tag = ({ x, label, value, color, dy = 0 }: { x: number; label: string; value: string; color: string; dy?: number }) => (
    <g transform={`translate(${x}, ${-26 + dy})`}>
      <text textAnchor="middle" fontSize={10} fontWeight={700} fill={inkSoft}
        style={{ textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</text>
      <text y={14} textAnchor="middle" fontSize={13} fontWeight={800} fill={color}
        style={{ fontVariantNumeric: "tabular-nums" }}>{value}</text>
    </g>
  );

  // Si médiane et réf signée sont proches, on décale le cartouche signé vers le haut.
  const close = signed != null && Math.abs(xScale(q.median) - xScale(signed)) < 86;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", height: "auto", overflow: "visible" }}
      role="img" aria-label="Distribution des prix au m² affichés">
      <Group left={m.left} top={m.top}>
        <defs>
          {/* Clip : la bande P25–P75 épouse la courbe au lieu d'être un rectangle. */}
          <clipPath id="dc-iqr">
            <rect x={xScale(q.p25)} y={0} width={Math.max(0, xScale(q.p75) - xScale(q.p25))} height={ih} />
          </clipPath>
        </defs>

        {/* Histogramme réel (comptes) */}
        {bins.map((b, i) => {
          const x = xScale(b.x0); const w = Math.max(0, xScale(b.x1) - xScale(b.x0) - 1.5);
          const y = yScale(b.c);
          return <Bar key={i} x={x} y={y} width={w} height={ih - y} fill={accent} opacity={0.16} rx={2} />;
        })}

        {/* Densité lissée + bande P25–P75 clippée sur la courbe */}
        {showCurve && (
          <>
            <AreaClosed data={curve} x={(d) => xScale(d.x)} y={(d) => yScale(d.y)} yScale={yScale}
              curve={curveBasis} fill={accent} fillOpacity={0.12} stroke={accent} strokeWidth={1.75} />
            <g clipPath="url(#dc-iqr)">
              <AreaClosed data={curve} x={(d) => xScale(d.x)} y={(d) => yScale(d.y)} yScale={yScale}
                curve={curveBasis} fill={accent} fillOpacity={0.28} stroke="none" />
            </g>
          </>
        )}

        {/* Rug : un tick épais par comparable réel */}
        {vals.map((v, i) => (
          <line key={i} x1={xScale(v)} y1={ih} x2={xScale(v)} y2={ih - 11} stroke={accentInk} strokeWidth={2} opacity={0.85} />
        ))}

        {/* Médiane affichée */}
        <Line from={{ x: xScale(q.median), y: 0 }} to={{ x: xScale(q.median), y: ih }} stroke={accentInk} strokeWidth={2} />
        <Tag x={xScale(q.median)} label="Médiane" value={fmt(q.median)} color={accentInk} />

        {/* Référence Observatoire (prix signé) */}
        {signed != null && (
          <>
            <Line from={{ x: xScale(signed), y: 0 }} to={{ x: xScale(signed), y: ih }} stroke={ink} strokeWidth={1.6} strokeDasharray="5 3" />
            <Tag x={xScale(signed)} label="Signé" value={fmt(signed)} color={ink} dy={close ? -34 : 0} />
          </>
        )}

        {/* Axes */}
        <AxisLeft scale={yScale} numTicks={4} hideAxisLine tickStroke={line2}
          tickLabelProps={() => ({ fill: inkSoft, fontSize: 11, textAnchor: "end", dx: -2, dy: 3 })}
          label="Nombre de biens" labelProps={{ fill: inkSoft, fontSize: 11, fontWeight: 700, textAnchor: "middle" }} labelOffset={28} />
        <AxisBottom scale={xScale} top={ih} numTicks={6} stroke={line2} tickStroke={line2}
          tickFormat={(v) => kEur(v as number)}
          tickLabelProps={() => ({ fill: ink, fontSize: 11, fontWeight: 600, textAnchor: "middle", dy: 2 })}
          label="Prix affiché (€/m²)" labelProps={{ fill: inkSoft, fontSize: 11, fontWeight: 700, textAnchor: "middle" }} labelOffset={22} />

        {!showCurve && (
          <text x={iw / 2} y={12} textAnchor="middle" fontSize={12} fontStyle="italic" fill={inkSoft}>
            Trop peu de comparables pour une courbe fiable — histogramme et points réels seulement.
          </text>
        )}
      </Group>
    </svg>
  );
}
