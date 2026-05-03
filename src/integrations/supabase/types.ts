export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      blood_tests: {
        Row: {
          alt: number | null
          ast: number | null
          created_at: string
          gamma_gt: number | null
          glucose: number | null
          hdl: number | null
          hemoglobin: number | null
          id: string
          ldl: number | null
          notes: string | null
          test_date: string
          total_cholesterol: number | null
          triglycerides: number | null
          user_id: string
          visit_id: string | null
        }
        Insert: {
          alt?: number | null
          ast?: number | null
          created_at?: string
          gamma_gt?: number | null
          glucose?: number | null
          hdl?: number | null
          hemoglobin?: number | null
          id?: string
          ldl?: number | null
          notes?: string | null
          test_date: string
          total_cholesterol?: number | null
          triglycerides?: number | null
          user_id: string
          visit_id?: string | null
        }
        Update: {
          alt?: number | null
          ast?: number | null
          created_at?: string
          gamma_gt?: number | null
          glucose?: number | null
          hdl?: number | null
          hemoglobin?: number | null
          id?: string
          ldl?: number | null
          notes?: string | null
          test_date?: string
          total_cholesterol?: number | null
          triglycerides?: number | null
          user_id?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blood_tests_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      body_composition: {
        Row: {
          bmi: number | null
          bone_mass_kg: number | null
          created_at: string
          fat_mass_pct: number | null
          hydration_pct: number | null
          id: string
          lean_mass_kg: number | null
          metabolic_age: number | null
          user_id: string
          visceral_fat: number | null
          visit_id: string
        }
        Insert: {
          bmi?: number | null
          bone_mass_kg?: number | null
          created_at?: string
          fat_mass_pct?: number | null
          hydration_pct?: number | null
          id?: string
          lean_mass_kg?: number | null
          metabolic_age?: number | null
          user_id: string
          visceral_fat?: number | null
          visit_id: string
        }
        Update: {
          bmi?: number | null
          bone_mass_kg?: number | null
          created_at?: string
          fat_mass_pct?: number | null
          hydration_pct?: number | null
          id?: string
          lean_mass_kg?: number | null
          metabolic_age?: number | null
          user_id?: string
          visceral_fat?: number | null
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "body_composition_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: true
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      circumferences: {
        Row: {
          abdomen_cm: number | null
          arm_cm: number | null
          chest_cm: number | null
          created_at: string
          forearm_cm: number | null
          hips_cm: number | null
          id: string
          neck_cm: number | null
          thigh_cm: number | null
          user_id: string
          visit_id: string
          waist_cm: number | null
          wrist_cm: number | null
        }
        Insert: {
          abdomen_cm?: number | null
          arm_cm?: number | null
          chest_cm?: number | null
          created_at?: string
          forearm_cm?: number | null
          hips_cm?: number | null
          id?: string
          neck_cm?: number | null
          thigh_cm?: number | null
          user_id: string
          visit_id: string
          waist_cm?: number | null
          wrist_cm?: number | null
        }
        Update: {
          abdomen_cm?: number | null
          arm_cm?: number | null
          chest_cm?: number | null
          created_at?: string
          forearm_cm?: number | null
          hips_cm?: number | null
          id?: string
          neck_cm?: number | null
          thigh_cm?: number | null
          user_id?: string
          visit_id?: string
          waist_cm?: number | null
          wrist_cm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "circumferences_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: true
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      dexa_segments: {
        Row: {
          created_at: string
          fat_mass_pct: number | null
          id: string
          lean_mass_kg: number | null
          segment: string
          user_id: string
          visit_id: string
        }
        Insert: {
          created_at?: string
          fat_mass_pct?: number | null
          id?: string
          lean_mass_kg?: number | null
          segment: string
          user_id: string
          visit_id: string
        }
        Update: {
          created_at?: string
          fat_mass_pct?: number | null
          id?: string
          lean_mass_kg?: number | null
          segment?: string
          user_id?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dexa_segments_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      diet_meal_logs: {
        Row: {
          consumed: boolean
          created_at: string
          id: string
          log_date: string
          meal_slot: string
          note: string | null
          plan_id: string | null
          user_id: string
        }
        Insert: {
          consumed?: boolean
          created_at?: string
          id?: string
          log_date: string
          meal_slot: string
          note?: string | null
          plan_id?: string | null
          user_id: string
        }
        Update: {
          consumed?: boolean
          created_at?: string
          id?: string
          log_date?: string
          meal_slot?: string
          note?: string | null
          plan_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "diet_meal_logs_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "diet_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      diet_plans: {
        Row: {
          created_at: string
          document_id: string | null
          general_guidelines: Json
          id: string
          is_active: boolean
          kcal_target: number | null
          meal_options: Json
          objective: string | null
          professional_name: string | null
          start_date: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          document_id?: string | null
          general_guidelines?: Json
          id?: string
          is_active?: boolean
          kcal_target?: number | null
          meal_options?: Json
          objective?: string | null
          professional_name?: string | null
          start_date?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          document_id?: string | null
          general_guidelines?: Json
          id?: string
          is_active?: boolean
          kcal_target?: number | null
          meal_options?: Json
          objective?: string | null
          professional_name?: string | null
          start_date?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      diet_shopping_lists: {
        Row: {
          created_at: string
          id: string
          items: Json
          plan_id: string | null
          updated_at: string
          user_id: string
          week_start: string
        }
        Insert: {
          created_at?: string
          id?: string
          items?: Json
          plan_id?: string | null
          updated_at?: string
          user_id: string
          week_start: string
        }
        Update: {
          created_at?: string
          id?: string
          items?: Json
          plan_id?: string | null
          updated_at?: string
          user_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "diet_shopping_lists_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "diet_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      diet_weekly_schedule: {
        Row: {
          created_at: string
          day_of_week: number
          description: string | null
          details: Json
          id: string
          meal_slot: string
          plan_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          description?: string | null
          details?: Json
          id?: string
          meal_slot: string
          plan_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          description?: string | null
          details?: Json
          id?: string
          meal_slot?: string
          plan_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "diet_weekly_schedule_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "diet_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          content_hash: string | null
          extraction_error: string | null
          extraction_raw: Json | null
          extraction_status: string
          id: string
          mime_type: string | null
          original_name: string
          size_bytes: number | null
          storage_path: string
          uploaded_at: string
          user_id: string
        }
        Insert: {
          content_hash?: string | null
          extraction_error?: string | null
          extraction_raw?: Json | null
          extraction_status?: string
          id?: string
          mime_type?: string | null
          original_name: string
          size_bytes?: number | null
          storage_path: string
          uploaded_at?: string
          user_id: string
        }
        Update: {
          content_hash?: string | null
          extraction_error?: string | null
          extraction_raw?: Json | null
          extraction_status?: string
          id?: string
          mime_type?: string | null
          original_name?: string
          size_bytes?: number | null
          storage_path?: string
          uploaded_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profile: {
        Row: {
          age: number | null
          allergies: string | null
          birth_date: string | null
          created_at: string
          email: string | null
          family_doctor: string | null
          family_history: Json | null
          food_diary: Json | null
          food_preferences: Json | null
          full_name: string | null
          goal: string | null
          height_cm: number | null
          id: string
          intolerances: string | null
          medications: Json | null
          pathologies: Json | null
          phone: string | null
          profession: string | null
          target_weight_kg: number | null
          updated_at: string
          user_id: string
          weight_history: Json | null
        }
        Insert: {
          age?: number | null
          allergies?: string | null
          birth_date?: string | null
          created_at?: string
          email?: string | null
          family_doctor?: string | null
          family_history?: Json | null
          food_diary?: Json | null
          food_preferences?: Json | null
          full_name?: string | null
          goal?: string | null
          height_cm?: number | null
          id?: string
          intolerances?: string | null
          medications?: Json | null
          pathologies?: Json | null
          phone?: string | null
          profession?: string | null
          target_weight_kg?: number | null
          updated_at?: string
          user_id: string
          weight_history?: Json | null
        }
        Update: {
          age?: number | null
          allergies?: string | null
          birth_date?: string | null
          created_at?: string
          email?: string | null
          family_doctor?: string | null
          family_history?: Json | null
          food_diary?: Json | null
          food_preferences?: Json | null
          full_name?: string | null
          goal?: string | null
          height_cm?: number | null
          id?: string
          intolerances?: string | null
          medications?: Json | null
          pathologies?: Json | null
          phone?: string | null
          profession?: string | null
          target_weight_kg?: number | null
          updated_at?: string
          user_id?: string
          weight_history?: Json | null
        }
        Relationships: []
      }
      visits: {
        Row: {
          created_at: string
          document_id: string | null
          id: string
          notes: string | null
          updated_at: string
          user_id: string
          visit_date: string
          weight_kg: number | null
        }
        Insert: {
          created_at?: string
          document_id?: string | null
          id?: string
          notes?: string | null
          updated_at?: string
          user_id: string
          visit_date: string
          weight_kg?: number | null
        }
        Update: {
          created_at?: string
          document_id?: string | null
          id?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
          visit_date?: string
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "visits_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
