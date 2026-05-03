-- Ensure each (plan_id, day_of_week, meal_slot) is unique so we can upsert single cells.
-- First, deduplicate any rows that may break the constraint (keep the most recent per key).
DELETE FROM public.diet_weekly_schedule a
USING public.diet_weekly_schedule b
WHERE a.ctid < b.ctid
  AND a.plan_id = b.plan_id
  AND a.day_of_week = b.day_of_week
  AND a.meal_slot = b.meal_slot;

ALTER TABLE public.diet_weekly_schedule
  ADD CONSTRAINT diet_weekly_schedule_plan_day_slot_uniq
  UNIQUE (plan_id, day_of_week, meal_slot);