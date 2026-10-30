// The video being made (data only). `node scripts/new-video.mjs` rewrites this
// file and current-diagrams.ts; everything else in src/ is shared by all videos.
import script from "../script/mt-engine-test.json";
import narration from "../public/audio/mt-engine-test/narration.json";
import mediaSources from "../public/media/mt-engine-test/sources.json";
import mediaFrames from "../public/media/mt-engine-test/frames.json";

export { script, narration, mediaSources, mediaFrames };
