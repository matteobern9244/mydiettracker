// Server-only: estrazione testo da .doc/.docx con mammoth
// e chiamata a Lovable AI Gateway per ricavare i dati strutturati.
import mammoth from "mammoth";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

export type ExtractionInput =
  | { kind: "text"; text: string }
  | { kind: "binary"; base64: string; mimeType: string; fileName: string };

/**
 * Tenta di estrarre il testo dal documento.
 * - .docx → mammoth
 * - .txt → decode UTF-8
 * - .doc legacy → estrazione "best-effort" leggendo le stringhe UTF-16 dal CFB.
 *   Se il risultato è troppo povero, restituisce kind:"binary" così l'AI può
 *   leggere il file direttamente.
 */
export async function extractDocumentInput(
  buffer: ArrayBuffer,
  fileName: string,
  mimeType: string
): Promise<ExtractionInput> {
  const lower = fileName.toLowerCase();

  if (lower.endsWith(".docx")) {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
    const text = result.value.trim();
    if (!text) throw new Error("Il documento .docx sembra vuoto");
    return { kind: "text", text };
  }

  if (lower.endsWith(".txt")) {
    const text = new TextDecoder().decode(buffer).trim();
    if (!text) throw new Error("Il file .txt è vuoto");
    return { kind: "text", text };
  }

  if (lower.endsWith(".doc")) {
    // 1) Tentativo estrazione naive del testo dal binario .doc
    const naive = extractTextFromLegacyDoc(buffer);
    if (naive && naive.length > 200) {
      return { kind: "text", text: naive };
    }
    // 2) Fallback: invia il binario direttamente all'AI
    const base64 = bufferToBase64(buffer);
    return {
      kind: "binary",
      base64,
      mimeType: mimeType || "application/msword",
      fileName,
    };
  }

  if (lower.endsWith(".pdf")) {
    const base64 = bufferToBase64(buffer);
    return { kind: "binary", base64, mimeType: "application/pdf", fileName };
  }

  throw new Error(`Formato non supportato: ${fileName}. Usa .doc, .docx, .pdf o .txt.`);
}

function bufferToBase64(buffer: ArrayBuffer): string {
  return Buffer.from(buffer).toString("base64");
}

/**
 * Estrazione "best-effort" del testo da un file .doc (Word 97-2003 / CFB).
 * I file .doc memorizzano il testo nello stream "WordDocument" prevalentemente
 * come UTF-16LE. Qui leggiamo l'intero buffer come UTF-16LE, conserviamo i
 * caratteri stampabili e collassiamo gli spazi. Funziona bene per referti
 * testuali; per documenti complessi useremo il fallback binario all'AI.
 */
function extractTextFromLegacyDoc(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  // Decodifica UTF-16LE
  let utf16 = "";
  try {
    utf16 = new TextDecoder("utf-16le", { fatal: false }).decode(bytes);
  } catch {
    utf16 = "";
  }
  const cleaned16 = cleanExtractedText(utf16);

  // Decodifica latin1 (alcuni .doc hanno testo a 8 bit)
  const latin1 = new TextDecoder("latin1").decode(bytes);
  const cleaned8 = cleanExtractedText(latin1);

  return cleaned16.length >= cleaned8.length ? cleaned16 : cleaned8;
}

