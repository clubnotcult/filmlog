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

export type RollStatus = "active" | "completed" | "archived";
export type MeterType = "In Camera Meter" | "KEKS Meter" | "Meter App" | "No Meter" | "Other";
export const METER_TYPES: MeterType[] = [
  "In Camera Meter",
  "KEKS Meter",
  "Meter App",
  "No Meter",
  "Other",
];

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
          default_meter_type: MeterType | null;
        } & Timestamps;
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          format?: string | null;
          shutter_speeds?: string[];
          notes?: string | null;
          active?: boolean;
          default_meter_type?: MeterType | null;
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
          default_meter_type?: MeterType | null;
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
      /** The reusable film TYPE (e.g. "Kodak Portra 400"). See film_inventory_items for physical batches you own. */
      film_stocks: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          iso: number | null;
          format: string | null;
          active: boolean;
        } & Timestamps;
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          iso?: number | null;
          format?: string | null;
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
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      /** A specific physical batch of a film_stock you own: quantity, expiration, storage. */
      film_inventory_items: {
        Row: {
          id: string;
          user_id: string;
          film_stock_id: string;
          expiration_date: string | null;
          storage_notes: string | null;
          quantity: number;
        } & Timestamps;
        Insert: {
          id?: string;
          user_id?: string;
          film_stock_id: string;
          expiration_date?: string | null;
          storage_notes?: string | null;
          quantity?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          film_stock_id?: string;
          expiration_date?: string | null;
          storage_notes?: string | null;
          quantity?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "film_inventory_items_film_stock_id_fkey";
            columns: ["film_stock_id"];
            referencedRelation: "film_stocks";
            referencedColumns: ["id"];
          },
        ];
      };
      rolls: {
        Row: {
          id: string;
          user_id: string;
          film_stock_id: string;
          film_inventory_item_id: string;
          camera_id: string;
          default_lens_id: string;
          start_date: string;
          end_date: string | null;
          custom_title: string | null;
          status: RollStatus;
          current_frame: number;
          drive_folder_id: string | null;
          drive_folder_name: string | null;
          notes: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          user_id?: string;
          film_stock_id: string;
          film_inventory_item_id: string;
          camera_id: string;
          default_lens_id: string;
          start_date: string;
          end_date?: string | null;
          custom_title?: string | null;
          status?: RollStatus;
          current_frame?: number;
          drive_folder_id?: string | null;
          drive_folder_name?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          film_stock_id?: string;
          film_inventory_item_id?: string;
          camera_id?: string;
          default_lens_id?: string;
          start_date?: string;
          end_date?: string | null;
          custom_title?: string | null;
          status?: RollStatus;
          current_frame?: number;
          drive_folder_id?: string | null;
          drive_folder_name?: string | null;
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
            foreignKeyName: "rolls_film_inventory_item_id_fkey";
            columns: ["film_inventory_item_id"];
            referencedRelation: "film_inventory_items";
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
          /** Stops pushed (+) or pulled (-) relative to box speed. 0 = normal. Null when metadata_logged is false. */
          push_pull: number | null;
          /** False = "No Input Logged": the frame was shot, but exposure metadata is unknown and intentionally not guessed. */
          metadata_logged: boolean;
          /** How exposure was measured. Null when metadata_logged is false. */
          meter_type: MeterType | null;
          notes: string | null;
          drive_file_id: string | null;
          drive_filename: string | null;
          drive_thumbnail_url: string | null;
          drive_view_url: string | null;
          synced_at: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          user_id?: string;
          roll_id: string;
          frame_number: number;
          shutter_speed?: string | null;
          aperture?: number | null;
          lens_id?: string | null;
          push_pull?: number | null;
          metadata_logged?: boolean;
          meter_type?: MeterType | null;
          notes?: string | null;
          drive_file_id?: string | null;
          drive_filename?: string | null;
          drive_thumbnail_url?: string | null;
          drive_view_url?: string | null;
          synced_at?: string | null;
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
          push_pull?: number | null;
          metadata_logged?: boolean;
          meter_type?: MeterType | null;
          notes?: string | null;
          drive_file_id?: string | null;
          drive_filename?: string | null;
          drive_thumbnail_url?: string | null;
          drive_view_url?: string | null;
          synced_at?: string | null;
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
      /** Append-only log of Drive sync events, for traceability. Never updated or deleted directly. */
      roll_sync_history: {
        Row: {
          id: string;
          user_id: string;
          roll_id: string;
          drive_folder_id: string;
          drive_folder_name: string | null;
          frame_count: number;
          image_count: number;
          status: "completed" | "completed_with_mismatch";
          synced_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          roll_id: string;
          drive_folder_id: string;
          drive_folder_name?: string | null;
          frame_count: number;
          image_count: number;
          status: "completed" | "completed_with_mismatch";
          synced_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          roll_id?: string;
          drive_folder_id?: string;
          drive_folder_name?: string | null;
          frame_count?: number;
          image_count?: number;
          status?: "completed" | "completed_with_mismatch";
          synced_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "roll_sync_history_roll_id_fkey";
            columns: ["roll_id"];
            referencedRelation: "rolls";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<never, never>;
    Functions: {
      create_roll: {
        Args: {
          p_film_inventory_item_id: string;
          p_camera_id: string;
          p_default_lens_id: string;
          p_start_date: string;
          p_custom_title?: string | null;
          p_notes?: string | null;
        };
        Returns: Database["public"]["Tables"]["rolls"]["Row"];
      };
      adjust_film_inventory_item_quantity: {
        Args: {
          p_id: string;
          p_delta: number;
        };
        Returns: Database["public"]["Tables"]["film_inventory_items"]["Row"];
      };
      save_frame_and_advance: {
        Args: {
          p_roll_id: string;
          p_shutter_speed: string | null;
          p_aperture: number | null;
          p_lens_id: string | null;
          p_push_pull?: number | null;
          p_notes?: string | null;
          p_metadata_logged?: boolean;
          p_meter_type?: MeterType | null;
        };
        Returns: Database["public"]["Tables"]["frames"]["Row"];
      };
      update_frame: {
        Args: {
          p_frame_id: string;
          p_metadata_logged: boolean;
          p_shutter_speed?: string | null;
          p_aperture?: number | null;
          p_lens_id?: string | null;
          p_push_pull?: number | null;
          p_notes?: string | null;
          p_meter_type?: MeterType | null;
        };
        Returns: Database["public"]["Tables"]["frames"]["Row"];
      };
      finish_roll: {
        Args: { p_roll_id: string };
        Returns: Database["public"]["Tables"]["rolls"]["Row"];
      };
      reopen_roll: {
        Args: { p_roll_id: string };
        Returns: Database["public"]["Tables"]["rolls"]["Row"];
      };
      archive_roll: {
        Args: { p_roll_id: string };
        Returns: Database["public"]["Tables"]["rolls"]["Row"];
      };
      restore_roll: {
        Args: { p_roll_id: string };
        Returns: Database["public"]["Tables"]["rolls"]["Row"];
      };
      apply_roll_sync: {
        Args: {
          p_roll_id: string;
          p_drive_folder_id: string;
          p_drive_folder_name: string | null;
          /** Array of {frame_id, drive_file_id, drive_filename, drive_thumbnail_url, drive_view_url}. */
          p_mappings: unknown;
          p_frame_count: number;
          p_image_count: number;
          p_status: "completed" | "completed_with_mismatch";
        };
        Returns: Database["public"]["Tables"]["roll_sync_history"]["Row"];
      };
    };
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
export type FilmInventoryItem =
  Database["public"]["Tables"]["film_inventory_items"]["Row"];
export type Roll = Database["public"]["Tables"]["rolls"]["Row"];
export type Frame = Database["public"]["Tables"]["frames"]["Row"];
export type RollSyncHistory =
  Database["public"]["Tables"]["roll_sync_history"]["Row"];
