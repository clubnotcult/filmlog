"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PillGroup } from "@/components/pill-group";
import { FinishRollMenu } from "@/components/active-roll/finish-roll-menu";
import { formatAperture, formatPush } from "@/lib/exposure-format";
import {
  clearFrameDraft,
  loadFrameDraft,
  saveFrameDraft,
  type FrameDraft,
} from "@/lib/active-roll-storage";
import { saveFrameAndAdvance, finishRoll, reopenRoll } from "@/app/(app)/active-roll/actions";
import { updateFrameFields } from "@/app/(app)/rolls/[id]/frames/actions";
import type { Camera, Frame, Lens, Roll } from "@/lib/database.types";

const PUSH_PULL_OPTIONS = [-2, -1, 0, 1, 2];
const EXPECTED_ROLL_LENGTH = 36;

type FieldState = {
  shutterSpeed: string | null;
  shutterTouched: boolean;
  aperture: number | null;
  apertureTouched: boolean;
  lensId: string;
  lensTouched: boolean;
  pushPull: number;
  pushTouched: boolean;
  notes: string;
  metadataLogged: boolean;
};

/**
 * The starting values a NEW frame's composer opens with: inherited from the
 * last LOGGED frame (unlogged frames are skipped — they carry no exposure
 * information to inherit from), or, with no logged frames yet, the roll's
 * default lens with nothing else pre-selected.
 */
function baselineFieldState(lastLoggedFrame: Frame | null, defaultLensId: string): FieldState {
  if (lastLoggedFrame) {
    return {
      shutterSpeed: lastLoggedFrame.shutter_speed,
      shutterTouched: false,
      aperture: lastLoggedFrame.aperture,
      apertureTouched: false,
      lensId: lastLoggedFrame.lens_id ?? defaultLensId,
      lensTouched: false,
      pushPull: lastLoggedFrame.push_pull ?? 0,
      pushTouched: false,
      notes: "",
      metadataLogged: true,
    };
  }
  return {
    shutterSpeed: null,
    shutterTouched: false,
    aperture: null,
    apertureTouched: false,
    lensId: defaultLensId,
    lensTouched: false,
    pushPull: 0,
    pushTouched: false,
    notes: "",
    metadataLogged: true,
  };
}

/** An existing saved frame's fields, shown exactly as recorded — nothing inherited, nothing guessed. */
function fieldStateFromExisting(frame: Frame, defaultLensId: string): FieldState {
  return {
    shutterSpeed: frame.shutter_speed,
    shutterTouched: false,
    aperture: frame.aperture,
    apertureTouched: false,
    lensId: frame.lens_id ?? defaultLensId,
    lensTouched: false,
    pushPull: frame.push_pull ?? 0,
    pushTouched: false,
    notes: frame.notes ?? "",
    metadataLogged: frame.metadata_logged,
  };
}

/** Safe wrapper so this can be called during initial state computation without crashing during SSR. */
function loadFrameDraftSafe(rollId: string, frameNumber: number) {
  if (typeof window === "undefined") return null;
  return loadFrameDraft(rollId, frameNumber);
}

