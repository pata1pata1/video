// Diagrams for gyudon-price only, by the name used in the script (visual.diagram).
// Shared parts: src/diagram-kit.tsx (useSteps, Svg, T, Card). Colors: color.accent / color.cool.
import React from "react";
import { Card, Diagrams, H, StepFrames, Svg, T, useSteps, W } from "../../diagram-kit";
import { color } from "../../theme";

const Heading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <T x={W / 2} y={150} size={56} weight={900}>
    {children}
  </T>
);

/** Vertical bar growing from the baseline by `p` (0→1). */
const Bar: React.FC<{ x: number; base: number; w: number; h: number; p: number; fill: string }> = ({ x, base, w, h, p, fill }) => (
  <rect x={x - w / 2} y={base - h * p} width={w} height={h * p} rx={10} fill={fill} />
);

// 大手3社の牛丼並盛（税込み・店内）
const Rivals: React.FC<{ steps: StepFrames }> = ({ steps }) => {
  const { reveal } = useSteps(steps);
  const base = 780;
  const scale = 0.9; // px per 円
  const bars = [
    { name: "松屋", sub: "牛めし並盛（10/13〜）", yen: 480, step: 1, fill: color.accent },
    { name: "すき家", sub: "牛丼並盛（2026/7〜）", yen: 480, step: 2, fill: color.cool },
    { name: "吉野家", sub: "牛丼並盛（店内）", yen: 498, step: 3, fill: color.cool },
  ];
  const line500 = base - 500 * scale;
  return (
    <Svg>
      <Heading>大手3社の牛丼 並盛（税込み）</Heading>
      <line x1={360} x2={1560} y1={base} y2={base} stroke={color.line} strokeWidth={4} />
      <g opacity={reveal(3)}>
        <line x1={360} x2={1560} y1={line500} y2={line500} stroke={color.inkFaint} strokeWidth={3} strokeDasharray="14 12" />
        <T x={1580} y={line500} size={34} fill={color.inkSoft} anchor="start">
          500円
        </T>
      </g>
      {bars.map((b, i) => {
        const x = 560 + i * 400;
        const p = reveal(b.step);
        return (
          <g key={b.name} opacity={Math.min(1, p * 1.5)}>
            <Bar x={x} base={base} w={220} h={b.yen * scale} p={p} fill={b.fill} />
            <T x={x} y={base - b.yen * scale * p - 50} size={64} weight={900} fill={b.fill}>
              {b.yen}円
            </T>
            <T x={x} y={base + 50} size={44} weight={900}>
              {b.name}
            </T>
            <T x={x} y={base + 100} size={28} fill={color.inkSoft}>
              {b.sub}
            </T>
          </g>
        );
      })}
    </Svg>
  );
};

// 松屋 牛めし並盛の値段の移り変わり（公式発表のある改定のみ。横軸は等間隔）
const History: React.FC<{ steps: StepFrames }> = ({ steps }) => {
  const { reveal } = useSteps(steps);
  const base = 760;
  const yenY = (yen: number) => base - (yen - 200) * 1.6;
  const xs = [360, 1000, 1300, 1600];
  const pts = [
    { yen: 280, label: "280円", note: "2012年1月", sub: "320円から値下げ", step: 1 },
    { yen: 430, label: "430円", note: "2024年7月", sub: "400円から", step: 2 },
    { yen: 460, label: "460円", note: "2025年4月", sub: "", step: 3 },
    { yen: 480, label: "480円", note: "2026年10月", sub: "", step: 3 },
  ];
  return (
    <Svg>
      <Heading>松屋 牛めし並盛の値段</Heading>
      <line x1={260} x2={1700} y1={base} y2={base} stroke={color.line} strokeWidth={4} />
      <g opacity={reveal(2)}>
        <line x1={xs[0]} y1={yenY(280)} x2={xs[1]} y2={yenY(430)} stroke={color.inkFaint} strokeWidth={4} strokeDasharray="12 12" />
        <T x={(xs[0] + xs[1]) / 2} y={base - 60} size={30} fill={color.inkSoft}>
          約12年かけて少しずつ値上げ
        </T>
      </g>
      <g opacity={reveal(3)}>
        <polyline points={[1, 2, 3].map((i) => `${xs[i]},${yenY(pts[i].yen)}`).join(" ")} fill="none" stroke={color.accent} strokeWidth={6} />
      </g>
      {pts.map((p, i) => {
        const last = i === 3;
        const o = reveal(p.step, last ? 12 : 0);
        return (
          <g key={i} opacity={o}>
            <line x1={xs[i]} x2={xs[i]} y1={yenY(p.yen)} y2={base} stroke={color.line} strokeWidth={2} strokeDasharray="4 8" />
            <circle cx={xs[i]} cy={yenY(p.yen)} r={last ? 18 : 12} fill={last ? color.accent : i === 0 ? color.cool : color.ink} />
            <T x={xs[i]} y={yenY(p.yen) - 50} size={last ? 60 : 44} weight={900} fill={last ? color.accent : i === 0 ? color.cool : color.ink}>
              {p.label}
            </T>
            <T x={xs[i]} y={base + 40} size={30} weight={700} fill={color.inkSoft}>
              {p.note}
            </T>
            {p.sub && (
              <T x={xs[i]} y={base + 80} size={26} fill={color.inkFaint}>
                {p.sub}
              </T>
            )}
          </g>
        );
      })}
    </Svg>
  );
};

