import { jsPDF } from "jspdf";

export type ShoppingPrintItem = {
  name: string;
  quantity: string | null;
  category: string;
};

const CATEGORY_ORDER = [
  "Frutta", "Verdura", "Carne", "Pesce", "Latticini",
  "Cereali", "Legumi", "Condimenti", "Bevande", "Altro",
];

function groupByCategory(items: ShoppingPrintItem[]): Record<string, ShoppingPrintItem[]> {
  const map: Record<string, ShoppingPrintItem[]> = {};
  for (const it of items) {
    const cat = it.category || "Altro";
    if (!map[cat]) map[cat] = [];
    map[cat].push(it);
  }
  // sort categories by known order then alphabetically
  const sorted: Record<string, ShoppingPrintItem[]> = {};
  Object.keys(map)
    .sort((a, b) => {
      const ai = CATEGORY_ORDER.indexOf(a);
      const bi = CATEGORY_ORDER.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b, "it");
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    })
    .forEach((k) => { sorted[k] = map[k]; });
  return sorted;
}

function openPdfPreview(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (win) {
    // revoke later to allow viewer to load
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }
  // Fallback: hidden iframe + print()
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.src = url;
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      // ignore
    }
  };
  document.body.appendChild(iframe);
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

export function printShoppingList(opts: {
  weekStart: string; // ISO date
  items: ShoppingPrintItem[];
}) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 18;
  const marginTop = 20;
  const marginBottom = 18;
  const contentW = pageW - marginX * 2;

  doc.setTextColor(0, 0, 0);

  const weekDate = new Date(opts.weekStart + "T00:00:00");
  const weekLabel = weekDate.toLocaleDateString("it-IT", {
    day: "numeric", month: "long", year: "numeric",
  });

  let y = marginTop;

  const drawHeader = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Lista della spesa", marginX, y);
    y += 7;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(`Settimana del ${weekLabel}`, marginX, y);
    y += 4;
    doc.setLineWidth(0.4);
    doc.line(marginX, y, marginX + contentW, y);
    y += 6;
  };

  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - marginBottom) {
      doc.addPage();
      y = marginTop;
    }
  };

  drawHeader();

  const grouped = groupByCategory(opts.items);
  const cats = Object.keys(grouped);

  if (cats.length === 0) {
    doc.setFontSize(11);
    doc.text("Nessun articolo.", marginX, y);
  }

  for (const cat of cats) {
    ensureSpace(10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(cat.toUpperCase(), marginX, y);
    y += 5.5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);

    for (const it of grouped[cat]) {
      const qty = it.quantity ? `  —  ${it.quantity}` : "";
      const text = `•  ${it.name}${qty}`;
      const lines = doc.splitTextToSize(text, contentW - 4);
      const blockH = lines.length * 5.5;
      ensureSpace(blockH);
      doc.text(lines, marginX + 2, y);
      y += blockH;
    }
    y += 3;
  }

  // Footer page numbers
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text(`Pagina ${i} di ${total}`, pageW / 2, pageH - 8, { align: "center" });
    doc.setTextColor(0, 0, 0);
  }

  const blob = doc.output("blob");
  openPdfPreview(blob);
}
