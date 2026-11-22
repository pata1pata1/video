// The video being made (data only). `node scripts/mt.mjs new|switch` rewrites this
// file and current-diagrams.ts; everything else in src/ is shared by all videos.
// The video is the project folder ../nagicho-frontier-models-20261123/ (shared remotion engine layout).
import script from "../nagicho-frontier-models-20261123/input/script.json";
import narration from "../nagicho-frontier-models-20261123/audio/narration.json";
import ledger from "../nagicho-frontier-models-20261123/assets/asset-sources.json";
import mediaFrames from "../nagicho-frontier-models-20261123/assets/frames.json";

// asset-sources.json (the shared ledger form) -> what the compositions read:
// media/<id>/<file> is the file's path in render-public, "image" was "photo".
const mediaSources: Record<string, Record<string, unknown>> = Object.fromEntries(
  Object.entries(ledger as unknown as Record<string, { mediaType?: string; localFile: string }>).map(([key, r]) => [
    key,
    { ...r, mediaType: r.mediaType === "image" ? "photo" : r.mediaType, file: `media/nagicho-frontier-models-20261123/${r.localFile}` },
  ]),
);

export { script, narration, mediaSources, mediaFrames };
