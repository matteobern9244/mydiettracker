import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { extractDocumentInput, extractWithAI } from "@/lib/extraction.server";
import type { ExtractedData } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers di sicurezza
// ─────────────────────────────────────────────────────────────────────────────

// Restituisce un Error con messaggio "safe" per il client e logga il dettaglio
// completo solo lato server. Evita di esporre nomi di tabelle/constraint/path
// di storage al browser tramite la serializzazione di TanStack Start.
function safeError(userMessage: string, internal?: unknown): Error {
  if (internal !== undefined) {
    // Solo log server-side
    console.error(`[dashboard] ${userMessage}`, internal);
  }
  return new Error(userMessage);
}

// Calcola SHA-256 esadecimale del contenuto del file usando Web Crypto.
async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

// ─────────────────────────────────────────────────────────────────────────────
// Schemi di validazione condivisi
// ─────────────────────────────────────────────────────────────────────────────

const uuidSchema = z.string().uuid();

const circumferencesSchema = z.object({
  arm_cm: z.number().min(0).max(300).nullable(),
  waist_cm: z.number().min(0).max(300).nullable(),
  abdomen_cm: z.number().min(0).max(300).nullable(),
  thigh_cm: z.number().min(0).max(300).nullable(),
  hips_cm: z.number().min(0).max(300).nullable(),
  chest_cm: z.number().min(0).max(300).nullable(),
  neck_cm: z.number().min(0).max(300).nullable(),
  forearm_cm: z.number().min(0).max(300).nullable(),
  wrist_cm: z.number().min(0).max(300).nullable(),
});

const bodyCompositionSchema = z.object({
  fat_mass_pct: z.number().min(0).max(100).nullable(),
  lean_mass_kg: z.number().min(0).max(500).nullable(),
  bone_mass_kg: z.number().min(0).max(50).nullable(),
  bmi: z.number().min(0).max(150).nullable(),
  metabolic_age: z.number().int().min(0).max(150).nullable(),
  hydration_pct: z.number().min(0).max(100).nullable(),
  visceral_fat: z.number().min(0).max(100).nullable(),
});

const dexaSegmentSchema = z.object({
  segment: z.enum(["right_arm", "left_arm", "right_leg", "left_leg", "trunk"]),
  fat_mass_pct: z.number().min(0).max(100).nullable(),
  lean_mass_kg: z.number().min(0).max(500).nullable(),
});

const extractedVisitSchema = z.object({
  visit_date: z.string().max(20).nullable(),
  weight_kg: z.number().min(0).max(500).nullable(),
  notes: z.string().max(5000).nullable(),
  circumferences: circumferencesSchema,
  body_composition: bodyCompositionSchema,
  dexa_segments: z.array(dexaSegmentSchema).max(20),
});

