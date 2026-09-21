/**
 * Database types for the Supabase typed client.
 *
 * These are hand-written to match `supabase/migrations`. Once you have a live
 * project you can regenerate them with:
 *
 *   npx supabase gen types typescript --linked > src/lib/database.types.ts
 *
 * Keep this file in sync with the migrations until generation is wired up.
 */

export type RollStatus = "active" | "completed";

type Timestamps = {
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      cameras: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          format: string | null;
          shutter_speeds: string[];
          notes: string | null;
          active: boolean;
        } & Timestamps;
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          format?: string | null;
          shutter_speeds?: string[];
          notes?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          format?: string | null;
          shutter_speeds?: string[];
          notes?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      lenses: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          focal_length: string | null;
          min_aperture: number | null;
          max_aperture: number | null;
          aperture_stops: number[];
          notes: string | null;
          active: boolean;
        } & Timestamps;
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          focal_length?: string | null;
          min_aperture?: number | null;
          max_aperture?: number | null;
          aperture_stops?: number[];
          notes?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          focal_length?: string | null;
          min_aperture?: number | null;
          max_aperture?: number | null;
          aperture_stops?: number[];
          notes?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      film_stocks: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          iso: number | null;
          format: string | null;
          quantity: number;
          expiration_date: string | null;
          storage_notes: string | null;
          active: boolean;
        } & Timestamps;
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          iso?: number | null;
          format?: string | null;
          quantity?: number;
          expiration_date?: string | null;
          storage_notes?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          iso?: number | null;
          format?: string | null;
          quantity?: number;
          expiration_date?: string | null;
          storage_notes?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      rolls: {
        Row: {
          id: string;
          user_id: string;
          film_stock_id: string;
          camera_id: string;
          default_lens_id: string;
          start_date: string;
          end_date: string | null;
          custom_title: string | null;
          status: RollStatus;
          current_frame: number;
          drive_folder_id: string | null;
          notes: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          user_id?: string;
          film_stock_id: string;
          camera_id: string;
          default_lens_id: string;
          start_date: string;
          end_date?: string | null;
          custom_title?: string | null;
          status?: RollStatus;
          current_frame?: number;
          drive_folder_id?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          film_stock_id?: string;
          camera_id?: string;
          default_lens_id?: string;
          start_date?: string;
          end_date?: string | null;
          custom_title?: string | null;
          status?: RollStatus;
          current_frame?: number;
          drive_folder_id?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rolls_film_stock_id_fkey";
            columns: ["film_stock_id"];
            referencedRelation: "film_stocks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rolls_camera_id_fkey";
            columns: ["camera_id"];
            referencedRelation: "cameras";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rolls_default_lens_id_fkey";
            columns: ["default_lens_id"];
            referencedRelation: "lenses";
            referencedColumns: ["id"];
          },
        ];
      };
      frames: {
        Row: {
          id: string;
          user_id: string;
          roll_id: string;
          frame_number: number;
          shutter_speed: string | null;
          aperture: number | null;
          lens_id: string | null;
          notes: string | null;
          drive_file_id: string | null;
          drive_filename: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          user_id?: string;
          roll_id: string;
          frame_number: number;
          shutter_speed?: string | null;
          aperture?: number | null;
          lens_id?: string | null;
          notes?: string | null;
          drive_file_id?: string | null;
          drive_filename?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          roll_id?: string;
          frame_number?: number;
          shutter_speed?: string | null;
          aperture?: number | null;
          lens_id?: string | null;
          notes?: string | null;
          drive_file_id?: string | null;
          drive_filename?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "frames_roll_id_fkey";
            columns: ["roll_id"];
            referencedRelation: "rolls";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "frames_lens_id_fkey";
            columns: ["lens_id"];
            referencedRelation: "lenses";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: {
      roll_status: RollStatus;
    };
    CompositeTypes: Record<never, never>;
  };
};

/** Convenience row types. */
export type Camera = Database["public"]["Tables"]["cameras"]["Row"];
export type Lens = Database["public"]["Tables"]["lenses"]["Row"];
export type FilmStock = Database["public"]["Tables"]["film_stocks"]["Row"];
export type Roll = Database["public"]["Tables"]["rolls"]["Row"];
export type Frame = Database["public"]["Tables"]["frames"]["Row"];
