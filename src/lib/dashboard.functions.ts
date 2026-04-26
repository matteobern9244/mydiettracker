import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { extractDocumentInput, extractWithAI } from "@/lib/extraction.server";
import type { ExtractedData } from "@/lib/types";

// 1) Upload del file → estrazione AI → ritorna {documentId, extracted}
export const uploadAndExtract = createServerFn({ method: "POST" })
  .inputValidator((input) => {
    if (!(input instanceof FormData)) throw new Error("Expected FormData");
    const file = input.get("file");
    if (!(file instanceof File)) throw new Error("Nessun file caricato");
    if (file.size === 0) throw new Error("File vuoto");
    if (file.size > 20 * 1024 * 1024) throw new Error("File troppo grande (max 20MB)");
    return { file };
  })
  .handler(async ({ data }) => {
    const { file } = data;
    const buffer = await file.arrayBuffer();

    // 1) Carica il file in storage
    const ts = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `referti/${ts}_${safeName}`;
    const uploadRes = await supabaseAdmin.storage
      .from("referti")
      .upload(path, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (uploadRes.error) throw new Error(`Storage error: ${uploadRes.error.message}`);

    // 2) Crea record document
    const { data: docRow, error: docErr } = await supabaseAdmin
      .from("documents")
      .insert({
        original_name: file.name,
        storage_path: path,
        size_bytes: file.size,
        mime_type: file.type || null,
        extraction_status: "pending",
      })
      .select("id")
      .single();
    if (docErr || !docRow) throw new Error(`DB error: ${docErr?.message ?? "no doc"}`);

    // 3) Prepara input per l'AI (testo se possibile, altrimenti binario inline)
    let aiInput;
    try {
      aiInput = await extractDocumentInput(buffer, file.name, file.type || "");
    } catch (e) {
      await supabaseAdmin
        .from("documents")
        .update({ extraction_status: "failed" })
        .eq("id", docRow.id);
      throw new Error(`Impossibile leggere il file: ${(e as Error).message}`);
    }

    // 4) Chiama AI
    let extracted: unknown;
    try {
      extracted = await extractWithAI(aiInput);
    } catch (e) {
      await supabaseAdmin
        .from("documents")
        .update({ extraction_status: "failed" })
        .eq("id", docRow.id);
      throw e;
    }

    await supabaseAdmin
      .from("documents")
      .update({
        extraction_status: "extracted",
        extraction_raw: extracted as never,
      })
      .eq("id", docRow.id);

    return { documentId: docRow.id, extracted: extracted as ExtractedData };
  });

// 2) Conferma e salva i dati definitivi (può aver subito edit dal frontend)
export const saveConfirmedData = createServerFn({ method: "POST" })
  .inputValidator((input: { documentId: string; data: ExtractedData }) => input)
  .handler(async ({ data }) => {
    const { documentId, data: extracted } = data;
    const visitsList = extracted.visits ?? [];
    if (visitsList.length === 0) throw new Error("Nessuna visita da salvare");
    if (visitsList.some((v) => !v.visit_date)) {
      throw new Error("Tutte le visite devono avere una data");
    }

    const visitIds: string[] = [];

    for (const v of visitsList) {
      // Crea visita
      const { data: visitRow, error: visitErr } = await supabaseAdmin
        .from("visits")
        .insert({
          visit_date: v.visit_date as string,
          weight_kg: v.weight_kg,
          notes: v.notes,
          document_id: documentId,
        })
        .select("id")
        .single();
      if (visitErr || !visitRow) throw new Error(`Errore creazione visita: ${visitErr?.message}`);
      const visitId = visitRow.id;
      visitIds.push(visitId);

      // Circonferenze
      const c = v.circumferences;
      if (c && Object.values(c).some((x) => x != null)) {
        const { error } = await supabaseAdmin
          .from("circumferences")
          .insert({ visit_id: visitId, ...c });
        if (error) throw new Error(`Errore circonferenze: ${error.message}`);
      }

      // Composizione
      const bc = v.body_composition;
      if (bc && Object.values(bc).some((x) => x != null)) {
        const { error } = await supabaseAdmin
          .from("body_composition")
          .insert({ visit_id: visitId, ...bc });
        if (error) throw new Error(`Errore composizione: ${error.message}`);
      }

      // DEXA segments
      if (v.dexa_segments?.length) {
        const rows = v.dexa_segments
          .filter((s) => s.fat_mass_pct != null || s.lean_mass_kg != null)
          .map((s) => ({ visit_id: visitId, ...s }));
        if (rows.length) {
          const { error } = await supabaseAdmin.from("dexa_segments").insert(rows);
          if (error) throw new Error(`Errore DEXA: ${error.message}`);
        }
      }
    }

    // Esami ematochimici (collegati alla prima visita per cleanup)
    if (extracted.blood_tests?.length && visitIds.length) {
      const rows = extracted.blood_tests
        .filter((t) => t.test_date)
        .map((t) => ({ ...t, visit_id: visitIds[0] }));
      if (rows.length) {
        const { error } = await supabaseAdmin.from("blood_tests").insert(rows);
        if (error) throw new Error(`Errore esami: ${error.message}`);
      }
    }

    // Profilo (merge dei campi non nulli)
    const pu = extracted.profile_updates;
    const updates: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(pu)) {
      if (val != null && val !== "") updates[k] = val;
    }
    if (Object.keys(updates).length) {
      const { data: prof } = await supabaseAdmin.from("profile").select("id").limit(1).single();
      if (prof) {
        await supabaseAdmin.from("profile").update(updates as never).eq("id", prof.id);
      }
    }

    await supabaseAdmin
      .from("documents")
      .update({ extraction_status: "confirmed" })
      .eq("id", documentId);

    return { visitIds, count: visitIds.length };
  });