// 売上を100としたときの内訳（松屋フーズHD 2026年3月期）→ 480円に当てはめる
const Breakdown: React.FC<{ steps: StepFrames }> = ({ steps }) => {
  const { reveal, step } = useSteps(steps);
  const x = 210;
  const w = 1500;
  const y = 330;
  const h = 170;
  const parts = [
    { name: "原価", pct: 36.8, yen: 177, step: 1, fill: color.cool },
    { name: "人件費", pct: 29.6, yen: 142, step: 2, fill: "#5B8FC7" },
    { name: "その他の経費", pct: 29.5, yen: 142, step: 2, fill: "#8DB1DA" },
    { name: "利益", pct: 4.1, yen: 20, step: 3, fill: color.accent },
  ];
  const yen = step >= 4;
  let cx = x;
  return (
    <Svg>
      <Heading>{yen ? "牛めし480円に当てはめると（目安）" : "売上を100とすると"}</Heading>
      <rect x={x} y={y} width={w} height={h} rx={16} fill={color.card} stroke={color.line} strokeWidth={3} />
      {parts.map((p) => {
        const pw = (p.pct / 100) * w;
        const left = cx;
        cx += pw;
        const o = reveal(p.step);
        const profit = p.name === "利益";
        const mid = left + pw / 2;
        return (
          <g key={p.name} opacity={o}>
            <rect x={left} y={y} width={pw * o} height={h} fill={p.fill} />
            {profit ? (
              <>
                <line x1={mid} x2={mid} y1={y + h} y2={y + h + 70} stroke={color.accent} strokeWidth={4} />
                <T x={mid - 20} y={y + h + 140} size={44} weight={900} fill={color.accent} anchor="end">
                  {p.name}
                </T>
                <T x={mid - 20} y={y + h + 225} size={84} weight={900} fill={color.accent} anchor="end">
                  {yen ? `約${p.yen}円` : p.pct}
                </T>
              </>
            ) : (
              <>
                <T x={mid} y={y + h / 2} size={40} weight={900} fill="#FFFFFF">
                  {p.name}
                </T>
                <T x={mid} y={y + h + 70} size={60} weight={900} fill={p.fill === "#8DB1DA" ? "#5B8FC7" : p.fill}>
                  {yen ? `約${p.yen}円` : p.pct}
                </T>
              </>
            )}
          </g>
        );
      })}
      <T x={W / 2} y={H - 60} size={28} fill={color.inkSoft}>
        松屋フーズHD 2026年3月期決算（売上高1844億円）の比率。会社全体の数字を当てはめた目安
      </T>
    </Svg>
  );
};

// アメリカ産の冷凍牛肉の輸入量（2026年7月・前年同月=100）
const Imports: React.FC<{ steps: StepFrames }> = ({ steps }) => {
  const { reveal } = useSteps(steps);
  const base = 740;
  const scale = 4.2;
  const bars = [
    { name: "2025年7月", v: 100, label: "100", step: 1, fill: color.inkFaint },
    { name: "2026年7月", v: 79.4, label: "79.4", step: 2, fill: color.accent },
  ];
  return (
    <Svg>
      <Heading>アメリカ産の冷凍牛肉 輸入量</Heading>
      <line x1={500} x2={1420} y1={base} y2={base} stroke={color.line} strokeWidth={4} />
      {bars.map((b, i) => {
        const x = 720 + i * 480;
        const p = reveal(b.step);
        return (
          <g key={b.name} opacity={Math.min(1, p * 1.5)}>
            <Bar x={x} base={base} w={260} h={b.v * scale} p={p} fill={b.fill} />
            <T x={x} y={base - b.v * scale * p - 50} size={72} weight={900} fill={i === 1 ? color.accent : color.ink}>
              {b.label}
            </T>
            <T x={x} y={base + 50} size={40} weight={900}>
              {b.name}
            </T>
          </g>
        );
      })}
      <g opacity={reveal(2, 10)}>
        <T x={1440} y={base - 79.4 * scale - 140} size={44} weight={900} fill={color.accent} anchor="start">
          約2割減
        </T>
      </g>
      <T x={W / 2} y={H - 60} size={28} fill={color.inkSoft}>
        前年同月を100とした値。出典：JA全農ミートフーズ「牛肉 情勢」（2026年7月実績）
      </T>
    </Svg>
  );
};

