"use client";

import { useEffect, useRef, useState } from "react";

interface Zone {
  loc_code: string;
  name: string;
  level: number;
  commune: string | null;
  region: string | null;
}

const fmt = (n: number | null | undefined, suffix = "") =>
  n == null || !Number.isFinite(n)
    ? "—"
    : n.toLocaleString("fr-LU", { maximumFractionDigits: 0 }) + suffix;

export default function Home() {
  const [zoneQuery, setZoneQuery] = useState("");
  const [zone, setZone] = useState<Zone | null>(null);
  const [suggestions, setSuggestions] = useState<Zone[]>([]);
  const [showSug, setShowSug] = useState(false);
  const [type, setType] = useState<"apartment" | "house">("apartment");
  const [minSurface, setMinSurface] = useState("");
  const [maxSurface, setMaxSurface] = useState("");
  const [minRooms, setMinRooms] = useState("");
  const [targetSurface, setTargetSurface] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<any>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/zones?q=${encodeURIComponent(zoneQuery)}`);
        const j = await r.json();
        setSuggestions(j.zones ?? []);
      } catch {
        setSuggestions([]);
      }
    }, 180);
    return () => debounce.current && clearTimeout(debounce.current);
  }, [zoneQuery]);

  async function search() {
    if (!zone) {
      setError("Choisis une commune/localité.");
      return;
    }
    setError(null);
    setLoading(true);
    setResult(null);
    const p = new URLSearchParams({ zone: zone.loc_code, type });
    if (minSurface) p.set("minSurface", minSurface);
    if (maxSurface) p.set("maxSurface", maxSurface);
    if (minRooms) p.set("minRooms", minRooms);
    if (targetSurface) p.set("targetSurface", targetSurface);
    try {
      const r = await fetch(`/api/search?${p.toString()}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "erreur");
      setResult(j);
    } catch (e: any) {
      setError(String(e.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="disclaimer">
        <strong>Lecture honnête.</strong> Sextant estime le prix <em>affiché</em> à
        partir d'annonces (atHome + Immotop) et le confronte au prix <em>signé</em>{" "}
        (actes notariés, Observatoire de l'Habitat). Ce n'est pas une valeur ferme :
        un faisceau d'indices à interpréter. Maisons &amp; petites communes = peu de
        comparables → estimation indicative. Toujours regarder la confiance et le
        nombre de comps.
      </div>

      <div className="panel">
        <h2>Recherche</h2>
        <div className="form-grid">
          <div className="field autocomplete" style={{ gridColumn: "span 2" }}>
            <label>Commune / localité</label>
            <input
              value={zone ? zone.name : zoneQuery}
              placeholder="ex. Esch-sur-Alzette, Hassel…"
              onChange={(e) => {
                setZone(null);
                setZoneQuery(e.target.value);
                setShowSug(true);
              }}
              onFocus={() => setShowSug(true)}
            />
            {showSug && suggestions.length > 0 && !zone && (
              <div className="suggestions">
                {suggestions.map((z) => (
                  <div
                    key={z.loc_code}
                    onClick={() => {
                      setZone(z);
                      setShowSug(false);
                    }}
                  >
                    {z.name}
                    <span className="lvl">
                      {z.level === 7 ? "commune" : "localité"}
                      {z.commune && z.level !== 7 ? ` · ${z.commune}` : ""}
                      {z.region ? ` · ${z.region}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="field">
            <label>Type</label>
            <select value={type} onChange={(e) => setType(e.target.value as any)}>
              <option value="apartment">Appartement</option>
              <option value="house">Maison</option>
            </select>
          </div>
          <div className="field">
            <label>Surface min (m²)</label>
            <input type="number" value={minSurface} onChange={(e) => setMinSurface(e.target.value)} />
          </div>
          <div className="field">
            <label>Surface max (m²)</label>
            <input type="number" value={maxSurface} onChange={(e) => setMaxSurface(e.target.value)} />
          </div>
          <div className="field">
            <label>Chambres min</label>
            <input type="number" value={minRooms} onChange={(e) => setMinRooms(e.target.value)} />
          </div>
          <div className="field">
            <label>Surface du bien (m²)</label>
            <input
              type="number"
              value={targetSurface}
              placeholder="pour la fourchette"
              onChange={(e) => setTargetSurface(e.target.value)}
            />
          </div>
        </div>
        <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center" }}>
          <button className="btn" onClick={search} disabled={loading}>
            {loading ? "Recherche…" : "Estimer"}
          </button>
          {error && <span style={{ color: "var(--bad)", fontSize: 13 }}>{error}</span>}
        </div>
      </div>

      {loading && <div className="spinner">Calcul des comparables…</div>}

      {result && <Results result={result} />}

      <div className="footer">
        Sextant · données affichées (atHome/Immotop) recoupées avec l'Observatoire de
        l'Habitat (data.public.lu). Prix affiché ≠ prix signé.
      </div>
    </>
  );
}

function Results({ result }: { result: any }) {
  const est = result.estimate;
  const obs = result.observatoire;
  const distM2 = result.distributionM2;
  const distAbs = result.distributionAbs;
  const comps = result.comparables as any[];
  const isHouse = result.filters.propertyType === "house";

  const lowTotal = est.lowTotal;
  const midTotal = est.midTotal;
  const highTotal = est.highTotal;

  return (
    <>
      <div className="panel">
        <h2>Fourchette d'estimation</h2>
        <div className="estimate">
          <div className="range-card">
            <div className="label">
              {midTotal != null ? "Prix estimé (affiché)" : "€/m² estimé (affiché)"}
            </div>
            {midTotal != null ? (
              <div className="range">
                {fmt(lowTotal)} – <span className="mid">{fmt(midTotal)}</span> – {fmt(highTotal)} €
              </div>
            ) : (
              <div className="range">
                {fmt(est.lowM2)} – <span className="mid">{fmt(est.midM2)}</span> – {fmt(est.highM2)} €/m²
              </div>
            )}
            <div className="sub">
              {est.basis === "absolu"
                ? "Maison : raisonnement en prix absolu (terrain rend le €/m² trompeur)."
                : "Fourchette P25 – médiane – P75 des €/m² comparables."}
            </div>
            <span className={`conf ${est.confidence}`}>
              confiance {est.confidence} · {est.nComps} comp{est.nComps > 1 ? "s" : ""}
            </span>
            {est.notes.length > 0 && (
              <ul className="notes">
                {est.notes.map((n: string, i: number) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="range-card">
            <div className="label">Distribution €/m² des comparables</div>
            {distM2 ? (
              <>
                <div className="dist-row" style={{ marginTop: 12 }}>
                  <Cell k="min" v={distM2.min} />
                  <Cell k="P25" v={distM2.p25} />
                  <Cell k="médiane" v={distM2.median} med />
                  <Cell k="P75" v={distM2.p75} />
                  <Cell k="max" v={distM2.max} />
                </div>
                <div className="bar" />
                {isHouse && distAbs && (
                  <div className="dist-row" style={{ marginTop: 18 }}>
                    <Cell k="prix min" v={distAbs.min} />
                    <Cell k="médiane" v={distAbs.median} med />
                    <Cell k="prix max" v={distAbs.max} />
                  </div>
                )}
              </>
            ) : (
              <div className="muted" style={{ marginTop: 14 }}>
                Pas assez de comparables pour une distribution.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>Référence Observatoire de l'Habitat (signé vs affiché)</h2>
        {obs ? (
          <>
            <div className="obs-grid">
              <div className="obs-cell">
                <div className="k">Prix annoncé (affiché)</div>
                <div className="v announced">{fmt(obs.announced_eur_m2, " €/m²")}</div>
              </div>
              <div className="obs-cell">
                <div className="k">Prix de vente (signé, notarié)</div>
                <div className="v signed">{fmt(obs.signed_eur_m2, " €/m²")}</div>
              </div>
              <div className="obs-cell">
                <div className="k">Décote affiché → signé</div>
                <div className="v discount">
                  {obs.discount != null ? `−${Math.round((1 - obs.discount) * 100)} %` : "—"}
                </div>
              </div>
            </div>
            <div className="counts">
              <span>
                {obs.commune} · {obs.property_type} · période {obs.period}
                {obs.n_transactions ? ` · ${obs.n_transactions} transactions` : ""}
              </span>
            </div>
          </>
        ) : (
          <div className="muted">
            Aucune donnée Observatoire pour cette commune. La fourchette reste en prix{" "}
            <em>affiché</em> (pas de référence signée) — à interpréter avec prudence.
          </div>
        )}
      </div>

      <div className="panel">
        <h2>
          Comparables ({result.counts.afterDedup})
          <span className="pill" style={{ marginLeft: 10, fontWeight: 400 }}>
            {result.counts.raw} bruts · {result.counts.afterDedup} après dédup ·{" "}
            {result.counts.aberrant} aberrant(s) écarté(s)
          </span>
        </h2>
        {comps.length === 0 ? (
          <div className="empty">
            Aucun comparable en base pour ces critères.
            <br />
            <span className="muted">
              Lance un scrape n8n (atHome/Immotop) sur cette zone pour alimenter la base.
            </span>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="comps">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Type</th>
                  <th>Prix</th>
                  <th>Surface</th>
                  <th>€/m²</th>
                  <th>Ch.</th>
                  <th>CPE</th>
                  <th>État</th>
                  <th>Terrain</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {comps.map((c) => (
                  <tr key={c.id} className={c.aberrant ? "aberrant" : ""}>
                    <td>
                      <span className={`src-tag ${c.source}`}>{c.source}</span>
                      {c.also_on.length > 0 && <span className="also">+{c.also_on.join(",")}</span>}
                    </td>
                    <td>{c.property_type === "house" ? "Maison" : "Appart."}</td>
                    <td className="num">{fmt(c.price, " €")}</td>
                    <td className="num">{fmt(c.surface, " m²")}</td>
                    <td className="num">{fmt(c.eur_m2, "")}</td>
                    <td className="num">{c.rooms ?? "—"}</td>
                    <td>{c.cpe ? <span className="cpe-badge">{c.cpe}</span> : <span className="muted">—</span>}</td>
                    <td>{c.state ?? <span className="muted">—</span>}</td>
                    <td className="num">{c.land ? fmt(c.land, " m²") : "—"}</td>
                    <td>{c.url && <a href={c.url} target="_blank" rel="noreferrer">↗</a>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function Cell({ k, v, med }: { k: string; v: number; med?: boolean }) {
  return (
    <div className={`dist-cell ${med ? "med" : ""}`}>
      <div className="k">{k}</div>
      <div className="v">{fmt(v)}</div>
    </div>
  );
}
