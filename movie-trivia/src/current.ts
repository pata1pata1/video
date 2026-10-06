// The video being made (data only). `node scripts/new-video.mjs` rewrites this
// file and current-diagrams.ts; everything else in src/ is shared by all videos.
import script from "../script/fusion-magnet.json";
import narration from "../public/audio/fusion-magnet/narration.json";
import mediaSources from "../public/media/fusion-magnet/sources.json";
import mediaFrames from "../public/media/fusion-magnet/frames.json";

export { script, narration, mediaSources, mediaFrames };
