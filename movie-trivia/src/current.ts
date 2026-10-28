// The video being made (data only). `node scripts/new-video.mjs` rewrites this
// file and current-diagrams.ts; everything else in src/ is shared by all videos.
import script from "../script/gmo-desktop-cloud.json";
import narration from "../public/audio/gmo-desktop-cloud/narration.json";
import mediaSources from "../public/media/gmo-desktop-cloud/sources.json";
import mediaFrames from "../public/media/gmo-desktop-cloud/frames.json";

export { script, narration, mediaSources, mediaFrames };
