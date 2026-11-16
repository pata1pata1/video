// The video being made (data only). `node scripts/mt.mjs new|switch` rewrites this
// file and current-diagrams.ts; everything else in src/ is shared by all videos.
// The video is the project folder ../mizoguchi-kaiwai/ (shared remotion engine layout).
import script from "../mizoguchi-kaiwai/input/script.json";
import narration from "../mizoguchi-kaiwai/audio/narration.json";
import ledger from "../mizoguchi-kaiwai/assets/asset-sources.json";
import mediaFrames from "../mizoguchi-kaiwai/assets/frames.json";

// asset-sources.json (the shared ledger form) -> what the compositions read:
// media/<id>/<file> is the file's path in render-public, "image" was "photo".
const mediaSources: Record<string, Record<string, unknown>> = Object.fromEntries(
  Object.entries(ledger as unknown as Record<string, { mediaType?: string; localFile: string }>).map(([key, r]) => [
    key,
    { ...r, mediaType: r.mediaType === "image" ? "photo" : r.mediaType, file: `media/mizoguchi-kaiwai/${r.localFile}` },
  ]),
);

export { script, narration, mediaSources, mediaFrames };
