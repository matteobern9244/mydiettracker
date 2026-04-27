# Estrazione AI

L'app usa il **Lovable AI Gateway** per trasformare i referti in dati strutturati. Implementazione in `src/lib/extraction.server.ts`.

## Modello

- **Endpoint**: `https://ai.gateway.lovable.dev/v1/chat/completions`
- **Modello**: `google/gemini-2.5-flash-lite`
- **Timeout**: 90 secondi
- **Auth**: bearer token con `LOVABLE_API_KEY` (secret server-side, preconfigurato in Lovable Cloud).

Scelta motivata: `flash-lite` è ~2× più veloce di `flash` sull'estrazione strutturata mantenendo qualità adeguata. Riduce drasticamente i timeout sui PDF pesanti.

## Pipeline

```
file utente
   │
   ▼
extractDocumentInput(buffer, fileName, mimeType)
   │   ├── .docx  → mammoth.extractRawText → { kind: "text", text }
   │   ├── .txt   → TextDecoder UTF-8       → { kind: "text", text }
   │   ├── .doc   → naive UTF-16 dal CFB    → { kind: "text", text } (se ≥ 80 char)
   │   │           ↓ fallback
   │   │           → { kind: "binary", base64, mimeType }
   │   └── .pdf   →                            { kind: "binary", base64, mimeType }
   │
   ▼
extractWithAI(input)
   │   prompt strutturato + schema atteso (JSON)
   │   chiamata fetch con AbortSignal(timeout=90s)
   │
   ▼
ExtractedData (vedi src/lib/types.ts)
   {
     visits: ExtractedVisit[],   // N visite estratte
     blood_tests: BloodTest[],   // esami ematici trovati
     profile_updates: ProfileUpdates  // dati anagrafici da aggiornare
   }
```

## Schema di output

L'AI deve restituire un JSON conforme al tipo `ExtractedData` (definito in `src/lib/types.ts`):

```ts
interface ExtractedData {
  visits: Array<{
    visit_date: string | null;          // ISO yyyy-mm-dd
    weight_kg: number | null;
    notes: string | null;
    circumferences: Circumferences;     // 9 misure
    body_composition: BodyComposition;  // 7 metriche
    dexa_segments: DexaSegment[];       // 5 segmenti opzionali
  }>;
  blood_tests: Array<{
    test_date: string;
    hemoglobin/glucose/gamma_gt/alt/ast/...: number | null;
    notes?: string | null;
  }>;
  profile_updates: {
    full_name?, email?, phone?, profession?, age?, height_cm?,
    family_doctor?, allergies?, intolerances?
  };
}
```

Lo stesso schema è validato lato server con Zod prima di salvare a DB.

## Robustezza

- **Timeout esplicito**: `AbortController` a 90 s, evita Worker che restano appesi.
- **Fallback formati**: se `.doc` legacy non produce abbastanza testo, mandiamo il binario.
- **Error capture**: se l'AI fallisce o restituisce JSON malformato, salviamo `extraction_error` su `documents` e impostiamo `extraction_status = 'failed'`. La UI mostra il messaggio e permette di riprovare.
- **Persistenza output raw**: `documents.extraction_raw` conserva la risposta originale per debug e per riprovare il parsing senza chiamare di nuovo l'AI.

## Costo / quota

L'AI Gateway è incluso in Lovable Cloud (usage-based). Il prompt è ottimizzato per essere singolo-turno (niente conversazione), il che mantiene basso il costo per estrazione.

## Limiti noti

- `.doc` legacy con encoding non standard può produrre estrazioni parziali → il fallback binario mitiga il problema.
- PDF scansionati (immagini) richiedono un modello con visione: il flash-lite multimodale gestisce immagini, ma la qualità su scansioni rumorose è imperfetta. La revisione manuale rimane sempre disponibile.
- Documenti molto lunghi possono superare la context window: in pratica i referti dietologici stanno largamente sotto i limiti.
