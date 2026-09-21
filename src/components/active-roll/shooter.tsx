"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PillGroup } from "@/components/pill-group";
import { FinishRollMenu } from "@/components/active-roll/finish-roll-menu";
import {
  clearFrameDraft,
  loadFrameDraft,
  saveFrameDraft,
  type FrameDraft,
} from "@/lib/active-roll-storage";
import { saveFrameAndAdvance, finishRoll, reopenRoll } from "@/app/(app)/active-roll/actions";
import type { Camera, Frame, Lens, Roll } from "@/lib/database.types";

const PUSH_PULL_OPTIONS = [-2, -1, 0, 1, 2];
const EXPECTED_ROLL_LENGTH = 36;

function formatPush(value: number): string {
  if (value === 0) return "0";
  return value > 0 ? `+${value}` : `${value}`;
}

function formatAperture(value: number): string {
  return `f/${value}`;
}

/** The starting values a new frame opens with: either inherited from the last saved frame, or, for Frame 1, the roll's default lens with nothing else pre-selected. */
function baselineFrom(lastFrame: Frame | null, defaultLensId: string) {
  if (lastFrame) {
    return {
      shutterSpeed: lastFrame.shutter_speed,
      aperture: lastFrame.aperture,
      lensId: lastFrame.lens_id ?? defaultLensId,
      pushPull: lastFrame.push_pull,
    };
  }
  return {
    shutterSpeed: null as string | null,
    aperture: null as number | null,
    lensId: defaultLensId,
    pushPull: 0,
  };
}

export function ActiveRollShooter({
  roll: initialRoll,
  camera,
  lenses,
  lastFrame: initialLastFrame,
  nextFrameNumber: initialNextFrameNumber,
}: {
  roll: Roll;
  camera: Camera;
  lenses: Lens[];
  lastFrame: Frame | null;
  nextFrameNumber: number;
}) {
  const router = useRouter();

  const [roll, setRoll] = useState(initialRoll);
  const [lastFrame, setLastFrame] = useState(initialLastFrame);
  const [frameNumber, setFrameNumber] = useState(initialNextFrameNumber);

  const baseline = baselineFrom(initialLastFrame, initialRoll.default_lens_id);
  const [shutterSpeed, setShutterSpeed] = useState<string | null>(baseline.shutterSpeed);
  const [shutterTouched, setShutterTouched] = useState(false);
  const [aperture, setAperture] = useState<number | null>(baseline.aperture);
  const [apertureTouched, setApertureTouched] = useState(false);
  const [lensId, setLensId] = useState(baseline.lensId);
  const [lensTouched, setLensTouched] = useState(false);
  const [pushPull, setPushPull] = useState(baseline.pushPull);
  const [pushTouched, setPushTouched] = useState(false);
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reopening, setReopening] = useState(false);

  useEffect(() => {
    const draft = loadFrameDraft(roll.id, initialNextFrameNumber);
    if (!draft) return;
    /* eslint-disable react-hooks/set-state-in-effect -- hydrating from
       localStorage after mount is the standard pattern for a browser API
       unavailable during SSR; the extra render is expected, not accidental. */
    setShutterSpeed(draft.shutterSpeed);
    setShutterTouched(draft.shutterTouched);
    setAperture(draft.aperture);
    setApertureTouched(draft.apertureTouched);
    setLensId(draft.lensId);
    setLensTouched(draft.lensTouched);
    setPushPull(draft.pushPull);
    setPushTouched(draft.pushTouched);
    setNotes(draft.notes);
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the in-progress draft on every change, so a refresh doesn't lose it.
  useEffect(() => {
    if (roll.status !== "active" || saving) return;
    const draft: FrameDraft = {
      frameNumber,
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
    frameNumber,
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

  const canSave = shutterSpeed !== null && aperture !== null && !saving;
  const hasPendingSelection = shutterSpeed !== null && aperture !== null;

  async function performSave(): Promise<{ ok: boolean; error?: string }> {
    if (shutterSpeed === null || aperture === null) {
      return { ok: false, error: "Select a shutter speed and aperture first." };
    }
    setSaving(true);
    setSaveError(null);
    const result = await saveFrameAndAdvance(roll.id, {
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
    setLastFrame(saved);
    setFrameNumber(saved.frame_number + 1);

    const next = baselineFrom(saved, roll.default_lens_id);
    setShutterSpeed(next.shutterSpeed);
    setShutterTouched(false);
    setAperture(next.aperture);
    setApertureTouched(false);
    setLensId(next.lensId);
    setLensTouched(false);
    setPushPull(next.pushPull);
    setPushTouched(false);
    setNotes("");

    return { ok: true };
  }

  async function handleNextFrame() {
    if (!canSave) return;
    await performSave();
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
    // Frame inheritance needs freshly refetched frame data — a full reload
    // is simplest and correct for this infrequent action.
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

  const progressFraction = Math.min((frameNumber - 1) / EXPECTED_ROLL_LENGTH, 1);

  return (
    <div className="mx-auto max-w-md">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-mono text-4xl tracking-tight text-foreground">
            FRAME {frameNumber}
          </p>
          <p className="mt-1 text-xs text-muted">
            {camera.name}
            {lastFrame ? "" : " · Frame 1 — choose your starting exposure"}
          </p>
        </div>
        <FinishRollMenu
          frameNumber={frameNumber}
          hasPendingSelection={hasPendingSelection}
          onFinish={handleFinish}
          onSaveAndFinish={handleSaveAndFinish}
        />
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface">
        <div
          className="h-full bg-accent transition-all"
          style={{ width: `${progressFraction * 100}%` }}
        />
      </div>

      <div className="mt-8 space-y-7">
        <PillGroup
          label="Shutter speed"
          options={camera.shutter_speeds}
          optionLabel={(v) => v}
          value={shutterSpeed}
          touched={shutterTouched}
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
          onSelect={handleLensSelect}
        />

        <PillGroup
          label="Push / Pull"
          options={PUSH_PULL_OPTIONS}
          optionLabel={formatPush}
          value={pushPull}
          touched={pushTouched}
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
      </div>

      <div className="mt-8">
        {saveError && <p className="mb-2 text-sm text-red-400">{saveError}</p>}
        <button
          type="button"
          disabled={!canSave}
          onClick={handleNextFrame}
          className="w-full rounded-md bg-accent py-4 text-lg font-semibold text-black transition-opacity disabled:opacity-40"
        >
          {saving ? "Saving…" : "NEXT FRAME →"}
        </button>
        {!canSave && !saving && (
          <p className="mt-2 text-center text-xs text-muted">
            Select a shutter speed and aperture to continue.
          </p>
        )}
      </div>
    </div>
  );
}
