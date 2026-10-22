// Diagrams for cat-abuse-law only, by the name used in the script (visual.diagram).
// Shared parts: src/diagram-kit.tsx (useSteps, Svg, T, Card). Colors: color.accent / color.cool.
import React from "react";
import { Card, Diagrams, H, StepFrames, Svg, T, useSteps, W } from "../../diagram-kit";
import { color } from "../../theme";

const Heading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <T x={W / 2} y={150} size={56} weight={900}>
    {children}
  </T>
);

const Source: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <T x={W - 80} y={H - 40} size={24} fill={color.inkFaint} anchor="end">
    {children}
  </T>
);

/** Vertical bar growing from the baseline by `p` (0→1). */
const Bar: React.FC<{ x: number; base: number; w: number; h: number; p: number; fill: string }> = ({ x, base, w, h, p, fill }) => (
  <rect x={x - w / 2} y={base - h * p} width={w} height={h * p} rx={8} fill={fill} />
);

// 事件の流れ（犯行期間 → 逮捕 → 初公判 → 判決）。横軸は等間隔
const Timeline: React.FC<{ steps: StepFrames }> = ({ steps }) => {
  const { reveal } = useSteps(steps);
  const y = 470;
  const pts = [
    { x: 330, date: "2016年3月〜2017年4月", name: "猫を虐待", sub: "埼玉県深谷市", step: 1, fill: color.inkSoft },
    { x: 760, date: "2017年8月", name: "逮捕", sub: "警視庁", step: 1, fill: color.cool },
    { x: 1190, date: "11月28日", name: "初公判", sub: "東京地裁", step: 2, fill: color.cool },
    { x: 1600, date: "12月12日", name: "判決", sub: "", step: 2, fill: color.accent },
  ];
  return (
    <Svg>
      <Heading>事件から判決まで</Heading>
      <line x1={200} x2={1720} y1={y} y2={y} stroke={color.line} strokeWidth={6} strokeLinecap="round" />
      {pts.map((p, i) => {
        const o = reveal(p.step, i % 2 ? 8 : 0);
        return (
          <g key={p.name} opacity={o} transform={`translate(0 ${(1 - o) * 20})`}>
            <circle cx={p.x} cy={y} r={i === 3 ? 26 : 18} fill={p.fill} />
            <T x={p.x} y={y - 110} size={34} weight={700} fill={color.inkSoft}>
              {p.date}
            </T>
            <T x={p.x} y={y + 90} size={i === 3 ? 64 : 52} weight={900} fill={i === 3 ? color.accent : color.ink}>
              {p.name}
            </T>
            {p.sub && (
              <T x={p.x} y={y + 160} size={30} fill={color.inkFaint}>
                {p.sub}
              </T>
            )}
          </g>
        );
      })}
      <g opacity={reveal(2, 16)}>
        <T x={1395} y={y - 190} size={34} weight={900} fill={color.accent}>
          逮捕から約4か月
        </T>
      </g>
    </Svg>
  );
};

// 当時の上限：動物愛護法 2年 → 併合罪で 3年 → 3年以下なら執行猶予を付けられる
const Cap: React.FC<{ steps: StepFrames }> = ({ steps }) => {
  const { reveal } = useSteps(steps);
  const base = 720;
  const perYear = 130;
  const yearY = (n: number) => base - n * perYear;
  const bars = [
    { x: 700, years: 2, label: "懲役2年", name: "動物愛護法の上限", sub: "（2019年の改正前）", step: 1, fill: color.cool },
    { x: 1200, years: 3, label: "懲役3年", name: "罪をまとめても", sub: "（上限の1.5倍）", step: 2, fill: color.accent },
  ];
  return (
    <Svg>
      <Heading>当時、刑はどこまで重くできたか</Heading>
      <line x1={380} x2={1560} y1={base} y2={base} stroke={color.line} strokeWidth={4} />
      {[1, 2, 3, 4].map((n) => (
        <T key={n} x={350} y={yearY(n)} size={26} fill={color.inkFaint} anchor="end">
          {n}年
        </T>
      ))}
      <g opacity={reveal(3)}>
        <rect x={400} y={yearY(3)} width={1140} height={3 * perYear} fill={color.accent} opacity={0.08} />
        <line x1={400} x2={1540} y1={yearY(3)} y2={yearY(3)} stroke={color.accent} strokeWidth={4} strokeDasharray="16 12" />
        <T x={1560} y={yearY(3)} size={34} weight={900} fill={color.accent} anchor="start">
          3年
        </T>
        <T x={1560} y={yearY(3) + 50} size={28} weight={700} fill={color.accent} anchor="start">
          ここまでなら
        </T>
        <T x={1560} y={yearY(3) + 90} size={28} weight={700} fill={color.accent} anchor="start">
          執行猶予OK
        </T>
      </g>
      {bars.map((b) => {
        const p = reveal(b.step);
        return (
          <g key={b.name} opacity={Math.min(1, p * 1.5)}>
            <Bar x={b.x} base={base} w={240} h={b.years * perYear} p={p} fill={b.fill} />
            <T x={b.x} y={base - b.years * perYear * p - 44} size={56} weight={900} fill={b.fill}>
              {b.label}
            </T>
            <T x={b.x} y={base + 46} size={36} weight={900}>
              {b.name}
            </T>
            <T x={b.x} y={base + 90} size={26} fill={color.inkSoft}>
              {b.sub}
            </T>
          </g>
        );
      })}
    </Svg>
  );
};

