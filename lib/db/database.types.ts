export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      accounts: {
        Row: {
          archived_at: string | null;
          credit_limit_minor: number | null;
          currency: string;
          household_id: string | null;
          id: string;
          name: string;
          owner_id: string;
          payment_day: number | null;
          type: string;
        };
        Insert: {
          archived_at?: string | null;
          credit_limit_minor?: number | null;
          currency: string;
          household_id?: string | null;
          id?: string;
          name: string;
          owner_id?: string;
          payment_day?: number | null;
          type: string;
        };
        Update: {
          archived_at?: string | null;
          credit_limit_minor?: number | null;
          currency?: string;
          household_id?: string | null;
          id?: string;
          name?: string;
          owner_id?: string;
          payment_day?: number | null;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "accounts_currency_fkey";
            columns: ["currency"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "accounts_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      budgets: {
        Row: {
          category_key: string;
          currency: string;
          household_id: string | null;
          id: string;
          limit_minor: number;
          month: string;
          owner_id: string;
        };
        Insert: {
          category_key: string;
          currency: string;
          household_id?: string | null;
          id?: string;
          limit_minor: number;
          month?: string;
          owner_id?: string;
        };
        Update: {
          category_key?: string;
          currency?: string;
          household_id?: string | null;
          id?: string;
          limit_minor?: number;
          month?: string;
          owner_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "budgets_category_key_fkey";
            columns: ["category_key"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "budgets_currency_fkey";
            columns: ["currency"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "budgets_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      categories: {
        Row: {
          key: string;
          kind: string;
          sort: number;
        };
        Insert: {
          key: string;
          kind: string;
          sort: number;
        };
        Update: {
          key?: string;
          kind?: string;
          sort?: number;
        };
        Relationships: [];
      };
      consents: {
        Row: {
          accepted_at: string;
          type: string;
          user_id: string;
          version: string;
        };
        Insert: {
          accepted_at?: string;
          type: string;
          user_id?: string;
          version: string;
        };
        Update: {
          accepted_at?: string;
          type?: string;
          user_id?: string;
          version?: string;
        };
        Relationships: [];
      };
      events: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          props: Json;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          props?: Json;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          props?: Json;
          user_id?: string;
        };
        Relationships: [];
      };
      currencies: {
        Row: {
          code: string;
          exponent: number;
        };
        Insert: {
          code: string;
          exponent: number;
        };
        Update: {
          code?: string;
          exponent?: number;
        };
        Relationships: [];
      };
      debt_payments: {
        Row: {
          amount_minor: number;
          debt_id: string;
          id: string;
          interest_minor: number;
          paid_on: string;
          principal_minor: number;
          transaction_id: string | null;
        };
        Insert: {
          amount_minor: number;
          debt_id: string;
          id?: string;
          interest_minor?: number;
          paid_on: string;
          principal_minor?: number;
          transaction_id?: string | null;
        };
        Update: {
          amount_minor?: number;
          debt_id?: string;
          id?: string;
          interest_minor?: number;
          paid_on?: string;
          principal_minor?: number;
          transaction_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "debt_payments_debt_id_fkey";
            columns: ["debt_id"];
            isOneToOne: false;
            referencedRelation: "debts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "debt_payments_transaction_id_fkey";
            columns: ["transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
        ];
      };
      debts: {
        Row: {
          apr_bps: number;
          apr_kind: string;
          closed_at: string | null;
          currency: string;
          deleted_at: string | null;
          due_day: number | null;
          icon_key: string | null;
          id: string;
          min_payment_minor: number;
          name: string;
          original_principal_minor: number;
          owner_id: string;
          started_on: string;
          subtitle: string | null;
        };
        Insert: {
          apr_bps: number;
          apr_kind: string;
          closed_at?: string | null;
          currency: string;
          deleted_at?: string | null;
          due_day?: number | null;
          icon_key?: string | null;
          id?: string;
          min_payment_minor?: number;
          name: string;
          original_principal_minor: number;
          owner_id?: string;
          started_on?: string;
          subtitle?: string | null;
        };
        Update: {
          apr_bps?: number;
          apr_kind?: string;
          closed_at?: string | null;
          currency?: string;
          deleted_at?: string | null;
          due_day?: number | null;
          icon_key?: string | null;
          id?: string;
          min_payment_minor?: number;
          name?: string;
          original_principal_minor?: number;
          owner_id?: string;
          started_on?: string;
          subtitle?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "debts_currency_fkey";
            columns: ["currency"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
        ];
      };
      deleted_account_sentinel: {
        Row: {
          created_at: string;
          singleton: boolean;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          singleton?: boolean;
          user_id: string;
        };
        Update: {
          created_at?: string;
          singleton?: boolean;
          user_id?: string;
        };
        Relationships: [];
      };
      exchange_rates: {
        Row: {
          as_of: string;
          base: string;
          fetched_at: string;
          id: string;
          quote: string;
          rate: number;
          source: string;
        };
        Insert: {
          as_of: string;
          base: string;
          fetched_at?: string;
          id?: string;
          quote: string;
          rate: number;
          source: string;
        };
        Update: {
          as_of?: string;
          base?: string;
          fetched_at?: string;
          id?: string;
          quote?: string;
          rate?: number;
          source?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exchange_rates_base_fkey";
            columns: ["base"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "exchange_rates_quote_fkey";
            columns: ["quote"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
        ];
      };
      goal_contributions: {
        Row: {
          amount_minor: number;
          contributed_on: string;
          currency: string;
          goal_id: string;
          id: string;
          transaction_id: string | null;
          user_id: string;
        };
        Insert: {
          amount_minor: number;
          contributed_on?: string;
          currency: string;
          goal_id: string;
          id?: string;
          transaction_id?: string | null;
          user_id?: string;
        };
        Update: {
          amount_minor?: number;
          contributed_on?: string;
          currency?: string;
          goal_id?: string;
          id?: string;
          transaction_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goal_contributions_currency_fkey";
            columns: ["currency"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "goal_contributions_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_contributions_transaction_id_fkey";
            columns: ["transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
        ];
      };
      goals: {
        Row: {
          archived_at: string | null;
          currency: string;
          household_id: string | null;
          icon_key: string | null;
          id: string;
          monthly_contribution_minor: number | null;
          name: string;
          owner_id: string;
          started_on: string;
          target_date: string | null;
          target_minor: number;
        };
        Insert: {
          archived_at?: string | null;
          currency: string;
          household_id?: string | null;
          icon_key?: string | null;
          id?: string;
          monthly_contribution_minor?: number | null;
          name: string;
          owner_id?: string;
          started_on?: string;
          target_date?: string | null;
          target_minor: number;
        };
        Update: {
          archived_at?: string | null;
          currency?: string;
          household_id?: string | null;
          icon_key?: string | null;
          id?: string;
          monthly_contribution_minor?: number | null;
          name?: string;
          owner_id?: string;
          started_on?: string;
          target_date?: string | null;
          target_minor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "goals_currency_fkey";
            columns: ["currency"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "goals_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      household_departures: {
        Row: {
          deleted_account: boolean;
          display_name: string | null;
          household_id: string;
          id: string;
          left_at: string;
          notice_dismissed_at: string | null;
          removed_by: string | null;
          user_id: string;
        };
        Insert: {
          deleted_account?: boolean;
          display_name?: string | null;
          household_id: string;
          id?: string;
          left_at?: string;
          notice_dismissed_at?: string | null;
          removed_by?: string | null;
          user_id: string;
        };
        Update: {
          deleted_account?: boolean;
          display_name?: string | null;
          household_id?: string;
          id?: string;
          left_at?: string;
          notice_dismissed_at?: string | null;
          removed_by?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "household_departures_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      household_invites: {
        Row: {
          created_at: string;
          created_by: string;
          expires_at: string;
          household_id: string;
          id: string;
          token_hash: string;
          used_at: string | null;
          used_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          expires_at?: string;
          household_id: string;
          id?: string;
          token_hash: string;
          used_at?: string | null;
          used_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          expires_at?: string;
          household_id?: string;
          id?: string;
          token_hash?: string;
          used_at?: string | null;
          used_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "household_invites_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      household_members: {
        Row: {
          household_id: string;
          joined_at: string;
          role: string;
          user_id: string;
        };
        Insert: {
          household_id: string;
          joined_at?: string;
          role: string;
          user_id: string;
        };
        Update: {
          household_id?: string;
          joined_at?: string;
          role?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      households: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          name: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          id?: string;
          name: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      invite_accept_attempts: {
        Row: {
          attempted_at: string;
          id: number;
          user_id: string;
        };
        Insert: {
          attempted_at?: string;
          id?: never;
          user_id: string;
        };
        Update: {
          attempted_at?: string;
          id?: never;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          dashboard_hint_dismissed_at: string | null;
          display_currency: string;
          display_name: string | null;
          first_steps_dismissed_at: string | null;
          id: string;
          locale: string;
          onboarded_at: string | null;
          onboarding_step: number | null;
          theme: string;
          timezone: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          dashboard_hint_dismissed_at?: string | null;
          display_currency?: string;
          display_name?: string | null;
          first_steps_dismissed_at?: string | null;
          id: string;
          locale?: string;
          onboarded_at?: string | null;
          onboarding_step?: number | null;
          theme?: string;
          timezone?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          dashboard_hint_dismissed_at?: string | null;
          display_currency?: string;
          display_name?: string | null;
          first_steps_dismissed_at?: string | null;
          id?: string;
          locale?: string;
          onboarded_at?: string | null;
          onboarding_step?: number | null;
          theme?: string;
          timezone?: string;
        };
        Relationships: [];
      };
      rate_limits: {
        Row: {
          action: string;
          attempted_at: string;
          id: number;
          user_id: string;
        };
        Insert: {
          action: string;
          attempted_at?: string;
          id?: never;
          user_id: string;
        };
        Update: {
          action?: string;
          attempted_at?: string;
          id?: never;
          user_id?: string;
        };
        Relationships: [];
      };
      recurring_items: {
        Row: {
          account_id: string | null;
          amount_minor: number;
          anchor_date: string;
          category_key: string | null;
          currency: string;
          debt_id: string | null;
          ends_on: string | null;
          frequency: string;
          household_id: string | null;
          icon_key: string | null;
          id: string;
          interval: number;
          kind: string;
          name: string;
          owner_id: string;
          status: string;
          subtitle: string | null;
        };
        Insert: {
          account_id?: string | null;
          amount_minor: number;
          anchor_date: string;
          category_key?: string | null;
          currency: string;
          debt_id?: string | null;
          ends_on?: string | null;
          frequency: string;
          household_id?: string | null;
          icon_key?: string | null;
          id?: string;
          interval?: number;
          kind: string;
          name: string;
          owner_id?: string;
          status?: string;
          subtitle?: string | null;
        };
        Update: {
          account_id?: string | null;
          amount_minor?: number;
          anchor_date?: string;
          category_key?: string | null;
          currency?: string;
          debt_id?: string | null;
          ends_on?: string | null;
          frequency?: string;
          household_id?: string | null;
          icon_key?: string | null;
          id?: string;
          interval?: number;
          kind?: string;
          name?: string;
          owner_id?: string;
          status?: string;
          subtitle?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "recurring_items_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_items_category_key_fkey";
            columns: ["category_key"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "recurring_items_currency_fkey";
            columns: ["currency"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "recurring_items_debt_id_fkey";
            columns: ["debt_id"];
            isOneToOne: false;
            referencedRelation: "debts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_items_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      recurring_occurrences: {
        Row: {
          amount_override_minor: number | null;
          due_on: string;
          id: string;
          recurring_item_id: string;
          rescheduled_from: string | null;
          status: string;
          transaction_id: string | null;
        };
        Insert: {
          amount_override_minor?: number | null;
          due_on: string;
          id?: string;
          recurring_item_id: string;
          rescheduled_from?: string | null;
          status?: string;
          transaction_id?: string | null;
        };
        Update: {
          amount_override_minor?: number | null;
          due_on?: string;
          id?: string;
          recurring_item_id?: string;
          rescheduled_from?: string | null;
          status?: string;
          transaction_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "recurring_occurrences_recurring_item_id_fkey";
            columns: ["recurring_item_id"];
            isOneToOne: false;
            referencedRelation: "recurring_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_occurrences_transaction_id_fkey";
            columns: ["transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
        ];
      };
      settlements: {
        Row: {
          amount_minor: number;
          created_by: string;
          currency: string;
          from_user: string;
          household_id: string;
          id: string;
          settled_on: string;
          to_user: string;
        };
        Insert: {
          amount_minor: number;
          created_by?: string;
          currency: string;
          from_user: string;
          household_id: string;
          id?: string;
          settled_on?: string;
          to_user: string;
        };
        Update: {
          amount_minor?: number;
          created_by?: string;
          currency?: string;
          from_user?: string;
          household_id?: string;
          id?: string;
          settled_on?: string;
          to_user?: string;
        };
        Relationships: [
          {
            foreignKeyName: "settlements_currency_fkey";
            columns: ["currency"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "settlements_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      transaction_splits: {
        Row: {
          share_minor: number;
          transaction_id: string;
          user_id: string;
        };
        Insert: {
          share_minor: number;
          transaction_id: string;
          user_id: string;
        };
        Update: {
          share_minor?: number;
          transaction_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transaction_splits_transaction_id_fkey";
            columns: ["transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
        ];
      };
      transactions: {
        Row: {
          account_id: string;
          amount_minor: number;
          category_key: string | null;
          created_at: string;
          currency: string;
          debt_id: string | null;
          deleted_at: string | null;
          description: string;
          goal_id: string | null;
          household_id: string | null;
          id: string;
          kind: string;
          note: string | null;
          occurred_on: string;
          owner_id: string;
          paid_by: string | null;
          recurring_item_id: string | null;
          transfer_to_account_id: string | null;
          updated_at: string;
        };
        Insert: {
          account_id: string;
          amount_minor: number;
          category_key?: string | null;
          created_at?: string;
          currency: string;
          debt_id?: string | null;
          deleted_at?: string | null;
          description: string;
          goal_id?: string | null;
          household_id?: string | null;
          id?: string;
          kind: string;
          note?: string | null;
          occurred_on: string;
          owner_id?: string;
          paid_by?: string | null;
          recurring_item_id?: string | null;
          transfer_to_account_id?: string | null;
          updated_at?: string;
        };
        Update: {
          account_id?: string;
          amount_minor?: number;
          category_key?: string | null;
          created_at?: string;
          currency?: string;
          debt_id?: string | null;
          deleted_at?: string | null;
          description?: string;
          goal_id?: string | null;
          household_id?: string | null;
          id?: string;
          kind?: string;
          note?: string | null;
          occurred_on?: string;
          owner_id?: string;
          paid_by?: string | null;
          recurring_item_id?: string | null;
          transfer_to_account_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_category_key_kind_fkey";
            columns: ["category_key", "kind"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["key", "kind"];
          },
          {
            foreignKeyName: "transactions_currency_fkey";
            columns: ["currency"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "transactions_debt_id_fkey";
            columns: ["debt_id"];
            isOneToOne: false;
            referencedRelation: "debts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_recurring_item_id_fkey";
            columns: ["recurring_item_id"];
            isOneToOne: false;
            referencedRelation: "recurring_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_transfer_to_account_id_fkey";
            columns: ["transfer_to_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_invite: { Args: { p_token: string }; Returns: Json };
      consume_rate_limit: { Args: { p_action: string }; Returns: Json };
      create_household: { Args: { p_name: string }; Returns: string };
      dashboard_totals: {
        Args: {
          p_display_currency: string;
          p_from: string;
          p_household_id: string;
          p_to: string;
        };
        Returns: {
          category_key: string;
          converted_minor: number;
          currency: string;
          kind: string;
          month: string;
          total_minor: number;
          tx_count: number;
          uncovered_minor: number;
        }[];
      };
      delete_account_data: { Args: never; Returns: Json };
      get_household_members: {
        Args: { hid: string };
        Returns: {
          avatar_url: string;
          display_name: string;
          joined_at: string;
          role: string;
          user_id: string;
        }[];
      };
      household_detach_member: {
        Args: { hid: string; removed_by: string; uid: string };
        Returns: undefined;
      };
      household_has_member: {
        Args: { hid: string; uid: string };
        Returns: boolean;
      };
      household_member_settled: {
        Args: { hid: string; uid: string };
        Returns: boolean;
      };
      is_household_member: { Args: { hid: string }; Returns: boolean };
      is_household_owner: { Args: { hid: string }; Returns: boolean };
      leave_household: { Args: { hid: string }; Returns: undefined };
      mark_overdue_occurrences: {
        Args: { p_owner: string; p_today: string };
        Returns: number;
      };
      max_household_members: { Args: never; Returns: number };
      member_write_bypassed: { Args: never; Returns: boolean };
      post_occurrence: {
        Args: {
          p_account_id: string;
          p_occurrence_id: string;
          p_paid_on?: string;
        };
        Returns: string;
      };
      purge_old_rate_limits: { Args: never; Returns: number };
      remove_household_member: {
        Args: { hid: string; uid: string };
        Returns: undefined;
      };
      save_transaction: {
        Args: {
          p_account_id: string;
          p_amount_minor: number;
          p_category_key: string;
          p_currency: string;
          p_description: string;
          p_household_id: string;
          p_id: string;
          p_kind: string;
          p_note: string;
          p_occurred_on: string;
          p_paid_by: string;
          p_transfer_to_account_id: string;
        };
        Returns: string;
      };
      transaction_has_former_member: { Args: { tid: string }; Returns: boolean };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
