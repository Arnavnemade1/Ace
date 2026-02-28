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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agent_logs: {
        Row: {
          agent_name: string
          created_at: string
          id: string
          log_type: string
          message: string
          metadata: Json | null
          reasoning: string | null
        }
        Insert: {
          agent_name: string
          created_at?: string
          id?: string
          log_type?: string
          message: string
          metadata?: Json | null
          reasoning?: string | null
        }
        Update: {
          agent_name?: string
          created_at?: string
          id?: string
          log_type?: string
          message?: string
          metadata?: Json | null
          reasoning?: string | null
        }
        Relationships: []
      }
      agent_state: {
        Row: {
          agent_name: string
          config: Json | null
          created_at: string
          id: string
          last_action: string | null
          last_action_at: string | null
          metric_label: string | null
          metric_value: string | null
          status: string
          updated_at: string
        }
        Insert: {
          agent_name: string
          config?: Json | null
          created_at?: string
          id?: string
          last_action?: string | null
          last_action_at?: string | null
          metric_label?: string | null
          metric_value?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          agent_name?: string
          config?: Json | null
          created_at?: string
          id?: string
          last_action?: string | null
          last_action_at?: string | null
          metric_label?: string | null
          metric_value?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      portfolio_state: {
        Row: {
          cash: number
          created_at: string
          daily_pnl: number | null
          id: string
          max_drawdown: number | null
          positions: Json
          sharpe_ratio: number | null
          total_pnl: number | null
          total_trades: number | null
          total_value: number
          updated_at: string
          win_rate: number | null
        }
        Insert: {
          cash?: number
          created_at?: string
          daily_pnl?: number | null
          id?: string
          max_drawdown?: number | null
          positions?: Json
          sharpe_ratio?: number | null
          total_pnl?: number | null
          total_trades?: number | null
          total_value?: number
          updated_at?: string
          win_rate?: number | null
        }
        Update: {
          cash?: number
          created_at?: string
          daily_pnl?: number | null
          id?: string
          max_drawdown?: number | null
          positions?: Json
          sharpe_ratio?: number | null
          total_pnl?: number | null
          total_trades?: number | null
          total_value?: number
          updated_at?: string
          win_rate?: number | null
        }
        Relationships: []
      }
      replay_results: {
        Row: {
          counterfactual_outcomes: Json
          created_at: string
          id: string
          improvement_score: number | null
          lessons_learned: string | null
          original_outcome: Json
          patterns_pruned: number | null
          trade_id: string | null
        }
        Insert: {
          counterfactual_outcomes?: Json
          created_at?: string
          id?: string
          improvement_score?: number | null
          lessons_learned?: string | null
          original_outcome: Json
          patterns_pruned?: number | null
          trade_id?: string | null
        }
        Update: {
          counterfactual_outcomes?: Json
          created_at?: string
          id?: string
          improvement_score?: number | null
          lessons_learned?: string | null
          original_outcome?: Json
          patterns_pruned?: number | null
          trade_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "replay_results_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      signals: {
        Row: {
          acted_on: boolean | null
          created_at: string
          expires_at: string | null
          id: string
          metadata: Json | null
          signal_type: string
          source_agent: string
          strength: number
          symbol: string
        }
        Insert: {
          acted_on?: boolean | null
          created_at?: string
          expires_at?: string | null
          id?: string
          metadata?: Json | null
          signal_type: string
          source_agent: string
          strength?: number
          symbol: string
        }
        Update: {
          acted_on?: boolean | null
          created_at?: string
          expires_at?: string | null
          id?: string
          metadata?: Json | null
          signal_type?: string
          source_agent?: string
          strength?: number
          symbol?: string
        }
        Relationships: []
      }
      trades: {
        Row: {
          agent: string
          alpaca_order_id: string | null
          created_at: string
          executed_at: string
          id: string
          pnl: number | null
          price: number
          qty: number
          reasoning: string | null
          side: string
          status: string
          strategy: string | null
          symbol: string
          total_value: number
        }
        Insert: {
          agent: string
          alpaca_order_id?: string | null
          created_at?: string
          executed_at?: string
          id?: string
          pnl?: number | null
          price: number
          qty: number
          reasoning?: string | null
          side: string
          status?: string
          strategy?: string | null
          symbol: string
          total_value: number
        }
        Update: {
          agent?: string
          alpaca_order_id?: string | null
          created_at?: string
          executed_at?: string
          id?: string
          pnl?: number | null
          price?: number
          qty?: number
          reasoning?: string | null
          side?: string
          status?: string
          strategy?: string | null
          symbol?: string
          total_value?: number
        }
        Relationships: []
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
