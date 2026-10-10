// Phase 2: apply the approved cuts in input/decisions.json.
//   npm run cut -- --project=<id> [--dry-run] [--force]          → intermediate/cut-preview.mp4（軽量プレビュー）
//   npm run cut -- --project=<id> --final [--force]              → intermediate/cut.mp4（本番品質。プレビュー確認後）
// Both also write intermediate/timemap.json and <output>.report.json.
// Stops if: the source sha256 changed, decisions do not match the candidates,
// any candidate is still pending, or the result fails a length / sync / orientation check.

import { fmtTime, parseArgs, runCli } from "../src/cli.ts";
import { runCut } from "../src/cut.ts";
import { loadProject } from "../src/project.ts";

await runCli(async () => {
  const args = parseArgs();
  const project = loadProject(args.get("project"));
  const quality = args.has("final") ? "final" : "preview";
  const { plan, report } = await runCut(project, { quality, force: args.has("force"), dryRun: args.has("dry-run"), log: (s) => console.error(s) });
  if (!report) return;
  const a = report.actual;
  console.log(`\n出力: intermediate/${report.output}（${quality === "preview" ? "軽量プレビュー" : "本番品質"}）`);
  console.log(`長さ: 映像 ${a.videoSeconds.toFixed(3)}秒（${fmtTime(a.videoSeconds)}）／音声 ${a.audioSeconds.toFixed(3)}秒／予定 ${report.plannedSeconds.toFixed(3)}秒／承認からの見込み ${report.predictedSeconds.toFixed(3)}秒`);
  console.log(`元動画との差: ${(plan.videoEnd - a.videoSeconds).toFixed(3)}秒短縮（${plan.videoEnd.toFixed(3)} → ${a.videoSeconds.toFixed(3)}）`);
  console.log(`フレーム: ${a.frames}（予定 ${report.expectedFrames}）、境目のフレーム合わせ 最大 ${report.maxSnapMs}ms`);
  console.log(`向き: 元の回転 ${report.rotation.source}° → 出力 ${report.rotation.output}°（${report.rotation.width}×${report.rotation.height}）${report.rotation.upright ? "正しい向き" : "要確認"}`);
  console.log(`音声の位置（元との相関でずれを測定）: ${report.audioChecks.map((c) => `${fmtTime(c.outT)} ${c.lagMs}ms(相関${c.corr})`).join("、")}`);
  console.log(`映像の位置（元の同じ時刻のフレームとの差 vs 6フレーム前後）: ${report.videoChecks.map((c) => `${fmtTime(c.outT)} 差${c.mad}／前後${c.madNeighbours.join("・")}`).join("、")}`);
  console.log("→ intermediate/timemap.json、" + report.output.replace(".mp4", ".report.json"));
});
