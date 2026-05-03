import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { extractDocumentInput } from "@/lib/extraction.server";
import { extractDietPlanWithAI } from "@/lib/diet-extraction.server";

// ─────────────────────────────────────────────────────────────────────────────
// Tipi & schemi
// ─────────────────────────────────────────────────────────────────────────────

export const MEAL_SLOTS = ["breakfast", "mid_morning", "lunch", "afternoon", "dinner"] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export interface GuidelineItem {
  topic: string;
  text: string;
}

export interface WeeklyEntry {
  day_of_week: number; // 1..7
  meal_slot: MealSlot;
  description: string;
}

export interface MealOptions {
  breakfast_sweet: string[];
  breakfast_savory: string[];
  snacks: string[];
  first_courses: string[];
  second_courses_meat: string[];
  second_courses_fish: string[];
  second_courses_eggs_cheese: string[];
  sides: string[];
  bread_equivalents: string[];
  cereal_equivalents: string[];
  recipes: Array<{ name: string; ingredients: string[]; steps: string | null }>;
  frequencies: string[];
}

export interface DietPlanDraft {
  title: string | null;
  objective: string | null;
  professional_name: string | null;
  kcal_target: number | null;
  start_date: string | null;
  general_guidelines: GuidelineItem[];
  weekly_schedule: WeeklyEntry[];
  meal_options: MealOptions;
}

const uuidSchema = z.string().uuid();

const guidelineSchema = z.object({
  topic: z.string().max(200),
  text: z.string().max(4000),
});

const weeklyEntrySchema = z.object({
  day_of_week: z.number().int().min(1).max(7),
  meal_slot: z.enum(MEAL_SLOTS),
  description: z.string().max(2000),
});

const mealOptionsSchema = z.object({
  breakfast_sweet: z.array(z.string().max(2000)).max(50),
  breakfast_savory: z.array(z.string().max(2000)).max(50),
  snacks: z.array(z.string().max(2000)).max(50),
  first_courses: z.array(z.string().max(2000)).max(100),
  second_courses_meat: z.array(z.string().max(2000)).max(50),
  second_courses_fish: z.array(z.string().max(2000)).max(50),
  second_courses_eggs_cheese: z.array(z.string().max(2000)).max(50),
  sides: z.array(z.string().max(2000)).max(50),
  bread_equivalents: z.array(z.string().max(500)).max(50),
  cereal_equivalents: z.array(z.string().max(500)).max(50),
  recipes: z
    .array(
      z.object({
        name: z.string().max(200),
        ingredients: z.array(z.string().max(500)).max(50),
        steps: z.string().max(5000).nullable(),
      }),
    )
    .max(50),
  frequencies: z.array(z.string().max(500)).max(30),
});

const dietPlanDraftSchema = z.object({
  title: z.string().max(200).nullable(),
  objective: z.string().max(500).nullable(),
  professional_name: z.string().max(200).nullable(),
  kcal_target: z.number().int().min(500).max(6000).nullable(),
  start_date: z.string().max(20).nullable(),
  general_guidelines: z.array(guidelineSchema).max(100),
  weekly_schedule: z.array(weeklyEntrySchema).max(100),
  meal_options: mealOptionsSchema,
});

function safeError(userMessage: string, internal?: unknown): Error {
  if (internal !== undefined) console.error(`[diet] ${userMessage}`, internal);
  return new Error(userMessage);
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1) Upload documento dieta + estrazione AI (sincrona)
// ─────────────────────────────────────────────────────────────────────────────

