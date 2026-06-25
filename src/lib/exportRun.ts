// Export d'une recherche (analyse + tableau de comparables).
//  - Excel (.xlsx) : feuille « Analyse » (synthèse) + feuille « Comparables ».
//  - PDF : page de synthèse (fourchette, distribution, moyennes) + tableau ;
//    extensible (option) avec une fiche par bien (photos + détails).
// Génération côté navigateur (imports dynamiques). Photos via /api/imgproxy (CORS).
// Repris/adapté de BBIscout (exportTracked.ts).

export type ExportComparable = {
  title: string;
  commune: string;
  url: string;
  price: number;
  surface: number | string;
  priceM2: number | null;
  rooms?: number | null;
  cpe?: string | null;
  source?: string;
  etat?: string | null;
  marketStatus?: string;
  buildYear?: number | null;
  photos?: string[];
  description?: string | null;
};

export type ExportAnalysis = {
  commune?: string | null;
  nComps: number;
  enough: boolean;
  displayed?: { min: number; p25: number; median: number; p75: number; max: number };
  signedRef?: { signed: number; period: string } | null;
  decotePct?: number;
  decoteSource?: string;
  estimate?: { low: number; median: number; high: number };
  confidence?: number;
  confLabel?: string;
  avgSurface: number | null;
  avgPrice: number | null;
  avgM2: number | null;
};

const eur = (n?: number | null) =>
  n == null ? "—" : Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " €";
const SRC_LABEL: Record<string, string> = { athome: "atHome", immotop: "Immotop", both: "atHome+Immotop" };
const ETAT_LABEL: Record<string, string> = { a_renover: "À rénover", habitable: "Habitable", renove: "Rénové", neuf: "Neuf" };
const safeName = (s: string) => s.replace(/[^\p{L}\p{N}_-]+/gu, "_").replace(/^_+|_+$/g, "") || "vesper";
const proxied = (url: string) => `/api/imgproxy?url=${encodeURIComponent(url)}`;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
}

// ---- Excel ----------------------------------------------------------------

export async function exportExcel(comps: ExportComparable[], a: ExportAnalysis, baseName: string) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  // Feuille Analyse (synthèse en lignes clé/valeur).
  const ana: [string, string | number][] = [
    ["Commune", a.commune || "—"],
    ["Comparables retenus", a.nComps],
    ["Surface moyenne (m²)", a.avgSurface != null ? Math.round(a.avgSurface * 10) / 10 : "—"],
    ["Prix moyen (€)", a.avgPrice != null ? Math.round(a.avgPrice) : "—"],
    ["€/m² moyen", a.avgM2 != null ? Math.round(a.avgM2) : "—"],
  ];
  if (a.enough && a.displayed) {
    ana.push(
      ["€/m² affiché — min", Math.round(a.displayed.min)],
      ["€/m² affiché — P25", Math.round(a.displayed.p25)],
      ["€/m² affiché — médiane", Math.round(a.displayed.median)],
      ["€/m² affiché — P75", Math.round(a.displayed.p75)],
      ["€/m² affiché — max", Math.round(a.displayed.max)],
      ["Décote affiché→signé (%)", a.decotePct ?? "—"],
      ["Réf. Observatoire signé (€/m²)", a.signedRef ? a.signedRef.signed : "—"],
      ["Estimation signée — basse (€/m²)", a.estimate ? a.estimate.low : "—"],
      ["Estimation signée — médiane (€/m²)", a.estimate ? a.estimate.median : "—"],
      ["Estimation signée — haute (€/m²)", a.estimate ? a.estimate.high : "—"],
      ["Confiance", `${a.confLabel} (${a.confidence})`]
    );
  }
  const wsA = XLSX.utils.aoa_to_sheet([["Analyse", ""], ...ana]);
  wsA["!cols"] = [{ wch: 34 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, wsA, "Analyse");

  // Feuille Comparables.
  const data = comps.map((c) => ({
    Bien: c.title,
    Source: SRC_LABEL[c.source || "athome"] || c.source,
    Commune: c.commune,
    "Prix (€)": c.price,
    "m²": c.surface,
    "€/m²": c.priceM2 ?? "",
    Chambres: c.rooms ?? "",
    CPE: c.cpe || "",
    État: c.etat ? ETAT_LABEL[c.etat] : "",
    Statut: c.marketStatus === "sold" ? "Vendu/compromis" : "Actif",
    "Année constr.": c.buildYear ?? "",
    Annonce: c.url,
  }));
  const wsC = XLSX.utils.json_to_sheet(data.length ? data : [{ Bien: "—" }]);
  wsC["!cols"] = Object.keys(data[0] || { Bien: "" }).map((k) =>
    k === "Bien" || k === "Annonce" || k === "Commune" ? { wch: 34 } : { wch: 13 }
  );
  XLSX.utils.book_append_sheet(wb, wsC, "Comparables");

  XLSX.writeFile(wb, `${safeName(baseName)}.xlsx`);
}

