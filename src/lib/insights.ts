// Insight automatici in linguaggio umano basati sui dati.
// Tutto sincrono, zero AI: regole semplici e chiare.

import type { VisitFull } from "@/lib/types";

export type StatusLevel = "good" | "warn" | "bad" | "neutral";

export interface RangeEvaluation {
  status: StatusLevel;
  label: string;
}

export function formatNumber(n: number | null | undefined, decimals = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: decimals });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function daysBetween(a: string | Date, b: string | Date): number {
  const aD = typeof a === "string" ? new Date(a) : a;
  const bD = typeof b === "string" ? new Date(b) : b;
  return Math.round((bD.getTime() - aD.getTime()) / (1000 * 60 * 60 * 24));
}

// BMI categories (WHO)
export function bmiLabel(bmi: number | null | undefined): RangeEvaluation {
  if (bmi == null) return { status: "neutral", label: "—" };
  if (bmi < 18.5) return { status: "warn", label: "Sottopeso" };
  if (bmi < 25) return { status: "good", label: "Normopeso" };
  if (bmi < 30) return { status: "warn", label: "Sovrappeso" };
  if (bmi < 35) return { status: "bad", label: "Obesità I" };
  if (bmi < 40) return { status: "bad", label: "Obesità II" };
  return { status: "bad", label: "Obesità III" };
}

// Visceral fat (Tanita scale: <10 ok, 10-14 alto, >14 molto alto)
export function visceralFatLabel(v: number | null | undefined): RangeEvaluation {
  if (v == null) return { status: "neutral", label: "—" };
  if (v < 10) return { status: "good", label: "Nella norma" };
  if (v < 15) return { status: "warn", label: "Elevato" };
  return { status: "bad", label: "Molto elevato" };
}

// Massa grassa % uomo adulto (range orientativo)
export function fatMassLabel(pct: number | null | undefined, sex: "M" | "F" = "M"): RangeEvaluation {
  if (pct == null) return { status: "neutral", label: "—" };
  if (sex === "M") {
    if (pct < 8) return { status: "warn", label: "Molto basso" };
    if (pct < 20) return { status: "good", label: "Ottimale" };
    if (pct < 25) return { status: "warn", label: "Accettabile" };
    return { status: "bad", label: "Eccessivo" };
  }
  if (pct < 18) return { status: "warn", label: "Molto basso" };
  if (pct < 30) return { status: "good", label: "Ottimale" };
  if (pct < 35) return { status: "warn", label: "Accettabile" };
  return { status: "bad", label: "Eccessivo" };
}

export function hydrationLabel(h: number | null | undefined): RangeEvaluation {
  if (h == null) return { status: "neutral", label: "—" };
  if (h < 50) return { status: "warn", label: "Bassa" };
  if (h <= 65) return { status: "good", label: "Buona" };
  return { status: "warn", label: "Alta" };
}

// Rapporto vita/altezza: <0.5 ok, 0.5-0.6 attenzione, >0.6 rischio
export function whtRLabel(ratio: number | null | undefined): RangeEvaluation {
  if (ratio == null) return { status: "neutral", label: "—" };
  if (ratio < 0.5) return { status: "good", label: "Basso rischio" };
  if (ratio < 0.6) return { status: "warn", label: "Attenzione" };
  return { status: "bad", label: "Rischio elevato" };
}

// Esami ematochimici (range adulti, valori orientativi italiani)
export interface BloodMarker {
  key: string;
  label: string;
  unit: string;
  min?: number;
  max: number;
}

export const BLOOD_MARKERS: Record<string, BloodMarker> = {
  hemoglobin: { key: "hemoglobin", label: "Emoglobina", unit: "g/dL", min: 13, max: 17 },
  glucose: { key: "glucose", label: "Glicemia", unit: "mg/dL", min: 70, max: 100 },
  gamma_gt: { key: "gamma_gt", label: "Gamma GT", unit: "U/L", max: 55 },
  alt: { key: "alt", label: "ALT", unit: "U/L", max: 40 },
  ast: { key: "ast", label: "AST", unit: "U/L", max: 40 },
  total_cholesterol: { key: "total_cholesterol", label: "Colesterolo totale", unit: "mg/dL", max: 200 },
  hdl: { key: "hdl", label: "HDL", unit: "mg/dL", min: 40, max: 999 },
  ldl: { key: "ldl", label: "LDL", unit: "mg/dL", max: 130 },
  triglycerides: { key: "triglycerides", label: "Trigliceridi", unit: "mg/dL", max: 150 },
};

