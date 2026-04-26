ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS extraction_error text;