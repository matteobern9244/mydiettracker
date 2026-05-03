
-- diet_plans: piano alimentare (max 1 attivo per utente)
CREATE TABLE public.diet_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  objective TEXT,
  professional_name TEXT,
  kcal_target INTEGER,
  start_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT false,
  general_guidelines JSONB NOT NULL DEFAULT '[]'::jsonb,
  meal_options JSONB NOT NULL DEFAULT '{}'::jsonb,
  document_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX diet_plans_one_active_per_user
  ON public.diet_plans (user_id) WHERE is_active = true;

ALTER TABLE public.diet_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "diet_plans_select_own" ON public.diet_plans FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "diet_plans_insert_own" ON public.diet_plans FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "diet_plans_update_own" ON public.diet_plans FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "diet_plans_delete_own" ON public.diet_plans FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TRIGGER diet_plans_set_updated_at
  BEFORE UPDATE ON public.diet_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- diet_weekly_schedule: schema settimanale ricorrente
CREATE TABLE public.diet_weekly_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.diet_plans(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  meal_slot TEXT NOT NULL CHECK (meal_slot IN ('breakfast','mid_morning','lunch','afternoon','dinner')),
  description TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plan_id, day_of_week, meal_slot)
);

ALTER TABLE public.diet_weekly_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "diet_schedule_select_own" ON public.diet_weekly_schedule FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "diet_schedule_insert_own" ON public.diet_weekly_schedule FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "diet_schedule_update_own" ON public.diet_weekly_schedule FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "diet_schedule_delete_own" ON public.diet_weekly_schedule FOR DELETE TO authenticated USING (user_id = auth.uid());

-- diet_meal_logs: aderenza giornaliera
CREATE TABLE public.diet_meal_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES public.diet_plans(id) ON DELETE SET NULL,
  log_date DATE NOT NULL,
  meal_slot TEXT NOT NULL CHECK (meal_slot IN ('breakfast','mid_morning','lunch','afternoon','dinner')),
  consumed BOOLEAN NOT NULL DEFAULT true,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, log_date, meal_slot)
);

CREATE INDEX idx_diet_meal_logs_date ON public.diet_meal_logs (user_id, log_date DESC);

ALTER TABLE public.diet_meal_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "diet_logs_select_own" ON public.diet_meal_logs FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "diet_logs_insert_own" ON public.diet_meal_logs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "diet_logs_update_own" ON public.diet_meal_logs FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "diet_logs_delete_own" ON public.diet_meal_logs FOR DELETE TO authenticated USING (user_id = auth.uid());

-- diet_shopping_lists: lista della spesa per settimana
CREATE TABLE public.diet_shopping_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES public.diet_plans(id) ON DELETE SET NULL,
  week_start DATE NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_start)
);

ALTER TABLE public.diet_shopping_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "diet_shopping_select_own" ON public.diet_shopping_lists FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "diet_shopping_insert_own" ON public.diet_shopping_lists FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "diet_shopping_update_own" ON public.diet_shopping_lists FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "diet_shopping_delete_own" ON public.diet_shopping_lists FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TRIGGER diet_shopping_set_updated_at
  BEFORE UPDATE ON public.diet_shopping_lists
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
