/**
 * Roll → frame metadata inheritance, in one place.
 *
 * Nothing here writes anything. A frame stores only what was explicitly set
 * on it; a roll stores its defaults. The *effective* value is resolved at
 * read time — frame value first, roll default second, otherwise unknown —
 * so changing a roll default updates every frame that inherits it, can never
 * overwrite an explicit frame value, and never turns an inherited value into
 * a stored override.
 *
 * Lens has no further fallback on purpose: with no frame lens and no roll
 * default the lens is unknown. It is never inferred from another frame,
 * another roll, or the camera.
 */

export type ValueSource = "frame" | "roll" | null;

export type Effective<T> = { value: T | null; source: ValueSource };

export function resolveEffective<T>(frameValue: T | null | undefined, rollValue: T | null | undefined): Effective<T> {
  if (frameValue !== null && frameValue !== undefined) return { value: frameValue, source: "frame" };
  if (rollValue !== null && rollValue !== undefined) return { value: rollValue, source: "roll" };
  return { value: null, source: null };
}

export function effectiveLensId(
  frame: { lens_id: string | null },
  roll: { default_lens_id: string | null },
): Effective<string> {
  return resolveEffective(frame.lens_id, roll.default_lens_id);
}

export function effectiveLocationId(
  frame: { location_id: string | null },
  roll: { location_id: string | null },
): Effective<string> {
  return resolveEffective(frame.location_id, roll.location_id);
}

export type EffectiveTag = { name: string; source: "roll" | "frame" };

/**
 * A frame's user tags: the roll's global tags plus the frame's own,
 * de-duplicated case-insensitively. A tag present at both levels is reported
 * once, as "frame" — it was assigned independently, and removing it from the
 * roll must not make it disappear from this frame.
 */
export function effectiveUserTags(rollTags: string[], frameTags: string[]): EffectiveTag[] {
  const byKey = new Map<string, EffectiveTag>();
  for (const name of rollTags) {
    const key = name.toLowerCase();
    if (!byKey.has(key)) byKey.set(key, { name, source: "roll" });
  }
  for (const name of frameTags) {
    byKey.set(name.toLowerCase(), { name, source: "frame" });
  }
  return [...byKey.values()];
}

/** Groups tag-name rows (from roll_tags / frame_tags embeds) by their owner id. */
export function groupTagNames<K extends string>(
  rows: ({ tags: unknown } & Record<K, string>)[] | null | undefined,
  key: K,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const row of rows ?? []) {
    const name = (row.tags as { name: string } | null)?.name;
    if (!name) continue;
    const id = row[key];
    const list = out.get(id) ?? [];
    list.push(name);
    out.set(id, list);
  }
  return out;
}
