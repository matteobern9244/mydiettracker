-- 1) Pulisci dati pre-esistenti (era una demo single-user senza login)
DELETE FROM public.blood_tests;
DELETE FROM public.dexa_segments;
DELETE FROM public.body_composition;
DELETE FROM public.circumferences;
DELETE FROM public.visits;
DELETE FROM public.documents;
DELETE FROM public.profile;

-- 2) Aggiungi user_id (NOT NULL, FK a auth.users)
ALTER TABLE public.profile
  ADD COLUMN user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD CONSTRAINT profile_user_id_unique UNIQUE (user_id);

ALTER TABLE public.documents
  ADD COLUMN user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.visits
  ADD COLUMN user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.circumferences
  ADD COLUMN user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.body_composition
  ADD COLUMN user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.dexa_segments
  ADD COLUMN user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.blood_tests
  ADD COLUMN user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;

-- Indici per performance
CREATE INDEX idx_profile_user ON public.profile (user_id);
CREATE INDEX idx_documents_user ON public.documents (user_id);
CREATE INDEX idx_visits_user ON public.visits (user_id);
CREATE INDEX idx_circumferences_user ON public.circumferences (user_id);
CREATE INDEX idx_body_composition_user ON public.body_composition (user_id);
CREATE INDEX idx_dexa_segments_user ON public.dexa_segments (user_id);
CREATE INDEX idx_blood_tests_user ON public.blood_tests (user_id);

-- 3) Sostituisci le policy "open_all" con policy per utente
DROP POLICY IF EXISTS "open_all" ON public.profile;
DROP POLICY IF EXISTS "open_all" ON public.documents;
DROP POLICY IF EXISTS "open_all" ON public.visits;
DROP POLICY IF EXISTS "open_all" ON public.circumferences;
DROP POLICY IF EXISTS "open_all" ON public.body_composition;
DROP POLICY IF EXISTS "open_all" ON public.dexa_segments;
DROP POLICY IF EXISTS "open_all" ON public.blood_tests;

-- profile
CREATE POLICY "profile_select_own" ON public.profile FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "profile_insert_own" ON public.profile FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "profile_update_own" ON public.profile FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "profile_delete_own" ON public.profile FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- documents
CREATE POLICY "documents_select_own" ON public.documents FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "documents_insert_own" ON public.documents FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "documents_update_own" ON public.documents FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "documents_delete_own" ON public.documents FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- visits
CREATE POLICY "visits_select_own" ON public.visits FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "visits_insert_own" ON public.visits FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "visits_update_own" ON public.visits FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "visits_delete_own" ON public.visits FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- circumferences
CREATE POLICY "circumferences_select_own" ON public.circumferences FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "circumferences_insert_own" ON public.circumferences FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "circumferences_update_own" ON public.circumferences FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "circumferences_delete_own" ON public.circumferences FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- body_composition
CREATE POLICY "body_composition_select_own" ON public.body_composition FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "body_composition_insert_own" ON public.body_composition FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "body_composition_update_own" ON public.body_composition FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "body_composition_delete_own" ON public.body_composition FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- dexa_segments
CREATE POLICY "dexa_segments_select_own" ON public.dexa_segments FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "dexa_segments_insert_own" ON public.dexa_segments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "dexa_segments_update_own" ON public.dexa_segments FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "dexa_segments_delete_own" ON public.dexa_segments FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- blood_tests
CREATE POLICY "blood_tests_select_own" ON public.blood_tests FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "blood_tests_insert_own" ON public.blood_tests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "blood_tests_update_own" ON public.blood_tests FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "blood_tests_delete_own" ON public.blood_tests FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- 4) Storage bucket "referti": policy per owner (auth.uid)
DROP POLICY IF EXISTS "referti_read" ON storage.objects;
DROP POLICY IF EXISTS "referti_insert" ON storage.objects;
DROP POLICY IF EXISTS "referti_update" ON storage.objects;
DROP POLICY IF EXISTS "referti_delete" ON storage.objects;

CREATE POLICY "referti_read_own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'referti' AND owner = auth.uid());
CREATE POLICY "referti_insert_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'referti' AND owner = auth.uid());
CREATE POLICY "referti_update_own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'referti' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'referti' AND owner = auth.uid());
CREATE POLICY "referti_delete_own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'referti' AND owner = auth.uid());

-- 5) Trigger di auto-creazione profilo al primo login
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profile (user_id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name')
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();