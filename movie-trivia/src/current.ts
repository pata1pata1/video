// The video being made (data only). `node scripts/mt.mjs new|switch` rewrites this
// file and current-diagrams.ts; everything else in src/ is shared by all videos.
// The video is the project folder ../tsugumi-sleep-habits-20261122/ (shared remotion engine layout).
import script from "../tsugumi-sleep-habits-20261122/input/script.json";
import narration from "../tsugumi-sleep-habits-20261122/audio/narration.json";
import ledger from "../tsugumi-sleep-habits-20261122/assets/asset-sources.json";
import mediaFrames from "../tsugumi-sleep-habits-20261122/assets/frames.json";

// asset-sources.json (the shared ledger form) -> what the compositions read:
// media/<id>/<file> is the file's path in render-public, "image" was "photo".
const mediaSources: Record<string, Record<string, unknown>> = Object.fromEntries(
  Object.entries(ledger as unknown as Record<string, { mediaType?: string; localFile: string }>).map(([key, r]) => [
    key,
    { ...r, mediaType: r.mediaType === "image" ? "photo" : r.mediaType, file: `media/tsugumi-sleep-habits-20261122/${r.localFile}` },
  ]),
);

export { script, narration, mediaSources, mediaFrames };