const bloodTestSchema = z.object({
  test_date: z.string().max(20),
  hemoglobin: z.number().min(0).max(100).nullable().optional(),
  glucose: z.number().min(0).max(2000).nullable().optional(),
  gamma_gt: z.number().min(0).max(10000).nullable().optional(),
  alt: z.number().min(0).max(10000).nullable().optional(),
  ast: z.number().min(0).max(10000).nullable().optional(),
  total_cholesterol: z.number().min(0).max(2000).nullable().optional(),
  hdl: z.number().min(0).max(2000).nullable().optional(),
  ldl: z.number().min(0).max(2000).nullable().optional(),
  triglycerides: z.number().min(0).max(5000).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

const profileUpdatesSchema = z.object({
  full_name: z.string().max(200).nullable().optional(),
  email: z.string().email().max(255).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  profession: z.string().max(200).nullable().optional(),
  age: z.number().int().min(0).max(150).nullable().optional(),
  height_cm: z.number().min(0).max(300).nullable().optional(),
  family_doctor: z.string().max(200).nullable().optional(),
  allergies: z.string().max(2000).nullable().optional(),
  intolerances: z.string().max(2000).nullable().optional(),
});

const extractedDataSchema = z.object({
  visits: z.array(extractedVisitSchema).min(1).max(50),
  blood_tests: z.array(bloodTestSchema).max(100),
  profile_updates: profileUpdatesSchema,
});

// Esegue upload + insert del record documento.
async function uploadAndInsertDocument(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  userId: string,
  file: File,
  contentHash: string,
): Promise<{ documentId: string }> {
  const buffer = await file.arrayBuffer();
  const ts = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `referti/${userId}/${ts}_${safeName}`;

  const uploadRes = await supabase.storage
    .from("referti")
    .upload(path, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (uploadRes.error) {
    throw safeError("Impossibile salvare il file. Riprova.", uploadRes.error.message);
  }

  const { data: docRow, error: docErr } = await supabase
    .from("documents")
    .insert({
      user_id: userId,
      original_name: file.name,
      storage_path: path,
      size_bytes: file.size,
      mime_type: file.type || null,
      extraction_status: "pending",
      extraction_error: null,
      content_hash: contentHash,
    } as never)
    .select("id")
    .single();
  if (docErr || !docRow) {
    // Rollback: rimuovi il file appena caricato per non lasciare orfani
    await supabase.storage.from("referti").remove([path]).catch(() => undefined);
    throw safeError("Impossibile registrare il documento. Riprova.", docErr?.message ?? "no doc");
  }
  return { documentId: docRow.id };
}

// Cancella un documento esistente.
async function deleteDocumentAndRelated(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  documentId: string,
): Promise<void> {
  const { data: doc } = await supabase
    .from("documents")
    .select("storage_path")
    .eq("id", documentId)
    .single();
  await supabase.from("visits").delete().eq("document_id", documentId);
  if (doc?.storage_path) {
    await supabase.storage.from("referti").remove([doc.storage_path]).catch(() => undefined);
  }
  await supabase.from("documents").delete().eq("id", documentId);
}

// 1a) Upload veloce
export const uploadDocument = createServerFn({ method: "POST" })
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

    const { data: existing } = await supabase
      .from("documents")
      .select("id, original_name, uploaded_at, extraction_status")
      .eq("content_hash", contentHash)
      .maybeSingle();

    if (existing) {
      return {
        duplicate: true as const,
        existing: {
          documentId: existing.id,
          originalName: existing.original_name as string,
          uploadedAt: existing.uploaded_at as string,
          status: existing.extraction_status as string,
        },
      };
    }

    const { documentId } = await uploadAndInsertDocument(supabase, userId, file, contentHash);
    return { duplicate: false as const, documentId };
  });

// 1a-bis) Sostituzione
export const replaceDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => {
    if (!(input instanceof FormData)) throw new Error("Richiesta non valida");
    const file = input.get("file");
    const existingId = input.get("existingDocumentId");
    if (!(file instanceof File)) throw new Error("Nessun file caricato");
    if (file.size === 0) throw new Error("File vuoto");
    if (file.size > 20 * 1024 * 1024) throw new Error("File troppo grande (max 20MB)");
    if (file.name.length > 255) throw new Error("Nome file troppo lungo");
    if (typeof existingId !== "string") throw new Error("ID documento mancante");
    const parsed = uuidSchema.safeParse(existingId);
    if (!parsed.success) throw new Error("ID documento non valido");
    return { file, existingDocumentId: parsed.data };
  })
  .handler(async ({ data, context }) => {
    const { file, existingDocumentId } = data;
    const { supabase, userId } = context;
    const buffer = await file.arrayBuffer();
    const contentHash = await sha256Hex(buffer);

    await deleteDocumentAndRelated(supabase, existingDocumentId);

    const { documentId } = await uploadAndInsertDocument(supabase, userId, file, contentHash);
    return { documentId };
  });

// 1b) Job di estrazione AI
export const processExtraction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { documentId: string }) => {
    const parsed = z.object({ documentId: uuidSchema }).safeParse(input);
    if (!parsed.success) throw new Error("ID documento non valido");
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    const { documentId } = data;
    const { supabase } = context;

    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("storage_path, original_name, mime_type, extraction_status")
      .eq("id", documentId)
      .single();
    if (docErr || !doc) throw safeError("Documento non trovato", docErr?.message);

    if (doc.extraction_status === "extracted" || doc.extraction_status === "confirmed") {
      return { ok: true, alreadyDone: true };
    }

    await supabase
      .from("documents")
      .update({ extraction_status: "processing", extraction_error: null } as never)
      .eq("id", documentId);

    const { data: blob, error: dlErr } = await supabase.storage
      .from("referti")
      .download(doc.storage_path);
    if (dlErr || !blob) {
      await supabase
        .from("documents")
        .update({
          extraction_status: "failed",
          extraction_error: "Impossibile scaricare il file dallo storage",
        } as never)
        .eq("id", documentId);
      throw safeError("Impossibile scaricare il file dallo storage", dlErr?.message);
    }
    const buffer = await blob.arrayBuffer();

    try {
      const aiInput = await extractDocumentInput(buffer, doc.original_name, doc.mime_type || "");
      const extracted = await extractWithAI(aiInput);
      await supabase
        .from("documents")
        .update({
          extraction_status: "extracted",
          extraction_raw: extracted as never,
          extraction_error: null,
        } as never)
        .eq("id", documentId);
      return { ok: true };
    } catch (e) {
      const internalMsg = (e as Error).message ?? "Errore sconosciuto";
      console.error("[dashboard] extraction failed", internalMsg);
      // Salva un messaggio sintetico anche nel DB (visibile all'utente in UI)
      await supabase
        .from("documents")
        .update({
          extraction_status: "failed",
          extraction_error: "Estrazione automatica non riuscita. Riprova o usa un .docx.",
        } as never)
        .eq("id", documentId);
      throw safeError("Estrazione automatica non riuscita. Riprova o usa un .docx.");
    }
  });

