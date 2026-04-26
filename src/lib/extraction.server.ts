// Server-only: estrazione testo da .doc/.docx con mammoth
// e chiamata a Lovable AI Gateway per ricavare i dati strutturati.
import mammoth from "mammoth";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

export async function extractTextFromDoc(buffer: ArrayBuffer, fileName: string): Promise<string> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".docx")) {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
    return result.value;
  }
  if (lower.endsWith(".doc")) {
    throw new Error(
      "I file .doc (formato Word legacy) non sono supportati. Apri il file in Word/Pages/Google Docs e salvalo come .docx, poi ricarica."
    );
  }
  if (lower.endsWith(".txt")) {
    return new TextDecoder().decode(buffer);
  }
  throw new Error(`Formato file non supportato: ${fileName}. Usa .docx o .txt.`);
}

const EXTRACTION_SCHEMA = {
  name: "extract_dietologia",
  description: "Estrae i dati strutturati da un referto dietologico italiano",
  parameters: {
    type: "object",
    properties: {
      visit: {
        type: "object",
        properties: {
          visit_date: { type: ["string", "null"], description: "Data della visita in formato YYYY-MM-DD. Esempio: '31,1,25' va interpretato come '2025-01-31'." },
          weight_kg: { type: ["number", "null"], description: "Peso in kg" },
          notes: { type: ["string", "null"] },
        },
        required: ["visit_date", "weight_kg", "notes"],
        additionalProperties: false,
      },
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
        description: "DEXA segmental: massa grassa% e massa magra kg per ogni arto/tronco",
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
      blood_tests: {
        type: "array",
        description: "Esami ematochimici: ogni colonna con una data diversa è un esame separato",
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
    required: ["visit", "circumferences", "body_composition", "dexa_segments", "blood_tests", "profile_updates"],
    additionalProperties: false,
  },
};

export async function extractWithAI(documentText: string): Promise<unknown> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY non configurata");

  const systemPrompt = `Sei un assistente che estrae dati clinici da referti dietologici italiani. Rispondi SOLO usando il tool extract_dietologia. Le date in italiano abbreviate (es. "13,6,25") vanno trasformate in formato ISO YYYY-MM-DD assumendo l'anno 20XX. Se un valore non è presente o è vuoto nel testo, restituisci null. Le tabelle DEXA segmental hanno coppie ordinate: braccio destro, braccio sinistro, gamba destra, gamba sinistra, tronco.`;

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
        { role: "user", content: `Ecco il testo del referto da analizzare:\n\n${documentText}` },
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
  if (!args) throw new Error("L'AI non ha restituito dati strutturati");
  return JSON.parse(args);
}
