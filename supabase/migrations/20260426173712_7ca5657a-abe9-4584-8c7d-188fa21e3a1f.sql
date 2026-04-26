
-- Profilo singolo (single user app)
CREATE TABLE public.profile (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  profession TEXT,
  birth_date DATE,
  age INTEGER,
  height_cm NUMERIC(5,1),
  target_weight_kg NUMERIC(5,2),
  family_doctor TEXT,
  goal TEXT,
  family_history JSONB DEFAULT '{}'::jsonb,
  pathologies JSONB DEFAULT '{}'::jsonb,
  medications JSONB DEFAULT '[]'::jsonb,
  allergies TEXT,
  intolerances TEXT,
  food_preferences JSONB DEFAULT '{}'::jsonb,
  food_diary JSONB DEFAULT '{}'::jsonb,
  weight_history JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Documenti caricati (file .doc originali)
CREATE TABLE public.documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  original_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  size_bytes INTEGER,
  mime_type TEXT,
  extraction_status TEXT NOT NULL DEFAULT 'pending', -- pending | extracted | confirmed | failed
  extraction_raw JSONB,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Visite dietologiche
CREATE TABLE public.visits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  visit_date DATE NOT NULL,
  weight_kg NUMERIC(5,2),
  notes TEXT,
  document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_visits_date ON public.visits (visit_date DESC);

-- Circonferenze per visita
CREATE TABLE public.circumferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  visit_id UUID NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
  arm_cm NUMERIC(5,2),
  waist_cm NUMERIC(5,2),
  abdomen_cm NUMERIC(5,2),
  thigh_cm NUMERIC(5,2),
  hips_cm NUMERIC(5,2),
  chest_cm NUMERIC(5,2),
  neck_cm NUMERIC(5,2),
  forearm_cm NUMERIC(5,2),
  wrist_cm NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (visit_id)
);

-- Composizione corporea per visita
CREATE TABLE public.body_composition (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  visit_id UUID NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
  fat_mass_pct NUMERIC(5,2),
  lean_mass_kg NUMERIC(5,2),
  bone_mass_kg NUMERIC(5,2),
  bmi NUMERIC(5,2),
  metabolic_age INTEGER,
  hydration_pct NUMERIC(5,2),
  visceral_fat NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (visit_id)
);

-- DEXA segmental: una riga per segmento per visita
CREATE TABLE public.dexa_segments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  visit_id UUID NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
  segment TEXT NOT NULL, -- right_arm | left_arm | right_leg | left_leg | trunk
  fat_mass_pct NUMERIC(5,2),
  lean_mass_kg NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (visit_id, segment)
);

-- Esami ematochimici (possono essere svincolati da una visita o legati ad essa)
CREATE TABLE public.blood_tests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  visit_id UUID REFERENCES public.visits(id) ON DELETE SET NULL,
  test_date DATE NOT NULL,
  hemoglobin NUMERIC(5,2),
  glucose NUMERIC(6,2),
  gamma_gt NUMERIC(6,2),
  alt NUMERIC(6,2),
  ast NUMERIC(6,2),
  total_cholesterol NUMERIC(6,2),
  hdl NUMERIC(6,2),
  ldl NUMERIC(6,2),
  triglycerides NUMERIC(6,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_blood_tests_date ON public.blood_tests (test_date DESC);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profile_updated BEFORE UPDATE ON public.profile
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_visits_updated BEFORE UPDATE ON public.visits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS attiva su tutto, policy permissive (single-user senza auth)
ALTER TABLE public.profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circumferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.body_composition ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dexa_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blood_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "open_all" ON public.profile FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open_all" ON public.documents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open_all" ON public.visits FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open_all" ON public.circumferences FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open_all" ON public.body_composition FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open_all" ON public.dexa_segments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open_all" ON public.blood_tests FOR ALL USING (true) WITH CHECK (true);

-- Storage bucket per i file .doc
INSERT INTO storage.buckets (id, name, public)
VALUES ('referti', 'referti', false);

CREATE POLICY "referti_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'referti');
CREATE POLICY "referti_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'referti');
CREATE POLICY "referti_update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'referti');
CREATE POLICY "referti_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'referti');

-- Riga profilo iniziale
INSERT INTO public.profile (full_name, height_cm, age) VALUES ('Matteo Bernardini', 174, 33);
