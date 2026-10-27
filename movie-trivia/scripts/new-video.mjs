// Starts a new video from a pattern, or switches src/ back to an existing one.
//
//   node scripts/new-video.mjs --id=<id> --pattern=pattern-01
//     script/<id>.json            from patterns/<pattern>/script-template.json
//     public/media/<id>/          sources.json {} and frames.json {}
//     public/audio/<id>/          narration.json placeholder (build-narration.mjs replaces it)
//     src/videos/<id>/diagrams.tsx  the video's own diagrams (empty)
//     youtube/<id>.md             posting notes (title, description, sources, fact check)
//     src/current.ts, current-diagrams.ts  point at <id>
//
//   node scripts/new-video.mjs --switch=<id>
//     only rewrites src/current.ts and current-diagrams.ts (to re-edit or re-render an existing video)
//
// Never overwrites an existing file.

import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/video.mjs";

const args = process.argv.slice(2);
const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];

/**
 * Points src/ at a video. Data (current.ts) and diagrams (current-diagrams.ts)
 * are separate files: diagrams import the theme, which reads the pattern,
 * which reads the script — one file would import itself in a circle.
 */
function writeCurrent(id) {
  fs.writeFileSync(
    path.join(ROOT, "src", "current.ts"),
    `// The video being made (data only). \`node scripts/new-video.mjs\` rewrites this
// file and current-diagrams.ts; everything else in src/ is shared by all videos.
import script from "../script/${id}.json";
import narration from "../public/audio/${id}/narration.json";
import mediaSources from "../public/media/${id}/sources.json";
import mediaFrames from "../public/media/${id}/frames.json";

export { script, narration, mediaSources, mediaFrames };
`,
  );
  fs.writeFileSync(
    path.join(ROOT, "src", "current-diagrams.ts"),
    `// The current video's diagrams. \`node scripts/new-video.mjs\` rewrites this file.
export { DIAGRAMS } from "./videos/${id}/diagrams";
`,
  );
  console.log(`src/current.ts, src/current-diagrams.ts -> ${id}`);
}

function create(rel, content) {
  const file = path.join(ROOT, rel);
  if (fs.existsSync(file)) {
    console.log(`kept   ${rel} (already exists)`);
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  console.log(`made   ${rel}`);
}

const switchId = opt("switch");
if (switchId) {
  for (const rel of [`script/${switchId}.json`, `public/audio/${switchId}/narration.json`, `public/media/${switchId}/sources.json`, `src/videos/${switchId}/diagrams.tsx`]) {
    if (!fs.existsSync(path.join(ROOT, rel))) throw new Error(`${rel} is missing; cannot switch to ${switchId}`);
  }
  writeCurrent(switchId);
  process.exit(0);
}

const id = opt("id");
const pattern = opt("pattern") ?? "pattern-01";
if (!id || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
  console.error("Usage: node scripts/new-video.mjs --id=<id: lowercase-with-hyphens> [--pattern=pattern-01]\n       node scripts/new-video.mjs --switch=<id>");
  process.exit(1);
}
const patternDir = path.join(ROOT, "patterns", pattern);
if (!fs.existsSync(patternDir)) throw new Error(`unknown pattern ${pattern}`);
if (fs.existsSync(path.join(ROOT, "script", `${id}.json`))) throw new Error(`script/${id}.json already exists — use --switch=${id}`);

const template = fs.readFileSync(path.join(patternDir, "script-template.json"), "utf8").replace(/__ID__/g, id);
create(`script/${id}.json`, template);
create(`public/media/${id}/sources.json`, "{}\n");
create(`public/media/${id}/frames.json`, "{}\n");
// Placeholder so src/ compiles; the video refuses to render until build-narration.mjs runs.
create(`public/audio/${id}/narration.json`, JSON.stringify({ script: id, durationSeconds: 1, lines: [], scenes: [] }, null, 2) + "\n");
create(
  `src/videos/${id}/diagrams.tsx`,
  `// Diagrams for ${id} only, by the name used in the script (visual.diagram).
// Shared parts: src/diagram-kit.tsx (useSteps, Svg, T, Card). Colors: color.accent / color.cool.
// Example:
//
//   const Example: React.FC<{ steps: StepFrames }> = ({ steps }) => {
//     const { reveal } = useSteps(steps);
//     return (
//       <Svg>
//         <T x={W / 2} y={120} size={52} weight={900}>見出し</T>
//         <g opacity={reveal(2)}>…step 2 で出るもの…</g>
//       </Svg>
//     );
//   };
import { Diagrams } from "../../diagram-kit";

export const DIAGRAMS: Diagrams = {};
`,
);
create(
  `youtube/${id}.md`,
  `# ${id} 投稿メモ

## タイトル案
1.
2.
3.

## 説明文

▼チャプター
（node scripts/chapters.mjs --script=${id} の出力）

▼出典
・

▼素材
ナレーション：VOICEVOX:（話者名）
映像（Pexels）
・

（ハッシュタグ5〜8個。最初の3つがタイトルの上に出る）

## 確認待ち
- Pexels素材の rightsStatus はすべて \`unknown\`（人が元ページを確認する）

## 事実確認メモ（台本の数字と根拠）
| 台本 | 根拠 |
|---|---|
`,
);
writeCurrent(id);
console.log(`\nnext: write script/${id}.json (pattern ${pattern}: patterns/${pattern}/README.md), then node scripts/build-narration.mjs --script=${id} --dry-run`);
