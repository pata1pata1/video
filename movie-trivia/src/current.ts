// The video being made (data only). `node scripts/mt.mjs new|switch` rewrites this
// file and current-diagrams.ts; everything else in src/ is shared by all videos.
// The video is the project folder ../nagicho-claude-updates-20261125/ (shared remotion engine layout).
import script from "../nagicho-claude-updates-20261125/input/script.json";
import narration from "../nagicho-claude-updates-20261125/audio/narration.json";
import ledger from "../nagicho-claude-updates-20261125/assets/asset-sources.json";
import mediaFrames from "../nagicho-claude-updates-20261125/assets/frames.json";

// asset-sources.json (the shared ledger form) -> what the compositions read:
// media/<id>/<file> is the file's path in render-public, "image" was "photo".
const mediaSources: Record<string, Record<string, unknown>> = Object.fromEntries(
  Object.entries(ledger as unknown as Record<string, { mediaType?: string; localFile: string }>).map(([key, r]) => [
    key,
    { ...r, mediaType: r.mediaType === "image" ? "photo" : r.mediaType, file: `media/nagicho-claude-updates-20261125/${r.localFile}` },
  ]),
);

export { script, narration, mediaSources, mediaFrames };
