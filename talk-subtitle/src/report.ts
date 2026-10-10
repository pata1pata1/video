// Console tables shared by the scripts (what Claude reads back to the user).

import { CUT_KIND_LABELS, type CutCandidatesJson } from "./candidates.ts";
import { fmtTime } from "./cli.ts";
import { cutSummary, type CutDecision, type TermDecisionRecord } from "./decisions.ts";
import type { TermCandidatesJson } from "./terms.ts";

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

export function printCutCandidates(cuts: CutCandidatesJson, decisions: Record<string, CutDecision>, options: { limit?: number } = {}) {
  const s = cutSummary(cuts, decisions);
  console.log(`カット候補 ${s.total}件（カット ${s.cut}／残す ${s.keep}／未決定 ${s.pending}、カット合計 ${s.cutSeconds.toFixed(1)}秒）`);
  const counts = new Map<string, number>();
  for (const c of cuts.items) counts.set(c.kind, (counts.get(c.kind) ?? 0) + 1);
  console.log(`  種類別: ${[...counts].map(([k, n]) => `${CUT_KIND_LABELS[k as keyof typeof CUT_KIND_LABELS]} ${n}`).join("、") || "なし"}`);
  const rows = cuts.items.slice(0, options.limit ?? cuts.items.length);
  for (const c of rows) {
    const d = decisions[c.id];
    const state = d ? (d.decision === "cut" ? "カット" : "残す　") : "未決定";
    const range = d?.start !== undefined ? `${fmtTime(d.start)}–${fmtTime(d.end!)}*` : `${fmtTime(c.start)}–${fmtTime(c.end)} `;
    const text = c.text ? `「${clip(c.text.trim(), 24)}」` : "";
    console.log(
      `  ${c.id.padEnd(5)} [${state}] ${range} ${c.duration.toFixed(2).padStart(5)}秒 ${CUT_KIND_LABELS[c.kind]}／${c.suggestion === "cut" ? "カット提案" : "確認のみ"} ${text} ${clip(c.reason, 40)}`,
    );
  }
  if (rows.length < cuts.items.length) console.log(`  …ほか ${cuts.items.length - rows.length}件（review.html で全件確認できます）`);
}

export function printTermCandidates(terms: TermCandidatesJson, decisions: Record<string, TermDecisionRecord>) {
  const ok = terms.found.filter((f) => f.count > 0);
  if (ok.length) console.log(`正しく認識されていた語: ${ok.map((f) => `${f.surface}×${f.count}`).join("、")}`);
  for (const f of terms.found.filter((x) => x.partOf)) {
    console.log(`※ 辞書の「${f.surface}」が、より長い語「${f.partOf!.join("」「")}」の一部として出ています（別の名前か、辞書の表記違いの可能性。確認してください）`);
  }
  if (terms.items.length === 0) {
    console.log("固有名詞の補正候補: なし");
    return;
  }
  console.log(`固有名詞の補正候補 ${terms.items.length}件`);
  for (const t of terms.items) {
    const d = decisions[t.id];
    const state = d ? (d.decision === "accept" ? "採用　" : "不採用") : t.defaultDecision === "accept" ? "採用(初期値)" : "未決定";
    const to = d?.replacement ?? t.to;
    console.log(`  ${t.id.padEnd(4)} [${state}] ${fmtTime(t.start)} 「${t.from}」→「${to}」 ${t.reason}　…${t.context.before}【${t.from}】${t.context.after}…`);
  }
}
