/**
 * Active Roll's big number is the CAMERA'S counter, not an archive frame
 * number. A film camera shows 0 after loading and advances as each exposure
 * is made, so the counter is simply "how many exposures have been taken":
 *
 *   new roll, nothing shot            counter 0   (composing Frame 1)
 *   Frame 1 logged and advanced       counter 1   (composing Frame 2)
 *   ...
 *
 * The archive is untouched by this: frames are still stored 1-based
 * (Frame 1 is the first photograph, there is no Frame 0), and every stored
 * `frame_number` / `current_frame` is exactly what it always was. This module
 * only decides which number to DISPLAY.
 *
 * Two situations, deliberately different:
 *  - Composing the next frame (the live position): show the counter, which is
 *    one less than the number of the frame being logged.
 *  - Reviewing a saved frame: show that frame's real number, because the
 *    question there is "which photograph am I looking at?" — and the label
 *    next to it ("Frame" + Review, vs "Counter") says which reading it is.
 */
export function cameraCounterReading(input: {
  /** The archive number of the frame being composed or reviewed (always >= 1). */
  viewedFrameNumber: number;
  /** True when composing the next, not-yet-saved frame. */
  isNewFrame: boolean;
}): number {
  return input.isNewFrame ? input.viewedFrameNumber - 1 : input.viewedFrameNumber;
}

/** 0..1 along the roll, from the same reading the big number shows. */
export function counterProgress(reading: number, expectedRollLength: number): number {
  if (expectedRollLength <= 0) return 0;
  return Math.min(Math.max(reading / expectedRollLength, 0), 1);
}
