// Diagrams for sakkki-dispute only, by the name used in the script (visual.diagram).
// Shared parts: src/diagram-kit.tsx (useSteps, Svg, T, Card). Colors: color.accent / color.cool.
// Facts: BreakingDown 公式Xの告知（9月18日）、スポーティングニュース日本版（9月18日）、かじやん（@masato_kajimoto）と sakkki（@sakkki34）のXの投稿（10月28〜29日）。
import React from "react";
import { Card, Diagrams, H, StepFrames, Svg, T, useSteps, W } from "../../diagram-kit";
import { color } from "../../theme";

const Heading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <T x={W / 2} y={100} size={54} weight={900}>
    {children}
  </T>
);

const Source: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <T x={W - 70} y={H - 36} size={24} fill={color.inkFaint} anchor="end">
    {children}
  </T>
);

// 9月18日の中止発表から10月29日のAIまとめまで。step ごとに行が増え、今の行を強調
const Timeline: React.FC<{ steps: StepFrames }> = ({ steps }) => {
  const { reveal, current } = useSteps(steps);
  const rows: { step: number; date: string; text: string; hot?: boolean }[] = [
    { step: 1, date: "9月18日", text: "運営がsakkki選手の試合中止を発表（理由なし）", hot: true },
    { step: 1, date: "9月19日", text: "BreakingDown21（札幌）は予定どおり開催" },
    { step: 2, date: "10月28日 午後", text: "かじやんが動画を投稿、弁償を要求", hot: true },
    { step: 3, date: "10月28日 夜", text: "本人が「名誉毀損」「印象操作」と反論" },
    { step: 4, date: "10月29日", text: "かじやんがAIのまとめを投稿／応酬が続く" },
  ];
  const top = 220;
  const gap = 120;
  return (
    <Svg>
      <Heading>騒動の経緯</Heading>
      <line x1={420} x2={420} y1={top} y2={top + gap * (rows.length - 1)} stroke={color.line} strokeWidth={6} opacity={reveal(1)} />
      {rows.map((r, i) => {
        const y = top + i * gap;
        const on = reveal(r.step, (i % 2) * 5);
        const now = current(r.step);
        const c = r.hot ? color.accent : color.cool;
        return (
          <g key={r.date} opacity={on}>
            <circle cx={420} cy={y} r={18 + 6 * now} fill={c} />
            <T x={380} y={y} size={36} weight={900} anchor="end" fill={c}>
              {r.date}
            </T>
            <rect x={470} y={y - 40} width={1300} height={80} rx={18} fill={now > 0 ? (r.hot ? color.accentSoft : color.coolSoft) : color.card} stroke={color.line} strokeWidth={2} />
            <T x={500} y={y} size={36} weight={now > 0 ? 900 : 700} anchor="start">
              {r.text}
            </T>
          </g>
        );
      })}
      <Source>出典：BreakingDown公式Xの告知、両者のXの投稿</Source>
    </Svg>
  );
};

// 告発側（左・赤）と本人（右・紫）の主張。step 6 で「公式発表なし」を下に出す
const Claims: React.FC<{ steps: StepFrames }> = ({ steps }) => {
  const { reveal, current } = useSteps(steps);
  const left = [
    { step: 1, text: "従業員を殴り、店を壊した" },
    { step: 2, text: "10時間以上閉じ込めて暴行" },
    { step: 3, text: "9月14日に現行犯逮捕、約20日で釈放" },
  ];
  const right = [
    { step: 1, text: "名誉毀損・印象操作だ" },
    { step: 4, text: "「逮捕されました」（容疑は書かず）" },
    { step: 5, text: "先に出血したのは自分" },
  ];
  const col = (items: typeof left, x: number, c: string) =>
    items.map((it, i) => {
      const y = 340 + i * 130;
      const now = current(it.step);
      return (
        <g key={it.text} opacity={reveal(it.step)}>
          <rect x={x} y={y - 48} width={800} height={96} rx={18} fill={now > 0 ? (c === color.accent ? color.accentSoft : color.coolSoft) : color.card} stroke={color.line} strokeWidth={2} />
          <T x={x + 400} y={y} size={36} weight={now > 0 ? 900 : 700}>
            {it.text}
          </T>
        </g>
      );
    });
  return (
    <Svg>
      <Heading>ぶつかる2つの言い分</Heading>
      <g opacity={reveal(1)}>
        <Card x={100} y={170} w={840} h={560} />
        <T x={520} y={225} size={44} weight={900} fill={color.accent}>
          告発側（かじやん）
        </T>
        <Card x={980} y={170} w={840} h={560} />
        <T x={1400} y={225} size={44} weight={900} fill={color.cool}>
          本人（sakkki）
        </T>
      </g>
      {col(left, 120, color.accent)}
      {col(right, 1000, color.cool)}
      <g opacity={reveal(6)}>
        <rect x={460} y={760} width={1000} height={90} rx={45} fill={color.accent} />
        <T x={960} y={805} size={40} weight={900} fill="#FFFFFF">
          警察・運営の正式な発表：なし
        </T>
      </g>
      <Source>出典：両者のXの投稿（10月28〜29日）</Source>
    </Svg>
  );
};

export const DIAGRAMS: Diagrams = { timeline: Timeline, claims: Claims };
