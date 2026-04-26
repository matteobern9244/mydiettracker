// Tipi condivisi front-end (specchio dei record DB)

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  profession: string | null;
  age: number | null;
  height_cm: number | null;
  target_weight_kg: number | null;
  family_doctor: string | null;
  goal: string | null;
  family_history: Record<string, unknown> | null;
  pathologies: Record<string, unknown> | null;
  medications: unknown[] | null;
  allergies: string | null;
  intolerances: string | null;
  food_preferences: Record<string, unknown> | null;
  food_diary: Record<string, unknown> | null;
  weight_history: Record<string, unknown> | null;
}

export interface Circumferences {
  arm_cm: number | null;
  waist_cm: number | null;
  abdomen_cm: number | null;
  thigh_cm: number | null;
  hips_cm: number | null;
  chest_cm: number | null;
  neck_cm: number | null;
  forearm_cm: number | null;
  wrist_cm: number | null;
}

export interface BodyComposition {
  fat_mass_pct: number | null;
  lean_mass_kg: number | null;
  bone_mass_kg: number | null;
  bmi: number | null;
  metabolic_age: number | null;
  hydration_pct: number | null;
  visceral_fat: number | null;
}

export type DexaSegmentKey = "right_arm" | "left_arm" | "right_leg" | "left_leg" | "trunk";

export interface DexaSegment {
  segment: DexaSegmentKey;
  fat_mass_pct: number | null;
  lean_mass_kg: number | null;
}

export interface BloodTest {
  id: string;
  test_date: string;
  hemoglobin: number | null;
  glucose: number | null;
  gamma_gt: number | null;
  alt: number | null;
  ast: number | null;
  total_cholesterol: number | null;
  hdl: number | null;
  ldl: number | null;
  triglycerides: number | null;
  notes: string | null;
}

export interface Visit {
  id: string;
  visit_date: string;
  weight_kg: number | null;
  notes: string | null;
  document_id: string | null;
}

export interface VisitFull extends Visit {
  circumferences: Circumferences | null;
  body_composition: BodyComposition | null;
  dexa_segments: DexaSegment[];
}

export type ExtractionStatus = "pending" | "processing" | "extracted" | "confirmed" | "failed";

export interface DocumentRow {
  id: string;
  original_name: string;
  storage_path: string;
  size_bytes: number | null;
  uploaded_at: string;
  extraction_status: ExtractionStatus;
  extraction_error: string | null;
  mime_type: string | null;
}

// Una singola visita estratta dal documento (con tutti i dati a essa collegati)
export interface ExtractedVisit {
  visit_date: string | null;
  weight_kg: number | null;
  notes: string | null;
  circumferences: Circumferences;
  body_composition: BodyComposition;
  dexa_segments: DexaSegment[];
}

// Risultato completo dell'estrazione AI: N visite + esami + profilo
export interface ExtractedData {
  visits: ExtractedVisit[];
  blood_tests: Array<Omit<BloodTest, "id" | "notes"> & { notes?: string | null }>;
  profile_updates: ProfileUpdates;
}

export interface ProfileUpdates {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  profession?: string | null;
  age?: number | null;
  height_cm?: number | null;
  family_doctor?: string | null;
  allergies?: string | null;
  intolerances?: string | null;
}
