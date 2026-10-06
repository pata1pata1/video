// Free stock media from Pexels (videos and photos) for a script.
//
//   Candidates (search only, nothing goes into public/):
//     node scripts/pexels.mjs candidates --script=<id> [--scene=<sceneId>] [--per=6] [--kind=video|photo] [--query="..."]
//     -> out/<id>/candidates/<sceneId>-<kind>.png  (contact sheet, numbered left-to-right)
//        .cache/pexels/<id>/<sceneId>-<kind>.json  (the search result)
//   Pick one (downloads it and records its source):
//     node scripts/pexels.mjs pick --script=<id> --scene=<sceneId> --video=<pexels id> [--force]
//     node scripts/pexels.mjs pick --script=<id> --scene=<sceneId> --photo=<pexels id> [--force]
//     -> public/media/<id>/<sceneId>.mp4|.jpg and public/media/<id>/sources.json
//
// PEXELS_API_KEY is read from .env and sent only in the Authorization header;
// its value is never printed. Pexels License: free for commercial use, no
// attribution required — we still keep the source of every file.

import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** Footage fills the 1920x1080 frame, so take the 1080p file when there is one. */
const VIDEO_TARGET_LONG_EDGE = 1920;
const MAX_BYTES = 150 * 1024 * 1024;
const LICENSE = { name: "Pexels License", url: "https://www.pexels.com/license/" };
const isPexelsHost = (h) => h === "pexels.com" || h.endsWith(".pexels.com");

const [command, ...rest] = process.argv.slice(2);
const opt = (name) => rest.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const scriptId = opt("script");
if (!["candidates", "pick"].includes(command) || !scriptId) {
  console.error("Usage: node scripts/pexels.mjs <candidates|pick> --script=<id> ... (see the header of this file)");
  process.exit(1);
}
const script = JSON.parse(fs.readFileSync(path.join(ROOT, "script", `${scriptId}.json`), "utf8"));
const mediaDir = path.join(ROOT, "public", "media", scriptId);
const ledgerPath = path.join(mediaDir, "sources.json");

function apiKey() {
  const env = fs.existsSync(path.join(ROOT, ".env")) ? fs.readFileSync(path.join(ROOT, ".env"), "utf8") : "";
  const key = env.match(/^PEXELS_API_KEY=(.*)$/m)?.[1]?.trim();
  if (!key) throw new Error("PEXELS_API_KEY is not set in .env");
  return key;
}

async function pexels(url) {
  const res = await fetch(url, { headers: { Authorization: apiKey() } });
  if (!res.ok) throw new Error(`Pexels ${new URL(url).pathname} -> HTTP ${res.status}`);
  return res.json();
}

