// The video being made (data only). `node scripts/mt.mjs new|switch` rewrites this
// file and current-diagrams.ts; everything else in src/ is shared by all videos.
// The video is the project folder ../hirakata-abuse/ (shared remotion engine layout).
import script from "../hirakata-abuse/input/script.json";
import narration from "../hirakata-abuse/audio/narration.json";
import ledger from "../hirakata-abuse/assets/asset-sources.json";
import mediaFrames from "../hirakata-abuse/assets/frames.json";

// asset-sources.json (the shared ledger form) -> what the compositions read:
// media/<id>/<file> is the file's path in render-public, "image" was "photo".
const mediaSources: Record<string, Record<string, unknown>> = Object.fromEntries(
  Object.entries(ledger as unknown as Record<string, { mediaType?: string; localFile: string }>).map(([key, r]) => [
    key,
    { ...r, mediaType: r.mediaType === "image" ? "photo" : r.mediaType, file: `media/hirakata-abuse/${r.localFile}` },
  ]),
);

export { script, narration, mediaSources, mediaFrames };
