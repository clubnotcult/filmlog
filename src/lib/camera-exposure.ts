/**
 * Which exposure settings a camera lets the photographer choose. Mirrors the
 * cameras.exposure_control check constraint. A setting the camera chooses
 * itself is "not applicable": it's never asked for, never required, and
 * stored as null — a compact like the Olympus AF-1 has no shutter speed or
 * aperture to log, and the app must never make one up.
 */
export const EXPOSURE_CONTROLS = [
  { value: "manual", label: "Manual", hint: "You set shutter speed and aperture" },
  { value: "aperture_priority", label: "Aperture priority", hint: "You set aperture; the camera picks the shutter" },
  { value: "shutter_priority", label: "Shutter priority", hint: "You set shutter speed; the camera picks the aperture" },
  { value: "automatic", label: "Automatic", hint: "Point-and-shoot — the camera sets both" },
] as const;

export type ExposureControl = (typeof EXPOSURE_CONTROLS)[number]["value"];

export function isExposureControl(value: unknown): value is ExposureControl {
  return EXPOSURE_CONTROLS.some((c) => c.value === value);
}

export function exposureControlLabel(value: string | null | undefined): string {
  return EXPOSURE_CONTROLS.find((c) => c.value === value)?.label ?? "Manual";
}

/** True when the photographer chooses the shutter speed on this camera. Unknown/legacy = manual. */
export function shutterApplies(control: string | null | undefined): boolean {
  return control !== "aperture_priority" && control !== "automatic";
}

/** True when the photographer chooses the aperture on this camera. Unknown/legacy = manual. */
export function apertureApplies(control: string | null | undefined): boolean {
  return control !== "shutter_priority" && control !== "automatic";
}