// 1c) Polling: ritorna lo stato + l'estratto se pronto
export const getExtractionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { documentId: string }) => {
    const parsed = z.object({ documentId: uuidSchema }).safeParse(input);
    if (!parsed.success) throw new Error("ID documento non valido");
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: doc, error } = await supabase
      .from("documents")
      .select("extraction_status, extraction_raw, extraction_error")
      .eq("id", data.documentId)
      .single();
    if (error || !doc) throw safeError("Documento non trovato", error?.message);
    return {
      status: doc.extraction_status as "pending" | "processing" | "extracted" | "confirmed" | "failed",
      extracted: (doc.extraction_raw as ExtractedData | null) ?? null,
      error: (doc as { extraction_error?: string | null }).extraction_error ?? null,
    };
  });

// 2) Conferma e salva i dati definitivi
export const saveConfirmedData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { documentId: string; data: ExtractedData }) => {
    const parsed = z
      .object({ documentId: uuidSchema, data: extractedDataSchema })
      .safeParse(input);
    if (!parsed.success) {
      console.error("[dashboard] saveConfirmedData validation", parsed.error.flatten());
      throw new Error("Dati non validi: controlla i campi compilati.");
    }
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    const { documentId, data: extracted } = data;
    const { supabase, userId } = context;
    const visitsList = extracted.visits ?? [];
    if (visitsList.length === 0) throw new Error("Nessuna visita da salvare");
    if (visitsList.some((v) => !v.visit_date)) {
      throw new Error("Tutte le visite devono avere una data");
    }

    const visitIds: string[] = [];

    for (const v of visitsList) {
      const { data: visitRow, error: visitErr } = await supabase
        .from("visits")
        .insert({
          user_id: userId,
          visit_date: v.visit_date as string,
          weight_kg: v.weight_kg,
          notes: v.notes,
          document_id: documentId,
        } as never)
        .select("id")
        .single();
      if (visitErr || !visitRow) {
        throw safeError("Impossibile salvare la visita. Riprova.", visitErr?.message);
      }
      const visitId = visitRow.id;
      visitIds.push(visitId);

      const c = v.circumferences;
      if (c && Object.values(c).some((x) => x != null)) {
        const { error } = await supabase
          .from("circumferences")
          .insert({ user_id: userId, visit_id: visitId, ...c } as never);
        if (error) throw safeError("Impossibile salvare le circonferenze.", error.message);
      }

      const bc = v.body_composition;
      if (bc && Object.values(bc).some((x) => x != null)) {
        const { error } = await supabase
          .from("body_composition")
          .insert({ user_id: userId, visit_id: visitId, ...bc } as never);
        if (error) throw safeError("Impossibile salvare la composizione corporea.", error.message);
      }

      if (v.dexa_segments?.length) {
        const rows = v.dexa_segments
          .filter((s) => s.fat_mass_pct != null || s.lean_mass_kg != null)
          .map((s) => ({ user_id: userId, visit_id: visitId, ...s }));
        if (rows.length) {
          const { error } = await supabase.from("dexa_segments").insert(rows as never);
          if (error) throw safeError("Impossibile salvare i dati DEXA.", error.message);
        }
      }
    }

    if (extracted.blood_tests?.length && visitIds.length) {
      const rows = extracted.blood_tests
        .filter((t) => t.test_date)
        .map((t) => ({ ...t, user_id: userId, visit_id: visitIds[0] }));
      if (rows.length) {
        const { error } = await supabase.from("blood_tests").insert(rows as never);
        if (error) throw safeError("Impossibile salvare gli esami del sangue.", error.message);
      }
    }

    // Profilo (merge dei campi non nulli)
    const pu = extracted.profile_updates;
    const updates: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(pu)) {
      if (val != null && val !== "") updates[k] = val;
    }
    if (Object.keys(updates).length) {
      await supabase.from("profile").update(updates as never).eq("user_id", userId);
    }

    await supabase
      .from("documents")
      .update({ extraction_status: "confirmed" })
      .eq("id", documentId);

    return { visitIds, count: visitIds.length };
  });

