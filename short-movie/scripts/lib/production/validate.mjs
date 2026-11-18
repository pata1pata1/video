// @ts-check
// 台本の検証：video 側の事前確認（script.mjs の precheckScript）→ content-ops の `production validate-script`（正本）。
// content-ops の CLI を子プロセスで呼ぶ（--save は付けない＝content-ops のファイルを書き換えない）。
// fail ならナレーション（VOICEVOX）・字幕・レンダリングをしない。warning は、安全に関わらないもの（必須の事実が台本にない）だけ進める。

import { spawnSync } from "node:child_process";
import path from "node:path";
import { contentOpsRoot } from "./contract.mjs";

/**
 * @param {{ campaignId: string, key: string, scriptPath: string }} o
 * @returns {{ status: "pass" | "warning" | "fail" | "error", renderAllowed: boolean, proceed: boolean, safeWarnings: string[], blockingWarnings: string[], problems: string[], output: string }}
 */
export function runContentOpsValidation(o) {
  const bin = path.join(contentOpsRoot(), "bin", "co.mts");
  const res = spawnSync(process.execPath, [bin, "production", "validate-script", `--campaign=${o.campaignId}`, `--key=${o.key}`, `--script=${path.resolve(o.scriptPath)}`], { encoding: "utf8", env: process.env });
  const output = `${res.stdout ?? ""}${res.stderr ?? ""}`;
  const m = output.match(/台本の検証：(pass|warning|fail)/u);
  const lines = output.split("\n").map((l) => l.trim());
  const problems = lines.filter((l) => l.startsWith("✗"));
  const warnings = lines.filter((l) => l.startsWith("!"));
  // 安全に関わらない warning：必須の事実が台本にない（足すのが望ましいが、誤った事実ではない）。出典の明示漏れは安全に関わるので止める
  const safeWarnings = warnings.filter((w) => w.includes("必須の事実が台本にない"));
  const blockingWarnings = warnings.filter((w) => !safeWarnings.includes(w));
  if (!m) return { status: "error", renderAllowed: false, proceed: false, safeWarnings, blockingWarnings, problems: [`content-ops の検証を実行できません（終了コード ${res.status}）`, ...lines.filter(Boolean).slice(0, 5)], output };
  const status = /** @type {"pass" | "warning" | "fail"} */ (m[1]);
  const renderAllowed = status !== "fail" && res.status === 0;
  return { status, renderAllowed, proceed: renderAllowed && blockingWarnings.length === 0, safeWarnings, blockingWarnings, problems, output };
}