// ---- PDF ------------------------------------------------------------------

const INK: [number, number, number] = [17, 17, 17];
const SOFT: [number, number, number] = [110, 114, 112];
const GREEN: [number, number, number] = [7, 135, 95];
const PAPER2: [number, number, number] = [244, 246, 245];
const GREEN_SOFT: [number, number, number] = [227, 247, 240];
const LINE: [number, number, number] = [225, 228, 227];

/** Charge le logo Brouwers (SVG) et le rasterise en PNG haute déf pour jsPDF. */
async function loadLogo(): Promise<{ dataUrl: string; ratio: number } | null> {
  try {
    const img = await loadImage("/brouwers-logo.svg");
    if (!img) return null;
    const w = img.naturalWidth || 107, h = img.naturalHeight || 45;
    const scale = 6;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { dataUrl: canvas.toDataURL("image/png"), ratio: w / h };
  } catch {
    return null;
  }
}

export async function exportPdf(
  comps: ExportComparable[],
  a: ExportAnalysis,
  baseName: string,
  opts: { photos: boolean; details: boolean }
) {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 182;
  const bold = () => doc.setFont("helvetica", "bold");
  const reg = () => doc.setFont("helvetica", "normal");
  const box = (x: number, y: number, w: number, h: number, fill: [number, number, number], border?: [number, number, number]) => {
    doc.setFillColor(...fill);
    if (border) {
      doc.setDrawColor(...border);
      doc.roundedRect(x, y, w, h, 2.4, 2.4, "FD");
    } else {
      doc.roundedRect(x, y, w, h, 2.4, 2.4, "F");
    }
  };

  // --- En-tête : logo BBI + titre ---
  let y = 13;
  const logo = await loadLogo();
  if (logo) {
    const lh = 12, lw = lh * logo.ratio;
    try { doc.addImage(logo.dataUrl, "PNG", 14, y, lw, lh); } catch {}
  }
  doc.setFontSize(8.5); doc.setTextColor(...SOFT);
  doc.text(`Généré le ${new Date().toLocaleDateString("fr-FR")}`, 196, y + 4, { align: "right" });
  y += 25; // air entre le logo et le titre
  doc.setFontSize(17); doc.setTextColor(...INK); bold();
  doc.text(`Estimation — ${a.commune || "comparables"}`, 14, y);
  if (a.enough && a.confLabel) {
    const cc: [number, number, number] =
      a.confLabel === "Élevée" ? GREEN : a.confLabel === "Bonne" ? [31, 122, 77] : a.confLabel === "Modérée" ? [154, 107, 0] : [161, 32, 32];
    doc.setFontSize(9); doc.setTextColor(...cc);
    doc.text(`Confiance ${a.confLabel} (${a.confidence}/100)`, 196, y, { align: "right" });
  }
  reg();
  y += 6;
  doc.setFontSize(9.5); doc.setTextColor(...SOFT);
  doc.text(`${a.nComps} comparable${a.nComps > 1 ? "s" : ""} retenu${a.nComps > 1 ? "s" : ""}`, 14, y);
  y += 4;
  doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.line(14, y, 196, y);
  y += 9;

  if (a.enough && a.estimate && a.displayed) {
    const d = a.displayed;
    // --- Flow : Affiché médian → −décote → Estimation signée ---
    const h = 24, x1 = 14, w1 = 60, x2 = 104, w2 = 92;
    box(x1, y, w1, h, PAPER2);
    doc.setFontSize(7); doc.setTextColor(...SOFT); doc.text("PRIX AFFICHÉ MÉDIAN", x1 + 4, y + 6);
    doc.setFontSize(13); doc.setTextColor(...INK); bold();
    doc.text(`${eur(d.median)}/m²`, x1 + 4, y + 14.5);
    reg(); doc.setFontSize(7); doc.setTextColor(...SOFT);
    doc.text("d'après les annonces", x1 + 4, y + 20);

    // Décote : simple et sans glyphes hors-police (le vrai « − » et « → » ne sont
    // pas dans la police PDF standard → s'affichaient en " et !).
    const cx = (x1 + w1 + x2) / 2;
    doc.setFontSize(6.5); doc.setTextColor(...SOFT);
    doc.text("DÉCOTE", cx, y + 9, { align: "center" });
    doc.setFontSize(13); doc.setTextColor(...GREEN); bold();
    doc.text(a.decotePct != null ? `-${String(a.decotePct).replace(".", ",")} %` : "—", cx, y + 16, { align: "center" });
    reg();

    box(x2, y, w2, h, GREEN_SOFT, GREEN);
    doc.setFontSize(7); doc.setTextColor(...GREEN); doc.text("ESTIMATION PRIX SIGNÉ", x2 + 5, y + 6);
    doc.setFontSize(13); doc.setTextColor(...GREEN); bold();
    doc.text(`${eur(a.estimate.low)} – ${eur(a.estimate.high)}/m²`, x2 + 5, y + 14.5);
    reg(); doc.setFontSize(7.5); doc.setTextColor(...SOFT);
    doc.text(`médiane ${eur(a.estimate.median)}/m²`, x2 + 5, y + 20);
    y += h + 8;

    // --- Référence Observatoire (signé) ---
    doc.setFontSize(8.5); doc.setTextColor(...SOFT);
    const lbl = "Réf. Observatoire de l'Habitat — prix signés (notariés) : ";
    doc.text(lbl, 14, y);
    const obs = a.signedRef ? `${eur(a.signedRef.signed)}/m² (période ${a.signedRef.period})` : "non disponible pour cette commune";
    doc.setTextColor(...INK); bold();
    doc.text(obs, 14 + doc.getTextWidth(lbl), y);
    reg();
    y += 9;

    // --- Distribution des €/m² affichés (barre + quartiles) ---
    doc.setFontSize(7.5); doc.setTextColor(...SOFT); doc.text("DISTRIBUTION DES €/m² AFFICHÉS", 14, y);
    y += 4.5;
    const span = (d.max - d.min) || 1;
    const px = (v: number) => 14 + ((v - d.min) / span) * W;
    const barY = y, barH = 3.2;
    doc.setFillColor(...LINE); doc.roundedRect(14, barY, W, barH, 1.4, 1.4, "F");
    doc.setFillColor(...GREEN);
    doc.roundedRect(px(d.p25), barY, Math.max(1, px(d.p75) - px(d.p25)), barH, 1.4, 1.4, "F");
    doc.setDrawColor(...INK); doc.setLineWidth(0.7);
    doc.line(px(d.median), barY - 1.6, px(d.median), barY + barH + 1.6);
    doc.setLineWidth(0.3);
    const labs: { v: number; k: string; al: "left" | "center" | "right" }[] = [
      { v: d.min, k: "Min", al: "left" }, { v: d.p25, k: "P25", al: "center" },
      { v: d.median, k: "Méd.", al: "center" }, { v: d.p75, k: "P75", al: "center" }, { v: d.max, k: "Max", al: "right" },
    ];
    labs.forEach((l) => {
      const xx = Math.min(196, Math.max(14, px(l.v)));
      doc.setFontSize(7.5); doc.setTextColor(...INK); bold();
      doc.text(eur(l.v), xx, barY + barH + 6, { align: l.al });
      reg(); doc.setFontSize(6.5); doc.setTextColor(...SOFT);
      doc.text(l.k, xx, barY + barH + 10, { align: l.al });
    });
    y = barY + barH + 16;

    // --- Moyennes (3 cartes) ---
    const avgs: [string, string][] = [
      ["Surface moyenne", a.avgSurface != null ? `${Math.round(a.avgSurface)} m²` : "—"],
      ["Prix moyen", eur(a.avgPrice)],
      ["€/m² moyen", a.avgM2 != null ? `${eur(a.avgM2)}/m²` : "—"],
    ];
    const aw = (W - 2 * 5) / 3;
    avgs.forEach(([l, v], i) => {
      const ax = 14 + i * (aw + 5);
      box(ax, y, aw, 16, PAPER2);
      doc.setFontSize(7); doc.setTextColor(...SOFT); doc.text(l, ax + aw / 2, y + 6, { align: "center" });
      doc.setFontSize(11); doc.setTextColor(...INK); bold();
      doc.text(v, ax + aw / 2, y + 12, { align: "center" });
      reg();
    });
    y += 16 + 9;
  } else {
    doc.setFontSize(10); doc.setTextColor(...SOFT);
    doc.text("Pas assez de comparables retenus pour une estimation fiable.", 14, y);
    y += 8;
  }

  // --- Tableau des comparables (titres cliquables vers l'annonce) ---
  doc.setFontSize(12); doc.setTextColor(...INK); bold();
  doc.text("Comparables", 14, y);
  const cw = doc.getTextWidth("Comparables"); // mesuré à 12 pt gras (sinon le sous-titre se superpose)
  reg(); doc.setFontSize(7.5); doc.setTextColor(...SOFT);
  doc.text("— titres cliquables vers l'annonce", 14 + cw + 4, y);
  y += 3;
  autoTable(doc, {
    startY: y,
    head: [["Bien", "Source", "Prix", "m²", "€/m²", "Ch.", "CPE", "État"]],
    body: comps.map((c) => [
      c.title?.slice(0, 44) || "—",
      SRC_LABEL[c.source || "athome"] || c.source || "",
      eur(c.price),
      String(c.surface),
      c.priceM2 != null ? eur(c.priceM2) : "—",
      c.rooms ?? "—",
      c.cpe || "—",
      (c.marketStatus === "sold" ? "Vendu · " : "") + (c.etat ? ETAT_LABEL[c.etat] : ""),
    ]),
    headStyles: { fillColor: INK, textColor: [255, 255, 255], fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 1.6, lineColor: LINE, lineWidth: 0.1 },
    alternateRowStyles: { fillColor: [250, 251, 251] },
    columnStyles: {
      0: { cellWidth: 58, textColor: GREEN, fontStyle: "bold" },
      2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "center" },
    },
    margin: { left: 14, right: 14 },
    // Rend la cellule « Bien » cliquable vers l'URL de l'annonce.
    didDrawCell: (data: any) => {
      if (data.section === "body" && data.column.index === 0) {
        const url = comps[data.row.index]?.url;
        if (url) doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url });
      }
    },
  });

  // --- Fiches détaillées (option photos / détails) ---
  if (opts.photos || opts.details) {
    for (const c of comps) {
      doc.addPage();
      let yy = 16;
      doc.setFontSize(13);
      doc.setTextColor(...INK);
      doc.text(doc.splitTextToSize(c.title || "Annonce", W)[0], 14, yy);
      yy += 6;
      doc.setFontSize(9.5);
      doc.setTextColor(...SOFT);
      doc.text([c.commune, SRC_LABEL[c.source || "athome"], c.marketStatus === "sold" ? "Vendu/compromis" : ""].filter(Boolean).join("  ·  "), 14, yy);
      yy += 7;

      if (opts.photos && c.photos && c.photos.length) {
        const imgs = await Promise.all(c.photos.slice(0, 2).map((p) => loadImage(proxied(p))));
        const pw = 88, ph = 58;
        let drew = false;
        imgs.forEach((img, idx) => {
          if (img) {
            try { doc.addImage(img, "JPEG", 14 + idx * (pw + 6), yy, pw, ph); drew = true; } catch {}
          }
        });
        if (drew) yy += ph + 6;
      }

      const facts: [string, string][] = [
        ["Prix", eur(c.price)],
        ["Surface", `${c.surface} m²`],
        ["€/m²", c.priceM2 != null ? eur(c.priceM2) + "/m²" : "—"],
        ["Chambres", c.rooms != null ? String(c.rooms) : "—"],
        ["CPE", c.cpe || "—"],
        ["Année construction", c.buildYear != null ? String(c.buildYear) : "—"],
        ["État", c.etat ? ETAT_LABEL[c.etat] : "—"],
      ];
      autoTable(doc, {
        startY: yy,
        body: facts,
        theme: "plain",
        styles: { fontSize: 9.5, cellPadding: 1.4 },
        columnStyles: { 0: { textColor: SOFT, cellWidth: 56 }, 1: { fontStyle: "bold" } },
        margin: { left: 14, right: 14 },
      });
      yy = (doc as any).lastAutoTable.finalY + 5;

      if (opts.details && c.description) {
        doc.setFontSize(9);
        doc.setTextColor(...INK);
        const lines = doc.splitTextToSize(c.description, W);
        doc.text(lines.slice(0, 30), 14, yy);
        yy += Math.min(lines.length, 30) * 4 + 4;
      }
      doc.setFontSize(9.5);
      doc.setTextColor(...GREEN);
      if (c.url) doc.textWithLink("Voir l'annonce ↗", 14, yy + 2, { url: c.url });
    }
  }

  doc.save(`${safeName(baseName)}.pdf`);
}