// 3) Carica tutti i dati per la dashboard
export const getDashboardData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [profileRes, visitsRes, circRes, bcRes, dexaRes, bloodRes, docsRes] = await Promise.all([
      supabase.from("profile").select("*").maybeSingle(),
      supabase.from("visits").select("*").order("visit_date", { ascending: true }),
      supabase.from("circumferences").select("*"),
      supabase.from("body_composition").select("*"),
      supabase.from("dexa_segments").select("*"),
      supabase.from("blood_tests").select("*").order("test_date", { ascending: true }),
      supabase.from("documents").select("*").order("uploaded_at", { ascending: false }),
    ]);

    return {
      profile: profileRes.data ?? null,
      visits: visitsRes.data ?? [],
      circumferences: circRes.data ?? [],
      body_composition: bcRes.data ?? [],
      dexa_segments: dexaRes.data ?? [],
      blood_tests: bloodRes.data ?? [],
      documents: docsRes.data ?? [],
    };
  });

// 4) Aggiorna peso target
export const updateTargetWeight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { target_weight_kg: number | null }) => {
    const parsed = z
      .object({ target_weight_kg: z.number().min(20).max(500).nullable() })
      .safeParse(input);
    if (!parsed.success) throw new Error("Peso target non valido (20-500 kg)");
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("profile")
      .update({ target_weight_kg: data.target_weight_kg })
      .eq("user_id", userId);
    if (error) throw safeError("Impossibile aggiornare il peso target.", error.message);
    return { ok: true };
  });

// 5) Elimina visita (e documento collegato se presente)
export const deleteVisit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { visitId: string }) => {
    const parsed = z.object({ visitId: uuidSchema }).safeParse(input);
    if (!parsed.success) throw new Error("ID visita non valido");
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: visit } = await supabase
      .from("visits")
      .select("document_id")
      .eq("id", data.visitId)
      .single();
    await supabase.from("visits").delete().eq("id", data.visitId);
    if (visit?.document_id) {
      const { data: doc } = await supabase
        .from("documents")
        .select("storage_path")
        .eq("id", visit.document_id)
        .single();
      if (doc?.storage_path) {
        await supabase.storage.from("referti").remove([doc.storage_path]);
      }
      await supabase.from("documents").delete().eq("id", visit.document_id);
    }
    return { ok: true };
  });

// 6) Crea signed URL per scaricare un documento
export const getDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { documentId: string }) => {
    const parsed = z.object({ documentId: uuidSchema }).safeParse(input);
    if (!parsed.success) throw new Error("ID documento non valido");
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: doc } = await supabase
      .from("documents")
      .select("storage_path, original_name")
      .eq("id", data.documentId)
      .single();
    if (!doc) throw new Error("Documento non trovato");
    const { data: signed, error } = await supabase.storage
      .from("referti")
      .createSignedUrl(doc.storage_path, 60 * 5);
    if (error) throw safeError("Impossibile generare il link di download.", error.message);
    return { url: signed.signedUrl, name: doc.original_name };
  });

// 7) Hard reset: cancella TUTTI i dati DELL'UTENTE LOGGATO
export const hardResetAllData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { confirm: string }) => {
    const parsed = z.object({ confirm: z.literal("RESET") }).safeParse(input);
    if (!parsed.success) throw new Error("Conferma mancante: scrivi RESET");
    return parsed.data;
  })
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const userFolder = `referti/${userId}`;
    const { data: ownedFiles } = await supabase.storage.from("referti").list(userFolder, { limit: 1000 });
    if (ownedFiles && ownedFiles.length) {
      const paths = ownedFiles.map((f) => `${userFolder}/${f.name}`);
      await supabase.storage.from("referti").remove(paths);
    }

    await supabase.from("blood_tests").delete().eq("user_id", userId);
    await supabase.from("dexa_segments").delete().eq("user_id", userId);
    await supabase.from("body_composition").delete().eq("user_id", userId);
    await supabase.from("circumferences").delete().eq("user_id", userId);
    await supabase.from("visits").delete().eq("user_id", userId);
    await supabase.from("documents").delete().eq("user_id", userId);

    await supabase
      .from("profile")
      .update({
        full_name: null,
        phone: null,
        profession: null,
        age: null,
        birth_date: null,
        height_cm: null,
        target_weight_kg: null,
        family_doctor: null,
        goal: null,
        allergies: null,
        intolerances: null,
        family_history: {},
        pathologies: {},
        medications: [],
        food_preferences: {},
        food_diary: {},
        weight_history: {},
      } as never)
      .eq("user_id", userId);

    return { ok: true };
  });
