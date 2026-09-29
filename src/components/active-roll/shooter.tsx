"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PillGroup } from "@/components/pill-group";
import { FinishRollMenu } from "@/components/active-roll/finish-roll-menu";
import { formatAperture } from "@/lib/exposure-format";
import {
  clearFrameDraft,
  loadFrameDraft,
  saveFrameDraft,
  type FrameDraft,
} from "@/lib/active-roll-storage";
import { saveFrameAndAdvance, finishRoll, reopenRoll } from "@/app/(app)/active-roll/actions";
import { updateFrameFields, removeLastFrame } from "@/app/(app)/rolls/[id]/frames/actions";
import { METER_TYPES } from "@/lib/database.types";
import {
  enqueuePendingSave,
  listPendingSaves,
  removePendingSave,
  isIndexedDbAvailable,
} from "@/lib/offline/queue";
import type { Camera, Frame, Lens, MeterType, Roll } from "@/lib/database.types";

const EXPECTED_ROLL_LENGTH = 36;

/** Short pill labels — the stored value is always the full name from METER_TYPES; this is display-only. */
function meterTypeShortLabel(type: MeterType): string {
  switch (type) {
    case "In Camera Meter":
      return "In-Cam";
    case "KEKS Meter":
      return "KEKS";
    case "Meter App":
      return "App";
    case "No Meter":
      return "None";
    case "Other":
      return "Other";
  }
}

type FieldState = {
  shutterSpeed: string | null;
  shutterTouched: boolean;
  aperture: number | null;
  apertureTouched: boolean;
  lensId: string;
  lensTouched: boolean;
  pushPull: number;
  pushTouched: boolean;
  meterType: MeterType | null;
  meterTouched: boolean;
  notes: string;
  metadataLogged: boolean;
};

/**
 * The starting values a NEW frame's composer opens with: inherited from the
 * last LOGGED frame (unlogged frames are skipped — they carry no exposure
 * information to inherit from), or, with no logged frames yet, the roll's
 * default lens and the camera's configured default meter type with nothing
 * else pre-selected.
 */
