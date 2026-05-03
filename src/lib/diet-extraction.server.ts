// Server-only: estrazione del piano dietetico dal documento della dietologa.
// Usa la stessa pipeline (mammoth/PDF base64) di extraction.server.ts ma
// con uno schema dedicato a piano + schema settimanale + opzioni pasto.
import type { ExtractionInput } from "@/lib/extraction.server";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
// Modello pro per gestire schemi grandi (35 celle + decine di opzioni + ricette)
// senza troncare la risposta. Fallback automatico a flash su 429/timeout.
const MODEL_PRIMARY = "google/gemini-2.5-pro";
const MODEL_FALLBACK = "google/gemini-3-flash-preview";
const AI_TIMEOUT_MS = 240_000;
const MAX_TOKENS = 16000;

const MEAL_SLOT_ENUM = ["breakfast", "mid_morning", "lunch", "afternoon", "dinner"] as const;

export const DIET_EXTRACTION_SCHEMA = {
  name: "extract_diet_plan",
  description:
    "Estrai dal referto della dietologa il piano alimentare completo: meta, indicazioni generali, schema settimanale e opzioni pasto.",
  parameters: {
    type: "object",
    properties: {
      title: { type: ["string", "null"], description: "Titolo dello schema, es. 'Schema Nutrizionale 1900'." },
      objective: { type: ["string", "null"], description: "Obiettivo del piano." },
      professional_name: { type: ["string", "null"], description: "Nome della dietologa/dietista." },
      kcal_target: { type: ["integer", "null"], description: "Calorie giornaliere se indicate (es. 1900)." },
      start_date: { type: ["string", "null"], description: "Data di emissione in formato YYYY-MM-DD." },
      general_guidelines: {
        type: "array",
        description: "Lista delle indicazioni generali (acqua, olio, verdura, alcolici…). Ogni voce è un punto.",
        items: {
          type: "object",
          properties: {
            topic: { type: "string", description: "Argomento, es. 'Acqua', 'Olio', 'Pesce'." },
            text: { type: "string", description: "Testo dell'indicazione, anche lungo." },
          },
          required: ["topic", "text"],
          additionalProperties: false,
        },
      },
      weekly_schedule: {
        type: "array",
        description:
          "Schema settimanale: per ogni giorno (1=Lun..7=Dom) e per ogni pasto, la descrizione testuale di cosa va consumato. Includi tutti i pasti che trovi nella tabella settimanale.",
        items: {
          type: "object",
          properties: {
            day_of_week: { type: "integer", minimum: 1, maximum: 7 },
            meal_slot: { type: "string", enum: MEAL_SLOT_ENUM as unknown as string[] },
            description: { type: "string", description: "Descrizione del pasto per quel giorno." },
          },
          required: ["day_of_week", "meal_slot", "description"],
          additionalProperties: false,
        },
      },
      meal_options: {
        type: "object",
        description:
          "Opzioni e alternative per categoria di pasto, equivalenze e ricette estratte dal documento.",
        properties: {
          breakfast_sweet: { type: "array", items: { type: "string" }, description: "Opzioni di colazione dolce." },
          breakfast_savory: { type: "array", items: { type: "string" }, description: "Opzioni di colazione salata." },
          snacks: { type: "array", items: { type: "string" }, description: "Opzioni spuntino." },
          first_courses: { type: "array", items: { type: "string" }, description: "Opzioni primi piatti." },
          second_courses_meat: { type: "array", items: { type: "string" }, description: "Secondi di carne." },
          second_courses_fish: { type: "array", items: { type: "string" }, description: "Secondi di pesce." },
          second_courses_eggs_cheese: { type: "array", items: { type: "string" }, description: "Uova e formaggi." },
          sides: { type: "array", items: { type: "string" }, description: "Contorni / verdura." },
          bread_equivalents: { type: "array", items: { type: "string" }, description: "Equivalenze 50g di pane." },
          cereal_equivalents: { type: "array", items: { type: "string" }, description: "Equivalenze cereali / pasta." },
          recipes: {
            type: "array",
            description: "Ricette riportate nel documento.",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                ingredients: { type: "array", items: { type: "string" } },
                steps: { type: ["string", "null"] },
              },
              required: ["name", "ingredients", "steps"],
              additionalProperties: false,
            },
          },
          frequencies: {
            type: "array",
            description: "Frequenze consigliate sui 14 pasti settimanali (es. pesce 4 volte, carne 2 volte).",
            items: { type: "string" },
          },
        },
        required: [
          "breakfast_sweet",
          "breakfast_savory",
          "snacks",
          "first_courses",
          "second_courses_meat",
          "second_courses_fish",
          "second_courses_eggs_cheese",
          "sides",
          "bread_equivalents",
          "cereal_equivalents",
          "recipes",
          "frequencies",
        ],
        additionalProperties: false,
      },
    },
    required: [
      "title",
      "objective",
      "professional_name",
      "kcal_target",
      "start_date",
      "general_guidelines",
      "weekly_schedule",
      "meal_options",
    ],
    additionalProperties: false,
  },
};

const SYSTEM_PROMPT = `Sei un assistente che estrae piani alimentari italiani dai documenti dei dietologi.

REGOLE:
1. Il documento contiene: meta (titolo schema, kcal, obiettivo, dietologa, data), indicazioni generali (acqua, olio, verdura, pesce, alcol, dolci, integrali), uno SCHEMA SETTIMANALE in tabella (colonne = giorni Lun-Dom, righe = pasti: colazione, spuntino mattina, pranzo, spuntino pomeriggio, cena) e opzioni/equivalenze.
2. Mappa i pasti agli slot: colazione=breakfast, spuntino mattina=mid_morning, pranzo=lunch, spuntino pomeriggio=afternoon, cena=dinner. Lunedì=1 ... Domenica=7.
3. Estrai TUTTI i 7 giorni × 5 pasti se presenti. Se una cella è vuota usa una stringa vuota nella description.
4. In meal_options copia fedelmente le opzioni che trovi (anche con grammature). Le frasi possono essere multi-riga: ogni elemento dell'array è UNA opzione completa.
5. Non inventare nulla. Se un campo manca, usa null o array vuoto.`;

export async function extractDietPlanWithAI(input: ExtractionInput): Promise<unknown> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY non configurata");

  const userContent =
    input.kind === "text"
      ? `Ecco il testo del referto da analizzare:\n\n${input.text}`
      : ([
          { type: "text", text: `Ecco il piano allegato (${input.fileName}). Estrai i dati strutturati.` },
          {
            type: "file",
            file: {
              filename: input.fileName,
              file_data: `data:${input.mimeType};base64,${input.base64}`,
            },
          },
        ] as unknown);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        tools: [{ type: "function", function: DIET_EXTRACTION_SCHEMA }],
        tool_choice: { type: "function", function: { name: "extract_diet_plan" } },
      }),
      signal: controller.signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      throw new Error("L'estrazione AI ha superato il limite di tempo. Riprova.");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const txt = await response.text();
    if (response.status === 429) throw new Error("Limite di richieste AI raggiunto, riprova tra poco.");
    if (response.status === 402) throw new Error("Crediti AI esauriti. Aggiungi crediti nelle impostazioni.");
    throw new Error(`AI Gateway error [${response.status}]: ${txt}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }> } }>;
  };
  const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("L'AI non ha restituito dati strutturati dal documento.");
  return JSON.parse(args);
}