// 人件費：最低賃金と松屋フーズの人件費
const Labor: React.FC<{ steps: StepFrames }> = ({ steps }) => {
  const { reveal } = useSteps(steps);
  const left = 140;
  const cw = 760;
  const right = W - 140 - cw;
  const top = 240;
  const ch = 520;
  const base = top + ch - 90;
  return (
    <Svg>
      <Heading>上がり続ける人件費</Heading>
      <g opacity={reveal(1)}>
        <Card x={left} y={top} w={cw} h={ch} />
        <T x={left + cw / 2} y={top + 70} size={40} weight={900}>
          最低賃金（全国平均・2026年度）
        </T>
        <T x={left + cw / 2} y={top + 230} size={130} weight={900} fill={color.cool}>
          1177円
        </T>
        <g opacity={reveal(2)}>
          <T x={left + cw / 2} y={top + 380} size={64} weight={900} fill={color.accent}>
            前の年から ＋56円
          </T>
          <T x={left + cw / 2} y={top + 460} size={28} fill={color.inkSoft}>
            10月1日から12月2日にかけて各地で発効
          </T>
        </g>
      </g>
      <g opacity={reveal(3)}>
        <Card x={right} y={top} w={cw} h={ch} />
        <T x={right + cw / 2} y={top + 70} size={40} weight={900}>
          松屋フーズHDの人件費
        </T>
        {[
          { label: "2025年3月期", v: 475, fill: color.inkFaint },
          { label: "2026年3月期", v: 545, fill: color.accent },
        ].map((b, i) => {
          const x = right + 230 + i * 300;
          const p = reveal(3, i * 8);
          return (
            <g key={b.label}>
              <Bar x={x} base={base} w={170} h={b.v * 0.4} p={p} fill={b.fill} />
              <T x={x} y={base - b.v * 0.4 * p - 40} size={50} weight={900} fill={i ? color.accent : color.ink}>
                {b.v}億円
              </T>
              <T x={x} y={base + 40} size={28} fill={color.inkSoft}>
                {b.label}
              </T>
            </g>
          );
        })}
      </g>
    </Svg>
  );
};

// 既存店の前年比（2026年3月期）
const Sales: React.FC<{ steps: StepFrames }> = ({ steps }) => {
  const { reveal } = useSteps(steps);
  const items = [
    { name: "売上", v: "＋10.5%", step: 1, fill: color.ink },
    { name: "お客さんの数", v: "＋1.2%", step: 2, fill: color.cool },
    { name: "一人あたりの支払い", v: "＋9.2%", step: 2, fill: color.accent },
  ];
  const cw = 500;
  const gap = 60;
  const x0 = (W - (cw * 3 + gap * 2)) / 2;
  return (
    <Svg>
      <Heading>松屋フーズ 既存店の前年比（2026年3月期）</Heading>
      {items.map((it, i) => {
        const o = reveal(it.step, i === 2 ? 10 : 0);
        const x = x0 + i * (cw + gap);
        return (
          <g key={it.name} opacity={o} transform={`translate(0 ${(1 - o) * 30})`}>
            <Card x={x} y={260} w={cw} h={400} highlight={i === 2 ? 1 : 0} />
            <T x={x + cw / 2} y={350} size={42} weight={900}>
              {it.name}
            </T>
            <T x={x + cw / 2} y={500} size={110} weight={900} fill={it.fill}>
              {it.v}
            </T>
          </g>
        );
      })}
    </Svg>
  );
};

export const DIAGRAMS: Diagrams = {
  rivals: Rivals,
  history: History,
  breakdown: Breakdown,
  imports: Imports,
  labor: Labor,
  sales: Sales,
};