/** Downloads from a Pexels host only (checked after redirects too). */
async function download(url, expectType) {
  const first = new URL(url);
  if (first.protocol !== "https:" || !isPexelsHost(first.hostname)) throw new Error(`refusing non-Pexels host ${first.hostname}`);
  const res = await fetch(first);
  if (!isPexelsHost(new URL(res.url).hostname)) throw new Error(`redirected to non-Pexels host ${new URL(res.url).hostname}`);
  if (!res.ok) throw new Error(`download -> HTTP ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  if (!type.startsWith(expectType)) throw new Error(`unexpected Content-Type "${type}" (expected ${expectType})`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new Error(`file is ${bytes.length} bytes, over the limit`);
  return bytes;
}

/** Landscape MP4 whose long edge is closest to (but not over) the target; else the smallest bigger one. */
function pickVideoFile(video) {
  const files = (video.video_files ?? []).filter((f) => f.file_type === "video/mp4" && f.width > f.height && f.link);
  const fit = files.filter((f) => f.width <= VIDEO_TARGET_LONG_EDGE);
  if (fit.length) return fit.reduce((a, b) => (b.width > a.width ? b : a));
  return files.length ? files.reduce((a, b) => (b.width < a.width ? b : a)) : null;
}

/**
 * What to search for: each entry of the script's top-level `media` map
 * ({ key: { query } }, footage shared by any line), else every scene with a
 * media.query. --scene picks one key / scene id.
 */
function factScenes() {
  const only = opt("scene");
  const keyed = Object.entries(script.media ?? {}).map(([id, m]) => ({ id, media: m }));
  const all = keyed.length ? keyed : script.scenes.filter((s) => s.media?.query);
  const scenes = only ? all.filter((s) => s.id === only) : all;
  if (only && scenes.length === 0) throw new Error(`unknown scene ${only}`);
  return scenes;
}

async function candidates() {
  const kind = opt("kind") ?? "video";
  const per = Number(opt("per") ?? 6);
  const cacheDir = path.join(ROOT, ".cache", "pexels", scriptId);
  const outDir = path.join(ROOT, "out", scriptId, "candidates");
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });
  for (const scene of factScenes()) {
    const query = opt("query") ?? scene.media?.query;
    if (!query) throw new Error(`${scene.id}: no media.query and no --query`);
    const url =
      kind === "photo"
        ? `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=landscape&per_page=${per}`
        : `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=landscape&per_page=${per}`;
    const data = await pexels(url);
    const items = kind === "photo" ? data.photos : data.videos;
    fs.writeFileSync(path.join(cacheDir, `${scene.id}-${kind}.json`), JSON.stringify(data, null, 2));
    console.log(`\n[${scene.id}] "${query}" (${kind}) — ${data.total_results} results`);
    const thumbs = [];
    for (const [i, item] of items.entries()) {
      const thumbUrl = kind === "photo" ? item.src.medium : item.image;
      const file = path.join(outDir, `${scene.id}-${kind}-${i + 1}.jpg`);
      fs.writeFileSync(file, await download(thumbUrl, "image/"));
      thumbs.push(file);
      const detail =
        kind === "photo"
          ? `${item.width}x${item.height}  ${item.photographer}  ${item.alt ?? ""}`
          : `${item.duration}s  ${pickVideoFile(item) ? `${pickVideoFile(item).width}x${pickVideoFile(item).height}` : "no landscape mp4"}  ${item.user?.name}`;
      console.log(`  ${i + 1}. id=${item.id}  ${detail}`);
    }
    if (thumbs.length) {
      // Contact sheet: thumbnails in a 3-wide grid, numbered left-to-right.
      const sheet = path.join(outDir, `${scene.id}-${kind}.png`);
      const inputs = thumbs.flatMap((t) => ["-i", t]);
      const scaled = thumbs.map((_, i) => `[${i}:v]scale=480:270:force_original_aspect_ratio=increase,crop=480:270[t${i}]`).join(";");
      const pad = (3 - (thumbs.length % 3)) % 3;
      const blanks = Array.from({ length: pad }, (_, i) => `color=c=white:s=480x270:d=1[b${i}]`).join(";");
      const all = [...thumbs.map((_, i) => `[t${i}]`), ...Array.from({ length: pad }, (_, i) => `[b${i}]`)];
      const layout = all.map((_, i) => `${(i % 3) * 480}_${Math.floor(i / 3) * 270}`).join("|");
      const graph = [scaled, blanks, `${all.join("")}xstack=inputs=${all.length}:layout=${layout}`].filter(Boolean).join(";");
      await run(ffmpegPath, ["-v", "error", "-y", ...inputs, "-filter_complex", graph, "-frames:v", "1", sheet]);
      for (const t of thumbs) fs.rmSync(t);
      console.log(`  sheet: ${path.relative(ROOT, sheet)}`);
    }
  }
}

async function pick() {
  const sceneId = opt("scene");
  const videoId = opt("video");
  const photoId = opt("photo");
  if (!sceneId || !!videoId === !!photoId) throw new Error("pick needs --scene and exactly one of --video / --photo");
  const id = videoId ?? photoId;
  if (!/^\d+$/.test(id)) throw new Error(`Pexels id must be numeric (got "${id}")`);
  const ledger = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, "utf8")) : {};
  const ext = videoId ? "mp4" : "jpg";
  const file = path.join(mediaDir, `${sceneId}.${ext}`);
  if (!rest.includes("--force") && (ledger[sceneId] || fs.existsSync(file))) {
    throw new Error(`${sceneId} already has media (${ledger[sceneId]?.file ?? path.basename(file)}); use --force to replace it`);
  }

  let bytes;
  let record;
  if (videoId) {
    const video = await pexels(`https://api.pexels.com/videos/videos/${videoId}`);
    const f = pickVideoFile(video);
    if (!f) throw new Error(`video ${videoId} has no landscape MP4`);
    bytes = await download(f.link, "video/mp4");
    if (bytes.toString("ascii", 4, 8) !== "ftyp") throw new Error("downloaded file is not an MP4");
    record = {
      mediaType: "video",
      pexelsId: video.id,
      sourceUrl: video.url,
      creator: video.user?.name,
      creatorUrl: video.user?.url,
      width: f.width,
      height: f.height,
      fps: f.fps,
      durationSeconds: video.duration,
    };
  } else {
    const photo = await pexels(`https://api.pexels.com/v1/photos/${photoId}`);
    bytes = await download(photo.src.large2x, "image/jpeg");
    record = {
      mediaType: "photo",
      pexelsId: photo.id,
      sourceUrl: photo.url,
      creator: photo.photographer,
      creatorUrl: photo.photographer_url,
      alt: photo.alt,
    };
  }

  fs.mkdirSync(mediaDir, { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, bytes);
  fs.renameSync(tmp, file);
  // Only the old file of the *other* type can be left over after --force.
  for (const other of ["mp4", "jpg"]) if (other !== ext) fs.rmSync(path.join(mediaDir, `${sceneId}.${other}`), { force: true });
  ledger[sceneId] = {
    provider: "pexels",
    sourceName: "Pexels",
    ...record,
    license: LICENSE,
    // Set by a human after checking the Pexels page and what the media shows.
    rightsStatus: "unknown",
    downloadedAt: new Date().toISOString(),
    file: `media/${scriptId}/${sceneId}.${ext}`,
  };
  fs.writeFileSync(`${ledgerPath}.tmp`, JSON.stringify(ledger, null, 2) + "\n");
  fs.renameSync(`${ledgerPath}.tmp`, ledgerPath);
  console.log(`${sceneId}: saved ${path.relative(ROOT, file)} (${(bytes.length / 1e6).toFixed(1)} MB) — ${record.creator} ${record.sourceUrl}`);
}

(command === "candidates" ? candidates() : pick()).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