// 2019年改正（2020年6月施行）の罰則：改正前 → 改正後
const Penalty: React.FC<{ steps: StepFrames }> = ({ steps }) => {
  const { reveal } = useSteps(steps);
  const rows = [
    { name: "殺す・傷つける", before: ["懲役2年以下", "罰金200万円以下"], after: ["懲役5年以下", "罰金500万円以下"], step: 2 },
    { name: "虐待・捨てる", before: ["罰金100万円以下", "（懲役なし）"], after: ["懲役1年以下", "罰金100万円以下"], step: 3 },
  ];
  const cx = [300, 860, 1500];
  return (
    <Svg>
      <Heading>改正動物愛護法の罰則（2020年6月から）</Heading>
      <g opacity={reveal(1)}>
        <T x={cx[1]} y={240} size={34} weight={700} fill={color.inkSoft}>
          改正前
        </T>
        <T x={cx[2]} y={240} size={34} weight={900} fill={color.accent}>
          改正後
        </T>
      </g>
      {rows.map((r, i) => {
        const y = 290 + i * 250;
        const o = reveal(r.step);
        return (
          <g key={r.name} opacity={o} transform={`translate(0 ${(1 - o) * 24})`}>
            <Card x={120} y={y} w={1680} h={210} highlight={0} />
            <T x={cx[0]} y={y + 105} size={44} weight={900}>
              {r.name}
            </T>
            <T x={cx[1]} y={y + 75} size={40} weight={700} fill={color.inkSoft}>
              {r.before[0]}
            </T>
            <T x={cx[1]} y={y + 135} size={32} fill={color.inkSoft}>
              {r.before[1]}
            </T>
            <T x={1180} y={y + 105} size={60} weight={900} fill={color.inkFaint}>
              →
            </T>
            <T x={cx[2]} y={y + 75} size={52} weight={900} fill={color.accent}>
              {r.after[0]}
            </T>
            <T x={cx[2]} y={y + 140} size={38} weight={900} fill={color.accent}>
              {r.after[1]}
            </T>
          </g>
        );
      })}
      <Source>環境省「動物の愛護及び管理に関する法律」の改正概要より</Source>
    </Svg>
  );
};

// 「殺す・傷つける」罪の懲役の上限の移り変わり
const History: React.FC<{ steps: StepFrames }> = ({ steps }) => {
  const { reveal } = useSteps(steps);
  const base = 720;
  const perYear = 80;
  const bars = [
    { x: 560, years: 1, when: "2013年8月まで", step: 1, fill: color.inkFaint },
    { x: 960, years: 2, when: "2013年9月から", step: 2, fill: color.cool },
    { x: 1360, years: 5, when: "2020年6月から", step: 2, fill: color.accent },
  ];
  const y3 = base - 3 * perYear;
  return (
    <Svg>
      <Heading>動物を殺す・傷つける罪の上限（懲役）</Heading>
      <line x1={340} x2={1580} y1={base} y2={base} stroke={color.line} strokeWidth={4} />
      <g opacity={reveal(3)}>
        <line x1={340} x2={1580} y1={y3} y2={y3} stroke={color.ink} strokeWidth={3} strokeDasharray="14 12" />
        <T x={1600} y={y3 - 20} size={30} weight={900} anchor="start">
          3年
        </T>
        <T x={1600} y={y3 + 22} size={24} fill={color.inkSoft} anchor="start">
          これを超えると
        </T>
        <T x={1600} y={y3 + 56} size={24} fill={color.inkSoft} anchor="start">
          執行猶予は付かない
        </T>
      </g>
      {bars.map((b, i) => {
        const p = reveal(b.step, i === 2 ? 10 : 0);
        return (
          <g key={b.when} opacity={Math.min(1, p * 1.5)}>
            <Bar x={b.x} base={base} w={220} h={b.years * perYear} p={p} fill={b.fill} />
            <T x={b.x} y={base - b.years * perYear * p - 44} size={i === 2 ? 72 : 56} weight={900} fill={i === 2 ? color.accent : color.ink}>
              {b.years}年
            </T>
            <T x={b.x} y={base + 46} size={32} weight={700} fill={color.inkSoft}>
              {b.when}
            </T>
          </g>
        );
      })}
    </Svg>
  );
};

