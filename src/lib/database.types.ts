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

import type { FilmFormat, FilmType } from "./film-classification";
import type { ExposureControl } from "./camera-exposure";

export type RollStatus = "active" | "completed" | "archived";
export type Selection = "heart" | "star";
export const SELECTIONS: Selection[] = ["heart", "star"];
export type ExposureEvaluation = "Too Dark" | "Too Bright" | "Correct" | "Unknown";
export const EXPOSURE_EVALUATIONS: ExposureEvaluation[] = [
  "Too Dark",
  "Too Bright",
  "Correct",
  "Unknown",
];
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
          /** Which exposure settings the photographer chooses; settings the camera chooses itself are not applicable. */
          exposure_control: ExposureControl;
          /** Short user-chosen label, e.g. "F-1"; null when none set. */
          abbreviation: string | null;
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
          exposure_control?: ExposureControl;
          abbreviation?: string | null;
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
          exposure_control?: ExposureControl;
          abbreviation?: string | null;
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
          format: FilmFormat | null;
          /** null = not classified yet (older stocks). */
          film_type: FilmType | null;
          /** Structured film card design; null = no custom card. Parse with parseFilmCardDesign. */
          card_design: unknown | null;
          active: boolean;
        } & Timestamps;
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          iso?: number | null;
          format?: FilmFormat | null;
          film_type?: FilmType | null;
          card_design?: unknown | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          iso?: number | null;
          format?: FilmFormat | null;
          film_type?: FilmType | null;
          card_design?: unknown | null;
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
          /** Null when the roll was created without consuming inventory (e.g. an archive import). */
          film_inventory_item_id: string | null;
          camera_id: string;
          /** Optional. Null = lens unknown unless a frame names its own; never inferred. */
          default_lens_id: string | null;
          /** Roll-level default location; frames.location_id overrides it. */
          location_id: string | null;
          start_date: string;
          end_date: string | null;
          custom_title: string | null;
          status: RollStatus;
          current_frame: number;
          drive_folder_id: string | null;
          drive_folder_name: string | null;
          drive_parent_folder_id: string | null;
          drive_jpeg_folder_id: string | null;
          drive_raw_folder_id: string | null;
          drive_selects_folder_id: string | null;
          notes: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          user_id?: string;
          film_stock_id: string;
          /** Null when the roll was created without consuming inventory (e.g. an archive import). */
          film_inventory_item_id: string | null;
          camera_id: string;
          /** Optional. Null = lens unknown unless a frame names its own; never inferred. */
          default_lens_id: string | null;
          /** Roll-level default location; frames.location_id overrides it. */
          location_id: string | null;
          start_date: string;
          end_date?: string | null;
          custom_title?: string | null;
          status?: RollStatus;
          current_frame?: number;
          drive_folder_id?: string | null;
          drive_folder_name?: string | null;
          drive_parent_folder_id?: string | null;
          drive_jpeg_folder_id?: string | null;
          drive_raw_folder_id?: string | null;
          drive_selects_folder_id?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          film_stock_id?: string;
          film_inventory_item_id?: string | null;
          camera_id?: string;
          default_lens_id?: string | null;
          location_id?: string | null;
          start_date?: string;
          end_date?: string | null;
          custom_title?: string | null;
          status?: RollStatus;
          current_frame?: number;
          drive_folder_id?: string | null;
          drive_folder_name?: string | null;
          drive_parent_folder_id?: string | null;
          drive_jpeg_folder_id?: string | null;
          drive_raw_folder_id?: string | null;
          drive_selects_folder_id?: string | null;
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
          location_id: string | null;
          notes: string | null;
          drive_file_id: string | null;
          drive_filename: string | null;
          drive_thumbnail_url: string | null;
          drive_view_url: string | null;
          synced_at: string | null;
          exposure_evaluation: ExposureEvaluation | null;
          /** Attention level: null = unmarked, heart = worth time, star = one of the best. Independent of exposure_evaluation. */
          selection: Selection | null;
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
          location_id?: string | null;
          notes?: string | null;
          drive_file_id?: string | null;
          drive_filename?: string | null;
          drive_thumbnail_url?: string | null;
          drive_view_url?: string | null;
          synced_at?: string | null;
          exposure_evaluation?: ExposureEvaluation | null;
          selection?: Selection | null;
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
          location_id?: string | null;
          notes?: string | null;
          drive_file_id?: string | null;
          drive_filename?: string | null;
          drive_thumbnail_url?: string | null;
          drive_view_url?: string | null;
          synced_at?: string | null;
          exposure_evaluation?: ExposureEvaluation | null;
          selection?: Selection | null;
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
      tags: {
        Row: { id: string; user_id: string; name: string; created_at: string };
        Insert: { id?: string; user_id?: string; name: string; created_at?: string };
        Update: { id?: string; user_id?: string; name?: string; created_at?: string };
        Relationships: [];
      };
      frame_tags: {
        Row: { frame_id: string; tag_id: string; user_id: string; created_at: string };
        Insert: {
          frame_id: string;
          tag_id: string;
          user_id?: string;
          created_at?: string;
        };
        Update: {
          frame_id?: string;
          tag_id?: string;
          user_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "frame_tags_frame_id_fkey";
            columns: ["frame_id"];
            referencedRelation: "frames";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "frame_tags_tag_id_fkey";
            columns: ["tag_id"];
            referencedRelation: "tags";
            referencedColumns: ["id"];
          },
        ];
      };
      /** Global user tags on a roll. Never copied onto frames: a frame's effective tags are roll_tags ∪ frame_tags. */
      roll_tags: {
        Row: { roll_id: string; tag_id: string; user_id: string; created_at: string };
        Insert: { roll_id: string; tag_id: string; user_id?: string; created_at?: string };
        Update: { roll_id?: string; tag_id?: string; user_id?: string; created_at?: string };
        Relationships: [
          {
            foreignKeyName: "roll_tags_roll_id_fkey";
            columns: ["roll_id"];
            referencedRelation: "rolls";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "roll_tags_tag_id_fkey";
            columns: ["tag_id"];
            referencedRelation: "tags";
            referencedColumns: ["id"];
          },
        ];
      };
      locations: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; user_id?: string; name: string; created_at?: string; updated_at?: string };
        Update: { id?: string; user_id?: string; name?: string; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      user_settings: {
        Row: {
          user_id: string;
          drive_archive_root_id: string | null;
          drive_archive_root_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id?: string;
          drive_archive_root_id?: string | null;
          drive_archive_root_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          drive_archive_root_id?: string | null;
          drive_archive_root_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      create_roll: {
        Args: {
          p_film_stock_id: string;
          p_camera_id: string;
          p_start_date: string;
          p_film_inventory_item_id?: string | null;
          p_default_lens_id?: string | null;
          p_custom_title?: string | null;
          p_notes?: string | null;
          p_location_id?: string | null;
          p_tag_names?: string[];
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
          p_location_id?: string | null;
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
          p_location_id?: string | null;
        };
        Returns: Database["public"]["Tables"]["frames"]["Row"];
      };
      finish_roll: {
        Args: { p_roll_id: string; p_end_date?: string | null };
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
      get_or_create_tag: {
        Args: { p_name: string };
        Returns: Database["public"]["Tables"]["tags"]["Row"];
      };
      get_or_create_location: {
        Args: { p_name: string };
        Returns: Database["public"]["Tables"]["locations"]["Row"];
      };
      bulk_tag_frames: {
        Args: { p_frame_ids: string[]; p_tag_name: string };
        Returns: number;
      };
      remove_last_frame: {
        Args: { p_roll_id: string };
        Returns: Database["public"]["Tables"]["frames"]["Row"];
      };
      insert_frame: {
        Args: { p_roll_id: string; p_after_frame_number: number };
        Returns: Database["public"]["Tables"]["frames"]["Row"];
      };
      import_roll_images: {
        Args: {
          p_roll_id: string;
          p_drive_folder_id: string;
          p_drive_folder_name: string | null;
          /** Array of {drive_file_id, drive_filename, drive_thumbnail_url, drive_view_url}, in SmartConvert order. */
          p_files: unknown;
        };
        Returns: { created: number; existing: number; missing: number };
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
export type Tag = Database["public"]["Tables"]["tags"]["Row"];
export type Location = Database["public"]["Tables"]["locations"]["Row"];
export type RollTag = Database["public"]["Tables"]["roll_tags"]["Row"];
