// @ts-check
// 完成MP4の音量（ebur128）と長い無音（品質ゲート用）。ffmpeg がなければ null。short-movie の measureAudio と同じ測り方。
import fs from "node:fs";
import { spawnSync } from "node:child_process";

/** @param {string} mp4 */
export function measureAudio(mp4) {
  if (!fs.existsSync(mp4)) return null;
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", mp4, "-af", "ebur128=peak=true,silencedetect=n=-45dB:d=1.5", "-f", "null", "-"], { encoding: "utf8" });
  const out = `${r.stderr ?? ""}`;
  const lufs = Number(out.match(/Integrated loudness:[\s\S]*?I:\s+(-?[\d.]+) LUFS/)?.[1]);
  const peak = Number(out.match(/True peak:[\s\S]*?Peak:\s+(-?[\d.]+) dBFS/)?.[1]);
  const silences = (out.match(/silence_start/g) ?? []).length;
  return { lufs: Number.isFinite(lufs) ? lufs : null, truePeak: Number.isFinite(peak) ? peak : null, longSilences: silences };
}