export function evaluateBlood(key: string, value: number | null | undefined): RangeEvaluation {
  if (value == null) return { status: "neutral", label: "—" };
  const m = BLOOD_MARKERS[key];
  if (!m) return { status: "neutral", label: "—" };
  if (key === "hdl") {
    if (value >= 40) return { status: "good", label: "Nella norma" };
    return { status: "warn", label: "Basso" };
  }
  if (m.min !== undefined && value < m.min) return { status: "warn", label: "Sotto norma" };
  if (value > m.max) {
    const overshoot = (value - m.max) / m.max;
    if (overshoot > 0.5) return { status: "bad", label: "Molto sopra norma" };
    return { status: "warn", label: "Sopra norma" };
  }
  return { status: "good", label: "Nella norma" };
}

// ───── Insight builder ─────

export interface Insight {
  tone: "positive" | "neutral" | "warn";
  text: string;
}

export function buildWeightInsight(visits: { visit_date: string; weight_kg: number | null }[]): Insight | null {
  const sorted = [...visits].filter(v => v.weight_kg != null).sort((a, b) => a.visit_date.localeCompare(b.visit_date));
  if (sorted.length < 2) return null;
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const delta = (last.weight_kg as number) - (first.weight_kg as number);
  const days = Math.max(1, daysBetween(first.visit_date, last.visit_date));
  const months = days / 30;
  const ratePerMonth = delta / months;
  const absDelta = Math.abs(delta);
  if (absDelta < 0.5) {
    return { tone: "neutral", text: `Il peso è stabile da ${formatDate(first.visit_date)}: oscilla intorno ai ${formatNumber(last.weight_kg!, 1)} kg.` };
  }
  if (delta < 0) {
    const rate = Math.abs(ratePerMonth);
    const tone: Insight["tone"] = rate >= 0.5 && rate <= 2 ? "positive" : rate > 2 ? "warn" : "neutral";
    const judgement = rate < 0.5
      ? "ritmo lento, ma costante"
      : rate <= 2
        ? "perfettamente nella fascia salutare"
        : "ritmo molto rapido — meglio confrontarsi con la dietologa";
    return { tone, text: `Hai perso ${formatNumber(absDelta, 1)} kg in ${Math.round(months * 10) / 10} mesi (${formatNumber(rate, 1)} kg/mese): ${judgement}.` };
  }
  return { tone: "warn", text: `Hai preso ${formatNumber(absDelta, 1)} kg dall'inizio del percorso. Servirà tempo per invertire la rotta.` };
}

export function buildBloodInsight(latest: Record<string, number | null>, previous: Record<string, number | null> | null): Insight[] {
  const out: Insight[] = [];
  for (const key of Object.keys(BLOOD_MARKERS)) {
    const cur = latest[key];
    if (cur == null) continue;
    const prev = previous?.[key];
    const m = BLOOD_MARKERS[key];
    const evalCur = evaluateBlood(key, cur);
    if (prev != null && prev !== cur) {
      const diff = cur - prev;
      const dir = diff < 0 ? "sceso" : "salito";
      const wasBad = evaluateBlood(key, prev).status !== "good";
      if (evalCur.status === "good" && wasBad) {
        out.push({ tone: "positive", text: `${m.label} ${dir} da ${formatNumber(prev, 1)} a ${formatNumber(cur, 1)} ${m.unit} — ora nella norma. Ottimo.` });
      } else if (evalCur.status !== "good" && Math.abs(diff) / Math.max(1, prev) > 0.1) {
        const better = (key === "hdl" ? diff > 0 : diff < 0);
        if (better) {
          out.push({ tone: "positive", text: `${m.label} in netto miglioramento: da ${formatNumber(prev, 1)} a ${formatNumber(cur, 1)} ${m.unit}. Ancora fuori range, ma stai migliorando.` });
        } else {
          out.push({ tone: "warn", text: `${m.label} in peggioramento: da ${formatNumber(prev, 1)} a ${formatNumber(cur, 1)} ${m.unit}. Da monitorare.` });
        }
      }
    } else if (evalCur.status === "bad") {
      out.push({ tone: "warn", text: `${m.label} a ${formatNumber(cur, 1)} ${m.unit}: sopra il valore di riferimento (${m.max}).` });
    }
  }
  return out.slice(0, 4);
}

