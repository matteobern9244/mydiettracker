-- Aggiungo content_hash per rilevare duplicati identici (SHA-256 esadecimale)
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS content_hash text;

-- Indice unico per (user_id, content_hash): impedisce due file identici
-- caricati dallo stesso utente, ignora NULL (file storici senza hash)
CREATE UNIQUE INDEX IF NOT EXISTS documents_user_content_hash_unique
  ON public.documents (user_id, content_hash)
  WHERE content_hash IS NOT NULL;