export function ActiveRollShooter({
  roll: initialRoll,
  camera,
  lenses,
  frames: initialFrames,
}: {
  roll: Roll;
  camera: Camera;
  lenses: Lens[];
  /** Every saved frame for this roll, ascending by frame_number. */
  frames: Frame[];
}) {
  const router = useRouter();

  const [roll, setRoll] = useState(initialRoll);
  const [frames, setFrames] = useState(initialFrames);
  const maxSaved = frames.length > 0 ? frames[frames.length - 1].frame_number : 0;
  const [viewedFrameNumber, setViewedFrameNumber] = useState(maxSaved + 1);

  const existingFrame = useMemo(
    () => frames.find((f) => f.frame_number === viewedFrameNumber) ?? null,
    [frames, viewedFrameNumber],
  );
  const isNewFrame = existingFrame === null;

  function findLastLoggedFrame(frameList: Frame[]): Frame | null {
    for (let i = frameList.length - 1; i >= 0; i--) {
      if (frameList[i].metadata_logged) return frameList[i];
    }
    return null;
  }

  function loadFieldState(frameNumber: number, frameList: Frame[]) {
    const existing = frameList.find((f) => f.frame_number === frameNumber);
    if (existing) {
      applyFieldState(fieldStateFromExisting(existing, roll.default_lens_id));
      return;
    }
    // New frame slot — a cached draft (a refresh mid-composition) takes
    // priority over a fresh inheritance baseline.
    const draft = loadFrameDraft(roll.id, frameNumber);
    if (draft) {
      applyFieldState({
        shutterSpeed: draft.shutterSpeed,
        shutterTouched: draft.shutterTouched,
        aperture: draft.aperture,
        apertureTouched: draft.apertureTouched,
        lensId: draft.lensId,
        lensTouched: draft.lensTouched,
        pushPull: draft.pushPull,
        pushTouched: draft.pushTouched,
        notes: draft.notes,
        metadataLogged: true,
      });
      return;
    }
    applyFieldState(baselineFieldState(findLastLoggedFrame(frameList), roll.default_lens_id));
  }

  const initialFieldState = (() => {
    const draft = loadFrameDraftSafe(initialRoll.id, maxSaved + 1);
    if (draft) {
      return {
        shutterSpeed: draft.shutterSpeed,
        shutterTouched: draft.shutterTouched,
        aperture: draft.aperture,
        apertureTouched: draft.apertureTouched,
        lensId: draft.lensId,
        lensTouched: draft.lensTouched,
        pushPull: draft.pushPull,
        pushTouched: draft.pushTouched,
        notes: draft.notes,
        metadataLogged: true,
      };
    }
    return baselineFieldState(findLastLoggedFrame(initialFrames), initialRoll.default_lens_id);
  })();

  const [shutterSpeed, setShutterSpeed] = useState(initialFieldState.shutterSpeed);
  const [shutterTouched, setShutterTouched] = useState(initialFieldState.shutterTouched);
  const [aperture, setAperture] = useState(initialFieldState.aperture);
  const [apertureTouched, setApertureTouched] = useState(initialFieldState.apertureTouched);
  const [lensId, setLensId] = useState(initialFieldState.lensId);
  const [lensTouched, setLensTouched] = useState(initialFieldState.lensTouched);
  const [pushPull, setPushPull] = useState(initialFieldState.pushPull);
  const [pushTouched, setPushTouched] = useState(initialFieldState.pushTouched);
  const [notes, setNotes] = useState(initialFieldState.notes);
  const [metadataLogged, setMetadataLogged] = useState(initialFieldState.metadataLogged);

  function applyFieldState(state: FieldState) {
    setShutterSpeed(state.shutterSpeed);
    setShutterTouched(state.shutterTouched);
    setAperture(state.aperture);
    setApertureTouched(state.apertureTouched);
    setLensId(state.lensId);
    setLensTouched(state.lensTouched);
    setPushPull(state.pushPull);
    setPushTouched(state.pushTouched);
    setNotes(state.notes);
    setMetadataLogged(state.metadataLogged);
  }

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reopening, setReopening] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  // Persist the in-progress NEW-frame draft on every change, so a refresh
  // doesn't lose it. Only the composer for the new frame slot drafts to
  // localStorage — an in-progress edit to an existing frame is discardable
  // unless explicitly saved via "Save Changes".
  useEffect(() => {
    if (roll.status !== "active" || saving || !isNewFrame) return;
    const draft: FrameDraft = {
      frameNumber: viewedFrameNumber,
      shutterSpeed,
      shutterTouched,
      aperture,
      apertureTouched,
      lensId,
      lensTouched,
      pushPull,
      pushTouched,
      notes,
    };
    saveFrameDraft(roll.id, draft);
  }, [
    roll.id,
    roll.status,
    saving,
    isNewFrame,
    viewedFrameNumber,
    shutterSpeed,
    shutterTouched,
    aperture,
    apertureTouched,
    lensId,
    lensTouched,
    pushPull,
    pushTouched,
    notes,
  ]);

  const selectedLens = useMemo(
    () => lenses.find((l) => l.id === lensId) ?? null,
    [lenses, lensId],
  );
  const apertureOptions = selectedLens?.aperture_stops ?? [];

  function handleLensSelect(newLensId: string) {
    setLensId(newLensId);
    setLensTouched(true);
    const newLens = lenses.find((l) => l.id === newLensId);
    if (aperture !== null && newLens && !newLens.aperture_stops.includes(aperture)) {
      // The previously selected aperture doesn't exist on this lens — never
      // silently substitute another value. Require an explicit re-selection.
      setAperture(null);
      setApertureTouched(false);
    }
  }

  const canSaveNew = shutterSpeed !== null && aperture !== null && !saving;
  const hasPendingSelection = isNewFrame && shutterSpeed !== null && aperture !== null;

  const isDirty =
    !isNewFrame &&
    existingFrame !== null &&
    (shutterSpeed !== existingFrame.shutter_speed ||
      aperture !== existingFrame.aperture ||
      lensId !== (existingFrame.lens_id ?? roll.default_lens_id) ||
      pushPull !== (existingFrame.push_pull ?? 0) ||
      notes !== (existingFrame.notes ?? "") ||
      metadataLogged !== existingFrame.metadata_logged);

  function navigateTo(frameNumber: number) {
    if (isDirty) {
      const proceed = window.confirm(`Discard unsaved changes to Frame ${viewedFrameNumber}?`);
      if (!proceed) return;
    }
    setSaveError(null);
    setSavedNotice(false);
    setViewedFrameNumber(frameNumber);
    loadFieldState(frameNumber, frames);
  }

  function goToPrevious() {
    if (viewedFrameNumber <= 1) return;
    navigateTo(viewedFrameNumber - 1);
  }

  function goToNext() {
    if (viewedFrameNumber >= maxSaved + 1) return;
    navigateTo(viewedFrameNumber + 1);
  }

  async function performSave(): Promise<{ ok: boolean; error?: string }> {
    if (shutterSpeed === null || aperture === null) {
      return { ok: false, error: "Select a shutter speed and aperture first." };
    }
    setSaving(true);
    setSaveError(null);
    const result = await saveFrameAndAdvance(roll.id, {
      metadataLogged: true,
      shutterSpeed,
      aperture,
      lensId,
      pushPull,
      notes: notes.trim() || null,
    });
    setSaving(false);

    if (!result.ok) {
      setSaveError(result.error);
      return { ok: false, error: result.error };
    }

    clearFrameDraft(roll.id);
    const saved = result.data;
    const nextFrames = [...frames, saved];
    setFrames(nextFrames);
    setViewedFrameNumber(saved.frame_number + 1);
    loadFieldState(saved.frame_number + 1, nextFrames);

    return { ok: true };
  }

  /**
   * "No Input Logged": the frame was shot but exposure is unknown. Saves
   * immediately with everything null rather than guessing — no confirmation
   * step, since adding friction here works against the point of the feature.
   */
  async function performSaveUnlogged(): Promise<{ ok: boolean; error?: string }> {
    setSaving(true);
    setSaveError(null);
    const result = await saveFrameAndAdvance(roll.id, {
      metadataLogged: false,
      shutterSpeed: null,
      aperture: null,
      lensId: null,
      pushPull: null,
      notes: notes.trim() || null,
    });
    setSaving(false);

    if (!result.ok) {
      setSaveError(result.error);
      return { ok: false, error: result.error };
    }

    clearFrameDraft(roll.id);
    const nextFrames = [...frames, result.data];
    setFrames(nextFrames);
    setViewedFrameNumber(result.data.frame_number + 1);
    loadFieldState(result.data.frame_number + 1, nextFrames);

    return { ok: true };
  }

  async function handleSaveExistingEdit() {
    if (!existingFrame) return;
    if (metadataLogged && (shutterSpeed === null || aperture === null)) {
      setSaveError("Select a shutter speed and aperture, or turn off Exposure Logged.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    const result = await updateFrameFields(roll.id, existingFrame.id, {
      metadataLogged,
      shutterSpeed,
      aperture,
      lensId,
      pushPull,
      notes: notes.trim() || null,
    });
    setSaving(false);

    if (!result.ok) {
      setSaveError(result.error);
      return;
    }

    setFrames((prev) => prev.map((f) => (f.id === result.data.id ? result.data : f)));
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  }

  async function handleFinish(): Promise<{ ok: boolean; error?: string }> {
    const result = await finishRoll(roll.id);
    if (!result.ok) return { ok: false, error: result.error };
    clearFrameDraft(roll.id);
    setRoll(result.data);
    router.push(`/rolls/${roll.id}`);
    return { ok: true };
  }

  async function handleSaveAndFinish(): Promise<{ ok: boolean; error?: string }> {
    const saveResult = await performSave();
    if (!saveResult.ok) return saveResult;
    return handleFinish();
  }

  async function handleReopen() {
    setReopening(true);
    const result = await reopenRoll(roll.id);
    setReopening(false);
    if (!result.ok) {
      setSaveError(result.error);
      return;
    }
    // Frame list needs a fresh fetch (a reopened roll's next frame depends on
    // the latest saved data) — a full reload is simplest and correct for
    // this infrequent action.
    window.location.reload();
  }

  if (roll.status !== "active") {
    return (
      <div className="mx-auto max-w-md rounded-md border border-border bg-surface px-5 py-6 text-center">
        <p className="text-sm text-foreground">This roll is complete.</p>
        <p className="mt-1 text-xs text-muted">
          Reopen it to continue shooting from the next frame.
        </p>
        <button
          type="button"
          disabled={reopening}
          onClick={handleReopen}
          className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
        >
          {reopening ? "Reopening…" : "Reopen Roll"}
        </button>
        {saveError && <p className="mt-3 text-xs text-red-400">{saveError}</p>}
      </div>
    );
  }

  const progressFraction = Math.min((viewedFrameNumber - 1) / EXPECTED_ROLL_LENGTH, 1);
  const canGoPrevious = viewedFrameNumber > 1;
  const canGoNext = viewedFrameNumber < maxSaved + 1;

  return (
    <div className="mx-auto max-w-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <p className="font-mono text-4xl tracking-tight text-foreground">
              FRAME {viewedFrameNumber}
            </p>
            {!isNewFrame && (
              <span className="shrink-0 rounded-full border border-accent/50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-accent">
                Reviewing
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted">
            {isNewFrame
              ? camera.name + (maxSaved === 0 ? " · Frame 1 — choose your starting exposure" : "")
              : "Editing a saved frame — changes here never affect other frames"}
          </p>
        </div>
        <FinishRollMenu
          frameNumber={viewedFrameNumber}
          hasPendingSelection={hasPendingSelection}
          onFinish={handleFinish}
          onSaveAndFinish={handleSaveAndFinish}
        />
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={goToPrevious}
          disabled={!canGoPrevious}
          className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-strong hover:text-foreground disabled:opacity-30"
        >
          ← Previous
        </button>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
          <div
            className="h-full bg-accent transition-all"
            style={{ width: `${progressFraction * 100}%` }}
          />
        </div>
        <button
          type="button"
          onClick={goToNext}
          disabled={!canGoNext}
          className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-strong hover:text-foreground disabled:opacity-30"
        >
          Next →
        </button>
      </div>

      {!isNewFrame && !metadataLogged ? (
        <div className="mt-8 rounded-md border border-border bg-surface px-4 py-3 text-center">
          <p className="text-sm text-muted-strong">This frame is marked No Input Logged.</p>
          <button
            type="button"
            onClick={() => {
              const baseline = baselineFieldState(findLastLoggedFrame(frames), roll.default_lens_id);
              applyFieldState({ ...baseline, metadataLogged: true, notes });
            }}
            className="mt-2 text-xs text-accent hover:underline"
          >
            Add exposure metadata now
          </button>
        </div>
      ) : (
        <div className="mt-8 space-y-7">
          <PillGroup
            label="Shutter speed"
            options={camera.shutter_speeds}
            optionLabel={(v) => v}
            value={shutterSpeed}
            touched={shutterTouched}
            reviewMode={!isNewFrame}
            onSelect={(v) => {
              setShutterSpeed(v);
              setShutterTouched(true);
            }}
            emptyMessage="This camera has no shutter speeds configured — edit it in Gear."
          />

          <PillGroup
            label="Aperture"
            options={apertureOptions}
            optionLabel={formatAperture}
            value={aperture}
            touched={apertureTouched}
            reviewMode={!isNewFrame}
            onSelect={(v) => {
              setAperture(v);
              setApertureTouched(true);
            }}
            emptyMessage="This lens has no aperture stops configured — edit it in Gear."
          />

          <PillGroup
            label="Lens"
            options={lenses.map((l) => l.id)}
            optionLabel={(id) => {
              const lens = lenses.find((l) => l.id === id);
              return lens?.focal_length || lens?.name || "?";
            }}
            value={lensId}
            touched={lensTouched}
            reviewMode={!isNewFrame}
            onSelect={handleLensSelect}
          />

          <PillGroup
            label="Push / Pull"
            options={PUSH_PULL_OPTIONS}
            optionLabel={formatPush}
            value={pushPull}
            touched={pushTouched}
            reviewMode={!isNewFrame}
            onSelect={(v) => {
              setPushPull(v);
              setPushTouched(true);
            }}
          />

          <div>
            <label htmlFor="frame-notes" className="mb-1.5 block text-xs uppercase tracking-wide text-muted">
              Note (optional)
            </label>
            <textarea
              id="frame-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={1}
              placeholder="Backlit storefront…"
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
            />
          </div>

          {!isNewFrame && (
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={metadataLogged}
                onChange={(e) => setMetadataLogged(e.target.checked)}
                className="h-4 w-4"
              />
              Exposure metadata logged
            </label>
          )}
        </div>
      )}

      <div className="mt-8">
        {saveError && <p className="mb-2 text-sm text-red-400">{saveError}</p>}
        {savedNotice && <p className="mb-2 text-sm text-accent">Saved.</p>}

        {isNewFrame ? (
          <>
            <button
              type="button"
              disabled={!canSaveNew}
              onClick={performSave}
              className="w-full rounded-md bg-accent py-4 text-lg font-semibold text-black transition-opacity disabled:opacity-40"
            >
              {saving ? "Saving…" : "NEXT FRAME →"}
            </button>
            {!canSaveNew && !saving && (
              <p className="mt-2 text-center text-xs text-muted">
                Select a shutter speed and aperture to continue.
              </p>
            )}
            <button
              type="button"
              disabled={saving}
              onClick={performSaveUnlogged}
              className="mt-3 w-full rounded-md border border-border py-2 text-xs text-muted hover:text-foreground disabled:opacity-50"
            >
              Forgot to log this shot? Mark Frame {viewedFrameNumber} as No Input Logged
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={!isDirty || saving}
            onClick={handleSaveExistingEdit}
            className="w-full rounded-md bg-accent py-4 text-lg font-semibold text-black transition-opacity disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        )}
      </div>
    </div>
  );
}