function baselineFieldState(
  lastLoggedFrame: Frame | null,
  defaultLensId: string,
  defaultMeterType: MeterType | null,
): FieldState {
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
      meterType: lastLoggedFrame.meter_type,
      meterTouched: false,
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
    meterType: defaultMeterType,
    meterTouched: false,
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
    meterType: frame.meter_type,
    meterTouched: false,
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
        meterType: (draft.meterType as MeterType | null) ?? null,
        meterTouched: draft.meterTouched ?? false,
        notes: draft.notes,
        metadataLogged: true,
      });
      return;
    }
    applyFieldState(baselineFieldState(findLastLoggedFrame(frameList), roll.default_lens_id, camera.default_meter_type));
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
        meterType: (draft.meterType as MeterType | null) ?? null,
        meterTouched: draft.meterTouched ?? false,
        notes: draft.notes,
        metadataLogged: true,
      };
    }
    return baselineFieldState(findLastLoggedFrame(initialFrames), initialRoll.default_lens_id, camera.default_meter_type);
  })();

  const [shutterSpeed, setShutterSpeed] = useState(initialFieldState.shutterSpeed);
  const [shutterTouched, setShutterTouched] = useState(initialFieldState.shutterTouched);
  const [aperture, setAperture] = useState(initialFieldState.aperture);
  const [apertureTouched, setApertureTouched] = useState(initialFieldState.apertureTouched);
  const [lensId, setLensId] = useState(initialFieldState.lensId);
  const [lensTouched, setLensTouched] = useState(initialFieldState.lensTouched);
  const [pushPull, setPushPull] = useState(initialFieldState.pushPull);
  const [pushTouched, setPushTouched] = useState(initialFieldState.pushTouched);
  const [meterType, setMeterType] = useState(initialFieldState.meterType);
  const [meterTouched, setMeterTouched] = useState(initialFieldState.meterTouched);
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
    setMeterType(state.meterType);
    setMeterTouched(state.meterTouched);
    setNotes(state.notes);
    setMetadataLogged(state.metadataLogged);
  }

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reopening, setReopening] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  /**
   * Flushes queued offline saves for this roll, strictly in the order they
   * were made — each one only calls the real saveFrameAndAdvance (the same
   * server-side frame-numbering, validation, and atomicity as any online
   * save), and only removes it from the queue once that call actually
   * succeeds. If one fails (e.g. the roll was finished from another device
   * while offline), flushing stops there rather than risking an
   * out-of-order write — the remaining queued items stay queued for the
   * next attempt, never silently dropped.
   */
  async function flushPendingSaves() {
    if (!isIndexedDbAvailable()) return;
    const pending = await listPendingSaves(roll.id);
    if (pending.length === 0) return;

    for (const entry of pending) {
      const result = await saveFrameAndAdvance(roll.id, {
        ...entry.input,
        meterType: entry.input.meterType as MeterType | null,
      });
      if (!result.ok) {
        setSaveError(`Couldn't sync a queued frame: ${result.error}`);
        return;
      }
      await removePendingSave(entry.localId);
      setPendingCount((c) => Math.max(0, c - 1));
      setFrames((prev) => [...prev, result.data]);
    }
  }

  useEffect(() => {
    if (!isIndexedDbAvailable()) return;
    /* eslint-disable react-hooks/set-state-in-effect -- syncing with two
       external systems (IndexedDB queue state, the browser's online status)
       on mount and on the 'online' event is exactly what effects are for;
       the resulting setState calls are the whole point, not an accident. */
    listPendingSaves(roll.id).then((pending) => setPendingCount(pending.length));

    function handleOnline() {
      void flushPendingSaves();
    }
    window.addEventListener("online", handleOnline);
    // Also attempt a flush on mount, in case the queue has leftovers from a
    // previous session that ended before reconnecting.
    if (typeof navigator !== "undefined" && navigator.onLine) void flushPendingSaves();
    /* eslint-enable react-hooks/set-state-in-effect */

    return () => window.removeEventListener("online", handleOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roll.id]);

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
      meterType,
      meterTouched,
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
    meterType,
    meterTouched,
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
      meterType !== existingFrame.meter_type ||
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

  async function queueOffline(input: {
    metadataLogged: boolean;
    shutterSpeed: string | null;
    aperture: number | null;
    lensId: string | null;
    pushPull: number | null;
    notes: string | null;
    meterType: MeterType | null;
  }): Promise<{ ok: boolean; error?: string }> {
    setSaving(false);
    if (!isIndexedDbAvailable()) {
      const msg = "Offline, and this browser can't queue the save locally. Try again once you're back online.";
      setSaveError(msg);
      return { ok: false, error: msg };
    }
    await enqueuePendingSave({
      localId: `${roll.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      rollId: roll.id,
      queuedAt: Date.now(),
      input,
      optimisticFrameNumber: viewedFrameNumber,
    });
    setPendingCount((c) => c + 1);
    clearFrameDraft(roll.id);
    // Advance the local view optimistically so shooting can continue without
    // waiting for a connection. This does NOT add a row to `frames` — the
    // queued frame isn't a saved frame yet, only a server-confirmed sync
    // (see flushPendingSaves) ever adds one. Previous/Next navigation into
    // this exact not-yet-synced frame isn't supported in this first pass;
    // it becomes reviewable normally once it syncs.
    setViewedFrameNumber(viewedFrameNumber + 1);
    loadFieldState(viewedFrameNumber + 1, frames);
    return { ok: true };
  }

  async function performSave(): Promise<{ ok: boolean; error?: string }> {
    if (shutterSpeed === null || aperture === null) {
      return { ok: false, error: "Select a shutter speed and aperture first." };
    }
    const input = {
      metadataLogged: true,
      shutterSpeed,
      aperture,
      lensId,
      pushPull,
      notes: notes.trim() || null,
      meterType,
    };

    setSaving(true);
    setSaveError(null);

    // Offline — queue locally rather than lose the shot. This is the one
    // write in the app that gets this treatment; it's the one that would
    // actually cost a photo's logged exposure if it silently failed.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return queueOffline(input);
    }

    try {
      const result = await saveFrameAndAdvance(roll.id, input);
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
    } catch {
      // A genuine network failure (not a validation error the server
      // returned — those come back as { ok: false }, not a thrown error) —
      // queue rather than show an error and lose the frame.
      return queueOffline(input);
    }
  }

  /**
   * "No Input Logged": the frame was shot but exposure is unknown. Saves
   * immediately with everything null rather than guessing — no confirmation
   * step, since adding friction here works against the point of the feature.
   */
  async function performSaveUnlogged(): Promise<{ ok: boolean; error?: string }> {
    const input = {
      metadataLogged: false,
      shutterSpeed: null,
      aperture: null,
      lensId: null,
      pushPull: null,
      notes: notes.trim() || null,
      meterType: null,
    };

    setSaving(true);
    setSaveError(null);

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return queueOffline(input);
    }

    let result;
    try {
      result = await saveFrameAndAdvance(roll.id, input);
    } catch {
      return queueOffline(input);
    }
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
      meterType,
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

  /**
   * The fast mistake-correction path: only ever removes whichever frame is
   * genuinely the roll's most recent (enforced server-side by
   * remove_last_frame, not by trusting which frame the UI happens to be
   * showing) — so this is only offered at all while viewing that exact
   * frame. After removal, current_frame rolls back and the view returns to
   * composing that same frame number fresh, exactly as if it had never
   * been saved.
   */
  async function handleRemoveLastFrame() {
    if (!window.confirm(`Remove Frame ${viewedFrameNumber}? This cannot be undone.`)) return;
    setSaving(true);
    setSaveError(null);
    const result = await removeLastFrame(roll.id);
    setSaving(false);
    if (!result.ok) {
      setSaveError(result.error);
      return;
    }
    const removedNumber = result.data.frame_number;
    const nextFrames = frames.filter((f) => f.id !== result.data.id);
    setFrames(nextFrames);
    setViewedFrameNumber(removedNumber);
    loadFieldState(removedNumber, nextFrames);
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
      <div className="mx-auto max-w-md border-y border-border py-8 text-center">
        <p className="text-sm text-foreground">This roll is complete.</p>
        <p className="mt-1 text-xs text-muted">
          Reopen it to continue shooting from the next frame.
        </p>
        <button
          type="button"
          disabled={reopening}
          onClick={handleReopen}
          className="mt-4 numeral inline-flex h-10 items-center justify-center bg-accent px-4 text-xs font-medium uppercase tracking-[0.14em] text-black disabled:opacity-50"
        >
          {reopening ? "Reopening…" : "Reopen Roll"}
        </button>
        {saveError && <p className="mt-3 text-xs text-danger">{saveError}</p>}
      </div>
    );
  }

  const progressFraction = Math.min((viewedFrameNumber - 1) / EXPECTED_ROLL_LENGTH, 1);
  const canGoPrevious = viewedFrameNumber > 1;
  const canGoNext = viewedFrameNumber < maxSaved + 1;
  const primaryLabel = isNewFrame ? (saving ? "Saving…" : "NEXT →") : saving ? "Saving…" : "SAVE";
  const primaryDisabled = isNewFrame ? !canSaveNew : !isDirty || saving;
  const primaryAction = isNewFrame ? performSave : handleSaveExistingEdit;
  // Only true while viewing the frame that is genuinely the roll's most
  // recent save — remove_last_frame itself also enforces this server-side,
  // this just decides whether to offer the button at all.
  const isViewingLastSavedFrame = !isNewFrame && existingFrame?.frame_number === maxSaved;

  return (
    <div className="mx-auto max-w-md">
      {/* Instrument header. The frame number is the largest thing on the
          screen — it is the one reading you must never have to hunt for. It
          stays put (sticky) so the primary action is always under the thumb,
          and every element here has a fixed size so nothing moves when
          state changes. */}
      <div className="sticky top-0 z-10 -mx-5 border-b border-border bg-background/95 px-5 pb-3 pt-2 backdrop-blur">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex h-3 items-center gap-3">
              <span className="label">Frame</span>
              {!isNewFrame && <span className="label !text-accent">Review</span>}
            </div>
            <div className="numeral mt-1.5 text-6xl font-light leading-none text-foreground">
              {String(viewedFrameNumber).padStart(2, "0")}
            </div>
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
            aria-label="Previous frame"
            className="numeral flex h-11 w-10 shrink-0 items-center justify-start text-xl text-muted-strong hover:text-foreground disabled:opacity-25"
          >
            ←
          </button>
          <div className="relative h-[3px] flex-1" aria-hidden="true">
            <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
            <div
              className="absolute left-0 top-0 h-full bg-accent"
              style={{ width: `${progressFraction * 100}%` }}
            />
          </div>
          <button
            type="button"
            onClick={goToNext}
            disabled={!canGoNext}
            aria-label="Next frame"
            className="numeral flex h-11 w-10 shrink-0 items-center justify-end text-xl text-muted-strong hover:text-foreground disabled:opacity-25"
          >
            →
          </button>
          <button
            type="button"
            disabled={primaryDisabled}
            onClick={primaryAction}
            className="numeral flex h-11 min-w-[6.5rem] shrink-0 items-center justify-center bg-accent px-5 text-sm font-medium uppercase tracking-[0.14em] text-black disabled:opacity-30"
          >
            {primaryLabel}
          </button>
        </div>

        {/* Fixed height regardless of content (error / saved / hint) so the
            sticky header's own height never changes and shifts everything
            below it — truncated rather than wrapped, for the same reason. */}
        <p className="mt-2 h-4 truncate text-xs">
          {saveError ? (
            <span className="text-danger">{saveError}</span>
          ) : savedNotice ? (
            <span className="text-accent">Saved.</span>
          ) : pendingCount > 0 ? (
            <span className="text-accent">
              {pendingCount} frame{pendingCount === 1 ? "" : "s"} saved offline — will sync automatically
            </span>
          ) : (
            <span className="text-muted">
              {isNewFrame
                ? maxSaved === 0
                  ? camera.name + " · Frame 1 — choose your starting exposure"
                  : !canSaveNew
                    ? "Select a shutter speed and aperture to continue"
                    : camera.name
                : "Editing a saved frame — changes here never affect other frames"}
            </span>
          )}
        </p>
      </div>

      {!isNewFrame && !metadataLogged ? (
        <div className="mt-8 border-y border-border py-6 text-center">
          <p className="text-sm text-muted-strong">This frame is marked No Input Logged.</p>
          <button
            type="button"
            onClick={() => {
              const baseline = baselineFieldState(findLastLoggedFrame(frames), roll.default_lens_id, camera.default_meter_type);
              applyFieldState({ ...baseline, metadataLogged: true, notes });
            }}
            className="mt-2 text-xs text-accent hover:underline"
          >
            Add exposure metadata now
          </button>
        </div>
      ) : (
        <div className="mt-7 space-y-6">
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
            label="Meter"
            options={METER_TYPES}
            optionLabel={meterTypeShortLabel}
            value={meterType}
            touched={meterTouched}
            reviewMode={!isNewFrame}
            onSelect={(v) => {
              setMeterType(v);
              setMeterTouched(true);
            }}
          />

          <div>
            <label htmlFor="frame-notes" className="label mb-1 block">
              Note (optional)
            </label>
            <textarea
              id="frame-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={1}
              placeholder="Backlit storefront…"
              className="field resize-none"
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

          {isViewingLastSavedFrame && (
            <button
              type="button"
              disabled={saving}
              onClick={handleRemoveLastFrame}
              className="text-xs text-danger/80 hover:text-danger disabled:opacity-50"
            >
              Remove Frame {viewedFrameNumber} (undo this save)
            </button>
          )}
        </div>
      )}

      {/* min-h reserves the button's space even when hidden (reviewing an
          existing frame), so the page's total height — and anything a
          person might be scrolled near — doesn't shift when switching
          between composing and reviewing. */}
      <div className="mt-8 min-h-10">
        {isNewFrame && (
          <button
            type="button"
            disabled={saving}
            onClick={performSaveUnlogged}
            className="w-full py-3 text-xs text-muted hover:text-foreground disabled:opacity-50"
          >
            Forgot to log this shot? Mark Frame {viewedFrameNumber} as No Input Logged
          </button>
        )}
      </div>
    </div>
  );
}