// 動物虐待事犯の検挙事件数（警察庁、動物愛護管理法第44条違反）
const Arrests: React.FC<{ steps: StepFrames }> = ({ steps }) => {
  const { reveal } = useSteps(steps);
  const base = 720;
  const scale = 2.2; // px per 件
  const data = [
    { y: 2016, n: 62, step: 1 },
    { y: 2017, n: 68, step: 2 },
    { y: 2018, n: 84, step: 2 },
    { y: 2019, n: 105, step: 2 },
    { y: 2020, n: 102, step: 2 },
    { y: 2021, n: 170, step: 2 },
    { y: 2022, n: 166, step: 2 },
    { y: 2023, n: 181, step: 2 },
    { y: 2024, n: 160, step: 3 },
    { y: 2025, n: 172, step: 3 },
  ];
  const label = new Set([2016, 2021, 2023, 2025]);
  const x0 = 330;
  const gap = 140;
  const lawX = x0 + 4 * gap - gap / 2;
  return (
    <Svg>
      <Heading>動物虐待事件の検挙件数</Heading>
      <line x1={x0 - 90} x2={x0 + 9 * gap + 90} y1={base} y2={base} stroke={color.line} strokeWidth={4} />
      <g opacity={reveal(2)}>
        <line x1={lawX} x2={lawX} y1={base} y2={300} stroke={color.inkFaint} strokeWidth={3} strokeDasharray="10 10" />
        <T x={lawX - 16} y={310} size={26} weight={700} fill={color.inkSoft} anchor="end">
          改正法の施行（2020年6月）→
        </T>
      </g>
      {data.map((d, i) => {
        const x = x0 + i * gap;
        const p = reveal(d.step, d.step === 1 ? 0 : (i % 5) * 3);
        const hot = d.y === 2023 || d.y === 2025;
        const fill = d.y === 2016 ? color.cool : hot ? color.accent : color.inkFaint;
        return (
          <g key={d.y} opacity={Math.min(1, p * 1.5)}>
            <Bar x={x} base={base} w={90} h={d.n * scale} p={p} fill={fill} />
            {label.has(d.y) && (
              <T x={x} y={base - d.n * scale * p - 34} size={44} weight={900} fill={d.y === 2016 ? color.cool : hot ? color.accent : color.ink}>
                {d.n}
              </T>
            )}
            <T x={x} y={base + 36} size={26} fill={color.inkSoft}>
              {d.y}
            </T>
          </g>
        );
      })}
      <g opacity={reveal(2, 20)}>
        <T x={x0 + 7 * gap} y={base - 181 * scale - 84} size={28} weight={900} fill={color.accent}>
          過去最多
        </T>
      </g>
      <Source>警察庁「生活経済事犯の検挙状況等について」（件）</Source>
    </Svg>
  );
};

// 動物愛護管理法違反の検察での処理（2024年）
const Prosecution: React.FC<{ steps: StepFrames }> = ({ steps }) => {
  const { reveal } = useSteps(steps);
  const x = 200;
  const w = 1520;
  const y = 340;
  const h = 170;
  const total = 212;
  const parts = [
    { name: "起訴", n: 62, fill: color.accent },
    { name: "不起訴", n: 143, fill: color.cool },
  ];
  const split = reveal(2);
  let cursor = x;
  return (
    <Svg>
      <Heading>動物愛護法違反 検察での処理（2024年）</Heading>
      <g opacity={reveal(1)}>
        <rect x={x} y={y} width={w} height={h} rx={16} fill={color.inkFaint} opacity={1 - split * 0.7} />
        <T x={x + w / 2} y={y + h / 2} size={60} weight={900} fill="#fff" opacity={1 - split}>
          受理 212人
        </T>
      </g>
      {parts.map((pt, i) => {
        const pw = (pt.n / total) * w;
        const px = cursor;
        cursor += pw;
        const o = reveal(2, i * 8);
        return (
          <g key={pt.name} opacity={o}>
            <rect x={px} y={y} width={pw * o} height={h} rx={i === 0 ? 16 : 0} fill={pt.fill} />
            <T x={px + pw / 2} y={y + h / 2} size={56} weight={900} fill="#fff">
              {pt.n}人
            </T>
            <T x={px + pw / 2} y={y + h + 60} size={44} weight={900} fill={pt.fill}>
              {pt.name}
            </T>
          </g>
        );
      })}
      <g opacity={reveal(2, 16)}>
        <T x={W / 2} y={y + h + 160} size={28} fill={color.inkSoft}>
          ※ 残りは翌年への繰り越しなど（受理・起訴・不起訴の合計は一致しないことがあります）
        </T>
      </g>
      <Source>検察統計年報（環境省「動物愛護管理行政事務提要」より）</Source>
    </Svg>
  );
};

export const DIAGRAMS: Diagrams = {
  timeline: Timeline,
  cap: Cap,
  penalty: Penalty,
  history: History,
  arrests: Arrests,
  prosecution: Prosecution,
};
