import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { extractDocumentInput, extractWithAI } from "@/lib/extraction.server";
import type { ExtractedData } from "@/lib/types";

// 1a) Upload veloce: carica il file in storage + crea record documento.
export const uploadDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => {
    if (!(input instanceof FormData)) throw new Error("Expected FormData");
    const file = input.get("file");
    if (!(file instanceof File)) throw new Error("Nessun file caricato");
    if (file.size === 0) throw new Error("File vuoto");
    if (file.size > 20 * 1024 * 1024) throw new Error("File troppo grande (max 20MB)");
    return { file };
  })
  .handler(async ({ data, context }) => {
    const { file } = data;
    const { supabase, userId } = context;
    const buffer = await file.arrayBuffer();

    const ts = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    // Path "per utente" così le policy storage filtrano per cartella e restano leggibili
    const path = `referti/${userId}/${ts}_${safeName}`;

    // Carica con il client AUTENTICATO così Storage popola owner = auth.uid()
    const uploadRes = await supabase.storage
      .from("referti")
      .upload(path, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (uploadRes.error) throw new Error(`Storage error: ${uploadRes.error.message}`);

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
      } as never)
      .select("id")
      .single();
    if (docErr || !docRow) throw new Error(`DB error: ${docErr?.message ?? "no doc"}`);

    return { documentId: docRow.id };
  });

// 1b) Job di estrazione AI. Usa supabaseAdmin per scaricare il file dallo storage
// (serve service role per leggere file di altri owner-path), ma rispetta lo scope
// utente caricando il documento dal client autenticato che applica RLS.
export const processExtraction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { documentId: string }) => input)
  .handler(async ({ data, context }) => {
    const { documentId } = data;
    const { supabase } = context;

    // Carica il record (RLS scoped all'utente)
    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("storage_path, original_name, mime_type, extraction_status")
      .eq("id", documentId)
      .single();
    if (docErr || !doc) throw new Error("Documento non trovato");

    // Idempotenza: se già completato, non rifare
    if (doc.extraction_status === "extracted" || doc.extraction_status === "confirmed") {
      return { ok: true, alreadyDone: true };
    }

    await supabase
      .from("documents")
      .update({ extraction_status: "processing", extraction_error: null } as never)
      .eq("id", documentId);

    // Download del file: usiamo il client autenticato (le policy filtrano per owner)
    const { data: blob, error: dlErr } = await supabase.storage
      .from("referti")
      .download(doc.storage_path);
    if (dlErr || !blob) {
      await supabase
        .from("documents")
        .update({
          extraction_status: "failed",
          extraction_error: `Download fallito: ${dlErr?.message ?? "file mancante"}`,
        } as never)
        .eq("id", documentId);
      throw new Error("Impossibile scaricare il file dallo storage");
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
      const msg = (e as Error).message ?? "Errore sconosciuto";
      await supabase
        .from("documents")
        .update({
          extraction_status: "failed",
          extraction_error: msg,
        } as never)
        .eq("id", documentId);
      throw e;
    }
  });

// 1c) Polling: ritorna lo stato + l'estratto se pronto
export const getExtractionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { documentId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: doc, error } = await supabase
      .from("documents")
      .select("extraction_status, extraction_raw, extraction_error")
      .eq("id", data.documentId)
      .single();
    if (error || !doc) throw new Error("Documento non trovato");
    return {
      status: doc.extraction_status as "pending" | "processing" | "extracted" | "confirmed" | "failed",
      extracted: (doc.extraction_raw as ExtractedData | null) ?? null,
      error: (doc as { extraction_error?: string | null }).extraction_error ?? null,
    };
  });

// 2) Conferma e salva i dati definitivi
export const saveConfirmedData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { documentId: string; data: ExtractedData }) => input)
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
      if (visitErr || !visitRow) throw new Error(`Errore creazione visita: ${visitErr?.message}`);
      const visitId = visitRow.id;
      visitIds.push(visitId);

      const c = v.circumferences;
      if (c && Object.values(c).some((x) => x != null)) {
        const { error } = await supabase
          .from("circumferences")
          .insert({ user_id: userId, visit_id: visitId, ...c } as never);
        if (error) throw new Error(`Errore circonferenze: ${error.message}`);
      }

      const bc = v.body_composition;
      if (bc && Object.values(bc).some((x) => x != null)) {
        const { error } = await supabase
          .from("body_composition")
          .insert({ user_id: userId, visit_id: visitId, ...bc } as never);
        if (error) throw new Error(`Errore composizione: ${error.message}`);
      }

      if (v.dexa_segments?.length) {
        const rows = v.dexa_segments
          .filter((s) => s.fat_mass_pct != null || s.lean_mass_kg != null)
          .map((s) => ({ user_id: userId, visit_id: visitId, ...s }));
        if (rows.length) {
          const { error } = await supabase.from("dexa_segments").insert(rows as never);
          if (error) throw new Error(`Errore DEXA: ${error.message}`);
        }
      }
    }

    if (extracted.blood_tests?.length && visitIds.length) {
      const rows = extracted.blood_tests
        .filter((t) => t.test_date)
        .map((t) => ({ ...t, user_id: userId, visit_id: visitIds[0] }));
      if (rows.length) {
        const { error } = await supabase.from("blood_tests").insert(rows as never);
        if (error) throw new Error(`Errore esami: ${error.message}`);
      }
    }

    // Profilo (merge dei campi non nulli) — ne esiste già uno per utente (creato dal trigger)
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

// 3) Carica tutti i dati per la dashboard (RLS scopa automaticamente all'utente)
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
  .inputValidator((input: { target_weight_kg: number | null }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("profile")
      .update({ target_weight_kg: data.target_weight_kg })
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// 5) Elimina visita (e documento collegato se presente)
export const deleteVisit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { visitId: string }) => input)
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
  .inputValidator((input: { documentId: string }) => input)
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
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl, name: doc.original_name };
  });

// 7) Hard reset: cancella TUTTI i dati DELL'UTENTE LOGGATO
export const hardResetAllData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { confirm: string }) => {
    if (input.confirm !== "RESET") throw new Error("Conferma mancante: scrivi RESET");
    return input;
  })
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // 1) Rimuovi tutti i file dell'utente nel bucket "referti".
    //    I file sono archiviati con path `referti/<userId>/...` quindi possiamo
    //    listare la cartella e cancellarli col client autenticato.
    const userFolder = `referti/${userId}`;
    const { data: ownedFiles } = await supabase.storage.from("referti").list(userFolder, { limit: 1000 });
    if (ownedFiles && ownedFiles.length) {
      const paths = ownedFiles.map((f) => `${userFolder}/${f.name}`);
      await supabase.storage.from("referti").remove(paths);
    }

    // 2) Cancella le righe (le FK ON DELETE CASCADE su user_id farebbero la stessa cosa,
    //    ma non vogliamo cancellare l'auth user — solo i suoi dati).
    //    L'ordine non importa qui perché RLS già scopa per user_id.
    await supabase.from("blood_tests").delete().eq("user_id", userId);
    await supabase.from("dexa_segments").delete().eq("user_id", userId);
    await supabase.from("body_composition").delete().eq("user_id", userId);
    await supabase.from("circumferences").delete().eq("user_id", userId);
    await supabase.from("visits").delete().eq("user_id", userId);
    await supabase.from("documents").delete().eq("user_id", userId);

    // 3) Reset campi profilo (manteniamo la riga, è collegata all'utente auth)
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