// 3) Carica tutti i dati per la dashboard
export const getDashboardData = createServerFn({ method: "GET" }).handler(async () => {
  const [profileRes, visitsRes, circRes, bcRes, dexaRes, bloodRes, docsRes] = await Promise.all([
    supabaseAdmin.from("profile").select("*").limit(1).maybeSingle(),
    supabaseAdmin.from("visits").select("*").order("visit_date", { ascending: true }),
    supabaseAdmin.from("circumferences").select("*"),
    supabaseAdmin.from("body_composition").select("*"),
    supabaseAdmin.from("dexa_segments").select("*"),
    supabaseAdmin.from("blood_tests").select("*").order("test_date", { ascending: true }),
    supabaseAdmin.from("documents").select("*").order("uploaded_at", { ascending: false }),
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
  .inputValidator((input: { target_weight_kg: number | null }) => input)
  .handler(async ({ data }) => {
    const { data: prof } = await supabaseAdmin.from("profile").select("id").limit(1).single();
    if (!prof) throw new Error("Profilo non trovato");
    const { error } = await supabaseAdmin
      .from("profile")
      .update({ target_weight_kg: data.target_weight_kg })
      .eq("id", prof.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// 5) Elimina visita (e file collegato se richiesto)
export const deleteVisit = createServerFn({ method: "POST" })
  .inputValidator((input: { visitId: string }) => input)
  .handler(async ({ data }) => {
    // Recupera doc id per pulire storage
    const { data: visit } = await supabaseAdmin
      .from("visits")
      .select("document_id")
      .eq("id", data.visitId)
      .single();
    await supabaseAdmin.from("visits").delete().eq("id", data.visitId);
    if (visit?.document_id) {
      const { data: doc } = await supabaseAdmin
        .from("documents")
        .select("storage_path")
        .eq("id", visit.document_id)
        .single();
      if (doc?.storage_path) {
        await supabaseAdmin.storage.from("referti").remove([doc.storage_path]);
      }
      await supabaseAdmin.from("documents").delete().eq("id", visit.document_id);
    }
    return { ok: true };
  });

// 6) Crea signed URL per scaricare un documento
export const getDocumentUrl = createServerFn({ method: "POST" })
  .inputValidator((input: { documentId: string }) => input)
  .handler(async ({ data }) => {
    const { data: doc } = await supabaseAdmin
      .from("documents")
      .select("storage_path, original_name")
      .eq("id", data.documentId)
      .single();
    if (!doc) throw new Error("Documento non trovato");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("referti")
      .createSignedUrl(doc.storage_path, 60 * 5);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl, name: doc.original_name };
  });