export const uploadDietDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => {
    if (!(input instanceof FormData)) throw new Error("Richiesta non valida");
    const file = input.get("file");
    if (!(file instanceof File)) throw new Error("Nessun file caricato");
    if (file.size === 0) throw new Error("File vuoto");
    if (file.size > 20 * 1024 * 1024) throw new Error("File troppo grande (max 20MB)");
    if (file.name.length > 255) throw new Error("Nome file troppo lungo");
    return { file };
  })
  .handler(async ({ data, context }) => {
    const { file } = data;
    const { supabase, userId } = context;

    const buffer = await file.arrayBuffer();
    const contentHash = await sha256Hex(buffer);

    // Upload bucket referti
    const ts = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${userId}/diet/${ts}_${safeName}`;
    const upRes = await supabase.storage.from("referti").upload(path, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (upRes.error) throw safeError("Impossibile salvare il file. Riprova.", upRes.error.message);

    const { data: docRow, error: docErr } = await supabase
      .from("documents")
      .insert({
        user_id: userId,
        original_name: file.name,
        storage_path: path,
        size_bytes: file.size,
        mime_type: file.type || null,
        extraction_status: "processing",
        content_hash: contentHash,
      } as never)
      .select("id")
      .single();
    if (docErr || !docRow) {
      await supabase.storage.from("referti").remove([path]).catch(() => undefined);
      throw safeError("Impossibile registrare il documento.", docErr?.message);
    }
    const documentId = docRow.id as string;

    // Estrazione AI inline
    try {
      const aiInput = await extractDocumentInput(buffer, file.name, file.type || "");
      const raw = await extractDietPlanWithAI(aiInput);
      const draft = dietPlanDraftSchema.parse(raw);
      await supabase
        .from("documents")
        .update({ extraction_status: "extracted", extraction_raw: draft as never } as never)
        .eq("id", documentId);
      return { documentId, draft };
    } catch (e) {
      await supabase
        .from("documents")
        .update({
          extraction_status: "failed",
          extraction_error: "Estrazione automatica del piano non riuscita.",
        } as never)
        .eq("id", documentId);
      throw safeError((e as Error).message || "Estrazione automatica non riuscita.");
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// 2) Conferma e salva piano (archivia il precedente)
// ─────────────────────────────────────────────────────────────────────────────

export const confirmDietPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { documentId: string; draft: DietPlanDraft }) => {
    const parsed = z
      .object({ documentId: uuidSchema, draft: dietPlanDraftSchema })
      .safeParse(input);
    if (!parsed.success) {
      console.error("[diet] confirmDietPlan validation", parsed.error.flatten());
      throw new Error("Dati del piano non validi.");
    }
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    const { documentId, draft } = data;
    const { supabase, userId } = context;

    // 1) Disattiva eventuali piani attivi precedenti
    await supabase
      .from("diet_plans")
      .update({ is_active: false } as never)
      .eq("user_id", userId)
      .eq("is_active", true);

    // 2) Inserisci nuovo piano attivo
    const { data: planRow, error: planErr } = await supabase
      .from("diet_plans")
      .insert({
        user_id: userId,
        title: draft.title,
        objective: draft.objective,
        professional_name: draft.professional_name,
        kcal_target: draft.kcal_target,
        start_date: draft.start_date,
        is_active: true,
        general_guidelines: draft.general_guidelines as never,
        meal_options: draft.meal_options as never,
        document_id: documentId,
      } as never)
      .select("id")
      .single();
    if (planErr || !planRow) throw safeError("Impossibile salvare il piano.", planErr?.message);
    const planId = planRow.id as string;

    // 3) Inserisci schema settimanale
    if (draft.weekly_schedule.length) {
      const rows = draft.weekly_schedule.map((w) => ({
        user_id: userId,
        plan_id: planId,
        day_of_week: w.day_of_week,
        meal_slot: w.meal_slot,
        description: w.description,
        details: {} as never,
      }));
      const { error } = await supabase.from("diet_weekly_schedule").insert(rows as never);
      if (error) throw safeError("Impossibile salvare lo schema settimanale.", error.message);
    }

    await supabase
      .from("documents")
      .update({ extraction_status: "confirmed" } as never)
      .eq("id", documentId);

    return { planId };
  });

// ─────────────────────────────────────────────────────────────────────────────
// 3) Carica piano attivo + schedule + log della settimana
// ─────────────────────────────────────────────────────────────────────────────

export const getActiveDietPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: plan } = await supabase
      .from("diet_plans")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();

    if (!plan) return { plan: null, schedule: [], logs: [] };

    const planId = (plan as { id: string }).id;

    const [{ data: schedule }, { data: logs }] = await Promise.all([
      supabase
        .from("diet_weekly_schedule")
        .select("*")
        .eq("plan_id", planId)
        .order("day_of_week", { ascending: true }),
      supabase
        .from("diet_meal_logs")
        .select("*")
        .eq("user_id", userId)
        .gte("log_date", new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString().slice(0, 10)),
    ]);

    return { plan, schedule: schedule ?? [], logs: logs ?? [] };
  });

// ─────────────────────────────────────────────────────────────────────────────
// 4) Toggle log pasto
// ─────────────────────────────────────────────────────────────────────────────

export const toggleMealLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { logDate: string; mealSlot: MealSlot; consumed: boolean; planId?: string | null; note?: string | null }) => {
      const parsed = z
        .object({
          logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          mealSlot: z.enum(MEAL_SLOTS),
          consumed: z.boolean(),
          planId: uuidSchema.nullish(),
          note: z.string().max(1000).nullish(),
        })
        .safeParse(input);
      if (!parsed.success) throw new Error("Parametri non validi");
      return parsed.data;
    },
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { logDate, mealSlot, consumed, planId, note } = data;

    if (!consumed && !note) {
      // Rimuovi il log
      await supabase
        .from("diet_meal_logs")
        .delete()
        .eq("user_id", userId)
        .eq("log_date", logDate)
        .eq("meal_slot", mealSlot);
      return { ok: true };
    }

    const { error } = await supabase
      .from("diet_meal_logs")
      .upsert(
        {
          user_id: userId,
          plan_id: planId ?? null,
          log_date: logDate,
          meal_slot: mealSlot,
          consumed,
          note: note ?? null,
        } as never,
        { onConflict: "user_id,log_date,meal_slot" },
      );
    if (error) throw safeError("Impossibile aggiornare il log del pasto.", error.message);
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// 5) Genera lista della spesa per una settimana
// ─────────────────────────────────────────────────────────────────────────────

export const generateShoppingList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { weekStart: string }) => {
    const parsed = z.object({ weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse(input);
    if (!parsed.success) throw new Error("Data non valida");
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { weekStart } = data;

    const { data: plan } = await supabase
      .from("diet_plans")
      .select("id, meal_options")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();
    if (!plan) throw safeError("Nessun piano attivo. Carica prima il piano alimentare.");

    const { data: schedule } = await supabase
      .from("diet_weekly_schedule")
      .select("description, meal_slot")
      .eq("plan_id", (plan as { id: string }).id);

    const items = aggregateShoppingItems((schedule ?? []).map((r) => (r as { description: string }).description));

    const { error } = await supabase
      .from("diet_shopping_lists")
      .upsert(
        {
          user_id: userId,
          plan_id: (plan as { id: string }).id,
          week_start: weekStart,
          items: items as never,
        } as never,
        { onConflict: "user_id,week_start" },
      );
    if (error) throw safeError("Impossibile salvare la lista della spesa.", error.message);

    return { items };
  });

export const getShoppingList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { weekStart: string }) => {
    const parsed = z.object({ weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse(input);
    if (!parsed.success) throw new Error("Data non valida");
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("diet_shopping_lists")
      .select("items")
      .eq("user_id", userId)
      .eq("week_start", data.weekStart)
      .maybeSingle();
    return { items: (row?.items as ShoppingItem[] | undefined) ?? null };
  });

export const updateShoppingList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { weekStart: string; items: ShoppingItem[] }) => {
    const itemSchema = z.object({
      name: z.string().max(200),
      quantity: z.string().max(100).nullable(),
      category: z.string().max(100),
      checked: z.boolean(),
    });
    const parsed = z
      .object({ weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), items: z.array(itemSchema).max(500) })
      .safeParse(input);
    if (!parsed.success) throw new Error("Lista non valida");
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: plan } = await supabase
      .from("diet_plans")
      .select("id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();
    const { error } = await supabase
      .from("diet_shopping_lists")
      .upsert(
        {
          user_id: userId,
          plan_id: (plan as { id: string } | null)?.id ?? null,
          week_start: data.weekStart,
          items: data.items as never,
        } as never,
        { onConflict: "user_id,week_start" },
      );
    if (error) throw safeError("Impossibile aggiornare la lista.", error.message);
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// Aggregatore "best-effort" della lista della spesa
// ─────────────────────────────────────────────────────────────────────────────

export interface ShoppingItem {
  name: string;
  quantity: string | null;
  category: string;
  checked: boolean;
}

const CATEGORY_KEYWORDS: Array<{ category: string; keywords: string[] }> = [
  {
    category: "Frutta e verdura",
    keywords: [
      "frutta", "verdura", "mela", "banana", "pera", "uva", "kiwi", "arancia",
      "fragole", "mirtilli", "lamponi", "albicocche", "pomodor", "zucchin", "carota",
      "insalata", "lattuga", "ravanell", "spinaci", "broccoli", "cavolfiore",
      "fagiolini", "asparagi", "melanzan", "peperon", "cipolla", "aglio", "limone",
      "barbabietola", "patate", "cetriol", "sedano", "zucca",
    ],
  },
  {
    category: "Cereali e pane",
    keywords: [
      "pane", "pasta", "riso", "farro", "orzo", "quinoa", "amaranto", "grano saraceno",
      "cous cous", "cuscus", "polenta", "fiocchi", "muesli", "cornflakes", "fette biscottate",
      "wasa", "gallette", "biscott", "frollin", "savoiard", "porridge", "avena",
    ],
  },
  {
    category: "Proteine animali",
    keywords: [
      "pollo", "tacchino", "vitello", "manzo", "bovino", "coniglio", "scaloppina",
      "pesce", "tonno", "salmone", "gamberetti", "vongole", "merluzzo", "platess",
      "bresaola", "crudo", "cotto", "affettato", "uova", "uovo",
    ],
  },
  {
    category: "Latticini",
    keywords: [
      "latte", "yogurt", "kefir", "skyr", "ricotta", "fiocchi di latte", "mozzarella",
      "stracciatella", "primosale", "parmigiano", "emmenthal", "pecorino", "stracchino",
      "feta", "philadelphia", "scamorza", "gorgonzola", "caprino",
    ],
  },
  {
    category: "Legumi",
    keywords: ["legum", "ceci", "fagioli", "lenticchie", "piselli", "fave", "soia"],
  },
  {
    category: "Condimenti e altro",
    keywords: [
      "olio", "aceto", "sale", "pepe", "spezie", "curry", "miele", "marmellata",
      "cioccolato", "cacao", "noci", "mandorle", "nocciole", "pinoli", "frutta secca",
    ],
  },
];

function categorizeIngredient(name: string): string {
  const lower = name.toLowerCase();
  for (const { category, keywords } of CATEGORY_KEYWORDS) {
    if (keywords.some((k) => lower.includes(k))) return category;
  }
  return "Altro";
}

function aggregateShoppingItems(descriptions: string[]): ShoppingItem[] {
  // Estrai parole chiave alimentari dalle descrizioni del piano settimanale
  const found = new Map<string, ShoppingItem>();
  for (const desc of descriptions) {
    if (!desc) continue;
    const tokens = desc
      .toLowerCase()
      .split(/[,;.\/+()]|\s-\s|\so\s|\soppure\s|\se\s/)
      .map((t) => t.trim())
      .filter((t) => t.length > 2 && t.length < 60);
    for (const t of tokens) {
      // rimuovi grammature dal nome ma conservale come quantity
      const grammaturaMatch = t.match(/\b(\d+\s?(g|gr|ml|kg|cl)\b)/i);
      const quantity = grammaturaMatch ? grammaturaMatch[1] : null;
      const name = t.replace(/\b\d+\s?(g|gr|ml|kg|cl)\b/gi, "").replace(/\s+/g, " ").trim();
      if (!name || name.length < 3) continue;
      const cleanName = name.charAt(0).toUpperCase() + name.slice(1);
      const category = categorizeIngredient(cleanName);
      if (category === "Altro") continue; // skip junk tokens
      const key = cleanName.toLowerCase();
      if (!found.has(key)) {
        found.set(key, { name: cleanName, quantity, category, checked: false });
      }
    }
  }
  return Array.from(found.values()).sort((a, b) => a.category.localeCompare(b.category));
}

// ─────────────────────────────────────────────────────────────────────────────
// 6) Elimina piano attivo
// ─────────────────────────────────────────────────────────────────────────────

export const deleteActiveDietPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await supabase.from("diet_plans").delete().eq("user_id", userId).eq("is_active", true);
    return { ok: true };
  });