export function buildBodyCompInsight(latest: VisitFull | null, previous: VisitFull | null, age?: number | null): Insight[] {
  const out: Insight[] = [];
  if (!latest?.body_composition) return out;
  const bc = latest.body_composition;
  const prevBc = previous?.body_composition ?? null;

  if (bc.fat_mass_pct != null && prevBc?.fat_mass_pct != null && bc.lean_mass_kg != null && prevBc.lean_mass_kg != null) {
    const fatDelta = bc.fat_mass_pct - prevBc.fat_mass_pct;
    const leanDelta = bc.lean_mass_kg - prevBc.lean_mass_kg;
    if (fatDelta < -0.5 && leanDelta >= -0.5) {
      out.push({ tone: "positive", text: `Stai perdendo grasso (-${formatNumber(Math.abs(fatDelta), 1)}%) mantenendo la massa magra: dimagrimento di qualità.` });
    } else if (fatDelta < 0 && leanDelta < -1) {
      out.push({ tone: "warn", text: `Massa grassa in calo, ma anche la massa magra (-${formatNumber(Math.abs(leanDelta), 1)} kg). Aumenta proteine e movimento di forza.` });
    }
  }

  if (bc.visceral_fat != null) {
    const ev = visceralFatLabel(bc.visceral_fat);
    if (ev.status === "good" && prevBc?.visceral_fat != null && prevBc.visceral_fat >= 10) {
      out.push({ tone: "positive", text: `Grasso viscerale a ${formatNumber(bc.visceral_fat, 1)}: sotto la soglia di rischio (10). Continua così.` });
    }
  }

  if (bc.metabolic_age != null && age) {
    const gap = bc.metabolic_age - age;
    if (gap > 5) {
      const prevGap = prevBc?.metabolic_age != null ? prevBc.metabolic_age - age : null;
      if (prevGap != null && bc.metabolic_age < prevBc!.metabolic_age!) {
        out.push({ tone: "positive", text: `Età metabolica ${bc.metabolic_age} anni vs ${age} anagrafici (gap +${gap}), in miglioramento di ${prevBc!.metabolic_age! - bc.metabolic_age} dall'ultima visita.` });
      } else {
        out.push({ tone: "neutral", text: `Età metabolica ${bc.metabolic_age} anni: ${gap} sopra la tua età anagrafica. Migliorerà col calo del grasso viscerale.` });
      }
    }
  }
  return out;
}

export function buildCircInsight(latestCirc: { waist_cm?: number | null } | null, height_cm: number | null): Insight | null {
  if (!latestCirc?.waist_cm || !height_cm) return null;
  const ratio = latestCirc.waist_cm / height_cm;
  const ev = whtRLabel(ratio);
  if (ev.status === "good") {
    return { tone: "positive", text: `Rapporto vita/altezza ${formatNumber(ratio, 2)}: sei sotto la soglia di rischio (0,50).` };
  }
  if (ev.status === "warn") {
    return { tone: "warn", text: `Rapporto vita/altezza ${formatNumber(ratio, 2)}: sopra la soglia di sicurezza (0,50). Obiettivo: tornare sotto 0,50.` };
  }
  return { tone: "warn", text: `Rapporto vita/altezza ${formatNumber(ratio, 2)}: sopra la soglia di rischio cardiometabolico (0,60).` };
}