function cleanExtractedText(raw: string): string {
  // Tieni lettere, numeri, punteggiatura comune e spazi/righe
  const filtered = raw.replace(/[^\p{L}\p{N}\s.,;:()\-\/%°'"+*=<>!?€$@&\n\r\t]/gu, " ");
  // Collassa whitespace
  const collapsed = filtered.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");
  return collapsed.trim();
}

const EXTRACTION_SCHEMA = {
  name: "extract_dietologia",
  description:
    "Estrae TUTTE le visite presenti nel referto dietologico italiano. Una visita per ogni colonna/data trovata, anche se alcuni valori sono vuoti.",
  parameters: {
    type: "object",
    properties: {
      visits: {
        type: "array",
        description:
          "Una entry per OGNI colonna/data presente nel referto. Non saltare mai una colonna: se nel documento ci sono 4 colonne con date, restituisci 4 visite. Se un valore non è presente per quella colonna, usa null.",
        items: {
          type: "object",
          properties: {
            visit_date: {
              type: ["string", "null"],
              description:
                "Data della visita in formato YYYY-MM-DD. Esempio: '31,1,25' va interpretato come '2025-01-31'.",
            },
            weight_kg: { type: ["number", "null"], description: "Peso in kg per questa visita" },
            notes: { type: ["string", "null"] },
            circumferences: {
              type: "object",
              properties: {
                arm_cm: { type: ["number", "null"] },
                waist_cm: { type: ["number", "null"], description: "vita" },
                abdomen_cm: { type: ["number", "null"], description: "addome" },
                thigh_cm: { type: ["number", "null"], description: "coscia" },
                hips_cm: { type: ["number", "null"], description: "anche" },
                chest_cm: { type: ["number", "null"], description: "torace" },
                neck_cm: { type: ["number", "null"], description: "collo" },
                forearm_cm: { type: ["number", "null"], description: "avambraccio" },
                wrist_cm: { type: ["number", "null"], description: "polso" },
              },
              required: ["arm_cm", "waist_cm", "abdomen_cm", "thigh_cm", "hips_cm", "chest_cm", "neck_cm", "forearm_cm", "wrist_cm"],
              additionalProperties: false,
            },
            body_composition: {
              type: "object",
              properties: {
                fat_mass_pct: { type: ["number", "null"], description: "Massa grassa in %" },
                lean_mass_kg: { type: ["number", "null"], description: "Massa magra in kg" },
                bone_mass_kg: { type: ["number", "null"], description: "Massa ossea in kg" },
                bmi: { type: ["number", "null"] },
                metabolic_age: { type: ["integer", "null"] },
                hydration_pct: { type: ["number", "null"], description: "Idratazione in %" },
                visceral_fat: { type: ["number", "null"], description: "Livello grasso viscerale" },
              },
              required: ["fat_mass_pct", "lean_mass_kg", "bone_mass_kg", "bmi", "metabolic_age", "hydration_pct", "visceral_fat"],
              additionalProperties: false,
            },
            dexa_segments: {
              type: "array",
              description: "DEXA segmental: massa grassa% e massa magra kg per ogni arto/tronco di QUESTA visita",
              items: {
                type: "object",
                properties: {
                  segment: { type: "string", enum: ["right_arm", "left_arm", "right_leg", "left_leg", "trunk"] },
                  fat_mass_pct: { type: ["number", "null"] },
                  lean_mass_kg: { type: ["number", "null"] },
                },
                required: ["segment", "fat_mass_pct", "lean_mass_kg"],
                additionalProperties: false,
              },
            },
          },
          required: ["visit_date", "weight_kg", "notes", "circumferences", "body_composition", "dexa_segments"],
          additionalProperties: false,
        },
      },
      blood_tests: {
        type: "array",
        description: "TUTTI gli esami ematochimici trovati. Ogni colonna/data diversa è un esame separato.",
        items: {
          type: "object",
          properties: {
            test_date: { type: "string", description: "Data esame in formato YYYY-MM-DD. Se nel testo c'è solo 'Gennaio 25' usa il primo del mese: 2025-01-01." },
            hemoglobin: { type: ["number", "null"] },
            glucose: { type: ["number", "null"] },
            gamma_gt: { type: ["number", "null"] },
            alt: { type: ["number", "null"] },
            ast: { type: ["number", "null"] },
            total_cholesterol: { type: ["number", "null"] },
            hdl: { type: ["number", "null"] },
            ldl: { type: ["number", "null"] },
            triglycerides: { type: ["number", "null"] },
          },
          required: ["test_date", "hemoglobin", "glucose", "gamma_gt", "alt", "ast", "total_cholesterol", "hdl", "ldl", "triglycerides"],
          additionalProperties: false,
        },
      },
      profile_updates: {
        type: "object",
        description: "Dati anagrafici/anamnesi rilevati. Compila solo se presenti.",
        properties: {
          full_name: { type: ["string", "null"] },
          email: { type: ["string", "null"] },
          phone: { type: ["string", "null"] },
          profession: { type: ["string", "null"] },
          age: { type: ["integer", "null"] },
          height_cm: { type: ["number", "null"] },
          family_doctor: { type: ["string", "null"] },
          allergies: { type: ["string", "null"] },
          intolerances: { type: ["string", "null"] },
        },
        required: ["full_name", "email", "phone", "profession", "age", "height_cm", "family_doctor", "allergies", "intolerances"],
        additionalProperties: false,
      },
    },
    required: ["visits", "blood_tests", "profile_updates"],
    additionalProperties: false,
  },
};

export async function extractWithAI(input: ExtractionInput): Promise<unknown> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY non configurata");

  const systemPrompt = `Sei un assistente che estrae TUTTI i dati clinici da referti dietologici italiani.

REGOLE FONDAMENTALI:
1. I referti dietologici italiani usano TABELLE con UNA COLONNA PER OGNI VISITA. Devi creare un elemento di "visits" per OGNI colonna/data che trovi. NON saltare mai una colonna. Se vedi 5 date diverse, restituisci 5 visite.
2. Ogni visita deve contenere TUTTI i suoi dati associati: peso, circonferenze, composizione corporea (BMI, massa grassa, magra, viscerale, idratazione, età metabolica), DEXA segmental (braccia, gambe, tronco).
3. Se per una colonna un valore non è riportato, usa null. Non inventare e non copiare valori da altre colonne.
4. Le date in italiano abbreviate (es. "13,6,25" o "13/6/25" o "13-06-2025") vanno trasformate in formato ISO YYYY-MM-DD assumendo l'anno 20XX.
5. Le tabelle DEXA segmental hanno coppie ordinate: braccio destro, braccio sinistro, gamba destra, gamba sinistra, tronco.
6. Gli esami ematochimici sono SEPARATI dalle visite dietologiche e hanno date proprie: estraili tutti in "blood_tests".
7. I dati anagrafici (nome, età, altezza, telefono, ecc.) vanno in "profile_updates" UNA SOLA VOLTA.

ESAMINA L'INTERO DOCUMENTO. Non fermarti alla prima visita o alla prima pagina. Se il documento contiene 6 mesi di follow-up, restituisci 6 visite.`;

  // Costruisci il messaggio user (testo o multipart con file inline)
  const userContent =
    input.kind === "text"
      ? `Ecco il testo del referto da analizzare:\n\n${input.text}`
      : ([
          {
            type: "text",
            text: `Ecco il referto allegato (${input.fileName}). Estrai i dati strutturati.`,
          },
          {
            type: "file",
            file: {
              filename: input.fileName,
              file_data: `data:${input.mimeType};base64,${input.base64}`,
            },
          },
        ] as unknown);

  const response = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      tools: [{ type: "function", function: EXTRACTION_SCHEMA }],
      tool_choice: { type: "function", function: { name: "extract_dietologia" } },
    }),
  });

  if (!response.ok) {
    const txt = await response.text();
    if (response.status === 429) throw new Error("Limite di richieste AI raggiunto, riprova tra poco.");
    if (response.status === 402) throw new Error("Crediti AI esauriti. Aggiungi crediti nelle impostazioni di Lovable Cloud.");
    throw new Error(`AI Gateway error [${response.status}]: ${txt}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        tool_calls?: Array<{ function?: { arguments?: string } }>;
      };
    }>;
  };

  const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("L'AI non ha restituito dati strutturati dal documento");
  return JSON.parse(args);
}
