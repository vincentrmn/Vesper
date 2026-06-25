"use client";
import { useEffect, useMemo, useState } from "react";
import type { ZoneTree, Zone } from "@/lib/types";

type Props = {
  value: string[];
  onChange: (locCodes: string[]) => void;
};

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

type FlatZone = {
  locCode: string;
  label: string;
  isCommune: boolean;
  communeLabel?: string;
};

/**
 * ZonePicker — recherche libre (commune ou localité), affichage dynamique (façon
 * atHome). On tape, on choisit dans la liste → chip sélectionné. Pour une commune
 * sélectionnée, on peut déplier ses localités et en cocher.
 * `value` = tableau de loc_codes (inchangé : compat formulaire + trigger).
 */
export default function ZonePicker({ value, onChange }: Props) {
  const [tree, setTree] = useState<ZoneTree[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/zones", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) setTree(json.zones || []);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Aplatissement : communes + localités, + index loc_code -> label / enfants.
  const { flat, labelByLoc, childrenByCommuneLoc } = useMemo(() => {
    const flat: FlatZone[] = [];
    const labelByLoc = new Map<string, string>();
    const childrenByCommuneLoc = new Map<string, Zone[]>();
    for (const c of tree) {
      flat.push({ locCode: c.loc_code, label: c.label, isCommune: true });
      labelByLoc.set(c.loc_code, c.label);
      childrenByCommuneLoc.set(c.loc_code, c.quartiers || []);
      for (const q of c.quartiers || []) {
        flat.push({ locCode: q.loc_code, label: q.label, isCommune: false, communeLabel: c.label });
        labelByLoc.set(q.loc_code, q.label);
      }
    }
    return { flat, labelByLoc, childrenByCommuneLoc };
  }, [tree]);

  const matches = useMemo(() => {
    const nq = norm(q.trim());
    if (nq.length < 1) return [];
    const scored = flat
      .map((z) => {
        const nl = norm(z.label);
        const idx = nl.indexOf(nq);
        if (idx < 0) return null;
        // priorité : commence par > contient ; commune avant localité.
        const score = (idx === 0 ? 0 : 100) + (z.isCommune ? 0 : 10) + idx + z.label.length / 100;
        return { z, score };
      })
      .filter((x): x is { z: FlatZone; score: number } => !!x)
      .sort((a, b) => a.score - b.score)
      .slice(0, 12)
      .map((x) => x.z);
    return scored;
  }, [q, flat]);

  function add(locCode: string) {
    if (!value.includes(locCode)) onChange([...value, locCode]);
    setQ("");
    setOpen(false);
  }
  function remove(locCode: string) {
    onChange(value.filter((c) => c !== locCode));
  }
  function toggleChild(qLoc: string) {
    value.includes(qLoc) ? remove(qLoc) : onChange([...value, qLoc]);
  }

  if (loading) return <p className="ds-hint">Chargement des zones…</p>;
  if (error) return <p className="ds-hint" style={{ color: "var(--ds-danger)" }}>Impossible de charger les zones ({error})</p>;

  // Communes sélectionnées (pour proposer leurs localités).
  const selectedCommunes = value.filter((lc) => childrenByCommuneLoc.has(lc) && (childrenByCommuneLoc.get(lc) || []).length > 0);

  return (
    <div>
      {/* Chips sélectionnés */}
      {value.length > 0 && (
        <div className="ds-chips" style={{ marginBottom: 10 }}>
          {value.map((lc) => (
            <span key={lc} className="ds-chip" data-on="true">
              {labelByLoc.get(lc) || lc}
              <button type="button" className="ds-chip__x" onClick={() => remove(lc)} aria-label="Retirer">×</button>
            </span>
          ))}
        </div>
      )}

      {/* Champ de recherche + dropdown dynamique */}
      <div style={{ position: "relative" }}>
        <input
          type="text"
          className="ds-input"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Rechercher une commune ou une localité (ex : Weiler-la-Tour, Esch…)"
          autoComplete="off"
        />
        {open && matches.length > 0 && (
          <div className="ds-menu">
            {matches.map((m) => (
              <button
                key={m.locCode}
                type="button"
                className="ds-menu__item"
                data-on={value.includes(m.locCode)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(m.locCode);
                }}
              >
                <span>{m.label}</span>
                <span className="ds-menu__meta">
                  {m.isCommune ? "Commune" : `Localité · ${m.communeLabel}`}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Localités d'une commune sélectionnée — affichées directement (sans bouton). */}
      {selectedCommunes.map((lc) => {
        const kids = childrenByCommuneLoc.get(lc) || [];
        return (
          <div key={lc} style={{ marginTop: 12 }}>
            <span className="ds-label" style={{ display: "block", marginBottom: 6 }}>Localités de {labelByLoc.get(lc)}</span>
            <div className="ds-chips">
              {kids.map((k) => (
                <span
                  key={k.loc_code}
                  className="ds-chip"
                  data-on={value.includes(k.loc_code)}
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleChild(k.loc_code)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleChild(k.loc_code);
                    }
                  }}
                >
                  {k.label}
                </span>
              ))}
            </div>
          </div>
        );
      })}

      {value.length === 0 && (
        <p className="ds-hint">Tape le début d'une commune ou localité, puis choisis dans la liste.</p>
      )}
    </div>
  );
}
