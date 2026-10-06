import { staticFile } from "remotion";
import { MAX_CAPTION_WIDTH, captionWidth } from "../components/Subtitle";
import type { LessonEntry } from "../lessons/registry";
import { beatLineIds } from "../scenes/recording";
import type { LessonScript, Narration } from "./types";

/**
 * Loads narration.json (public/) and checks it still matches lesson.json:
 * same chapters, scenes and lines in the same order with the same text.
 * A stale narration (script edited, audio not rebuilt) stops the render
 * instead of showing captions that don't match the audio. Display-only
 * caption overrides must name existing lines and fit two subtitle rows.
 */
export async function loadNarration(
  file: string,
  lesson: LessonScript,
  captions: Record<string, string>,
  presentation: Pick<LessonEntry, "cues" | "shots" | "beats">,
): Promise<Narration> {
  const res = await fetch(staticFile(file));
  if (!res.ok) throw new Error(`Cannot load ${file} (HTTP ${res.status}). Run scripts/voicevox/build-narration.mjs.`);
  const narration = (await res.json()) as Narration;

  const problems: string[] = [];
  if (narration.lessonId !== lesson.id) problems.push(`lessonId ${narration.lessonId} != ${lesson.id}`);

  const scenes = lesson.chapters.flatMap((c) => c.scenes);
  const sceneIds = scenes.map((s) => s.id).join(",");
  if (narration.scenes.map((s) => s.id).join(",") !== sceneIds) problems.push("scene list differs");
  if (narration.chapters.map((c) => c.id).join(",") !== lesson.chapters.map((c) => c.id).join(",")) {
    problems.push("chapter list differs");
  }

  const lines = scenes.flatMap((s) => s.lines.map((l) => ({ ...l, sceneId: s.id })));
  if (narration.lines.length !== lines.length) problems.push(`line count ${narration.lines.length} != ${lines.length}`);
  lines.forEach((l, i) => {
    const n = narration.lines[i];
    if (!n || n.id !== l.id || n.sceneId !== l.sceneId || n.text !== l.text.trim()) problems.push(`line ${l.id} differs`);
  });

  const lineIds = new Set(lines.map((l) => l.id));
  const sceneIdSet = new Set(scenes.map((s) => s.id));
  for (const [sceneId, cue] of Object.entries(presentation.cues)) {
    if (!sceneIdSet.has(sceneId)) problems.push(`cue for unknown scene ${sceneId}`);
    for (const id of cue) if (!lineIds.has(id)) problems.push(`cue ${sceneId} names unknown line ${id}`);
  }
  for (const [sceneId, shot] of Object.entries(presentation.shots)) {
    if (!sceneIdSet.has(sceneId)) problems.push(`shot for unknown scene ${sceneId}`);
    for (const seg of shot.segments ?? []) {
      if (seg.atLine !== undefined && !lineIds.has(seg.atLine)) problems.push(`shot ${sceneId} names unknown line ${seg.atLine}`);
    }
  }
  for (const [sceneId, beats] of Object.entries(presentation.beats ?? {})) {
    if (!sceneIdSet.has(sceneId)) problems.push(`beats for unknown scene ${sceneId}`);
    for (const id of beats.flatMap(beatLineIds)) if (!lineIds.has(id)) problems.push(`beats ${sceneId} name unknown line ${id}`);
  }
  for (const [id, text] of Object.entries(captions)) {
    if (!lineIds.has(id)) problems.push(`caption override for unknown line ${id}`);
    else if (captionWidth(text) > MAX_CAPTION_WIDTH) problems.push(`caption override ${id} is too long`);
  }

  if (problems.length > 0) {
    throw new Error(
      `${file} does not match lesson.json (${problems.slice(0, 5).join("; ")}). ` +
        "Rebuild it: node scripts/voicevox/build-narration.mjs --lesson=NN|free-trial --force",
    );
  }
  return narration;
}
