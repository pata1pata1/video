// Diagrams for fukuda-kazuko only, by the name used in the script (visual.diagram).
// Shared parts: src/diagram-kit.tsx (useSteps, Svg, T, Card). Colors: color.accent / color.cool.
// Facts: 松山地裁判決（1999年5月31日）の報道（毎日新聞）、警察白書（平成12年）、現代ビジネス。
import React from "react";
import { Card, Diagrams, H, StepFrames, Svg, T, useSteps, W } from "../../diagram-kit";
import { color } from "../../theme";

const Heading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <T x={W / 2} y={110} size={56} weight={900}>
    {children}
  </T>
);

const Source: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <T x={W - 80} y={H - 40} size={24} fill={color.inkFaint} anchor="end">
    {children}
  </T>
);

// 逃亡先（判決の報道に出た道府県）と、step 2 で働いた仕事
const Places: React.FC<{ steps: StepFrames }> = ({ steps }) => {
  const { reveal } = useSteps(steps);
  const places = ["石川", "愛知", "千葉", "京都", "島根", "山口", "北海道", "和歌山"];
  const jobs = ["スナックのホステス", "ラブホテルの従業員", "菓子店の店員"];
  const jobsIn = reveal(2);
  return (
    <Svg>
      <Heading>15年近くの逃亡先</Heading>
      {places.map((p, i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        const x = 330 + col * 420;
        const y = 270 + row * 170;
        return (
          <g key={p} opacity={reveal(1, i * 4) * (1 - 0.5 * jobsIn)}>
            <Card x={x - 170} y={y - 60} w={340} h={120} />
            <T x={x} y={y + 18} size={52} weight={900}>
              {p}
            </T>
          </g>
        );
      })}
      <g opacity={reveal(1, 36) * (1 - jobsIn)}>
        <T x={W / 2} y={720} size={48} weight={900} fill={color.accent}>
          ほか、10を超える道府県
        </T>
      </g>
      {jobs.map((j, i) => {
        const x = 400 + i * 560;
        return (
          <g key={j} opacity={reveal(2, i * 6)}>
            <Card x={x - 250} y={640} w={500} h={130} highlight={1} />
            <T x={x} y={722} size={42} weight={900} fill={color.accent}>
              {j}
            </T>
          </g>
        );
      })}
      <Source>出典：松山地裁判決（1999年）の報道</Source>
    </Svg>
  );
};

// 事件から時効までの15年。step 2 で懸賞金、step 3 で逮捕と起訴（時効の11時間前）
const Timeline: React.FC<{ steps: StepFrames }> = ({ steps }) => {
  const { reveal, step } = useSteps(steps);
  const y = 460;
  const left = 220;
  const right = 1700;
  // x for a date between 1982-08-19 and 1997-08-19
  const t0 = Date.UTC(1982, 7, 19);
  const t1 = Date.UTC(1997, 7, 19);
  const at = (yy: number, m: number, d: number) => left + ((Date.UTC(yy, m - 1, d) - t0) / (t1 - t0)) * (right - left);
  const bar = reveal(1);
  const reward = reveal(2);
  const end = reveal(3);
  return (
    <Svg>
      <Heading>{step >= 3 ? "時効の21日前に逮捕" : "時効まで15年"}</Heading>
      <rect x={left} y={y - 10} width={(right - left) * bar} height={20} rx={10} fill={color.line} />
      <g opacity={bar}>
        <circle cx={left} cy={y} r={20} fill={color.inkSoft} />
        <T x={left} y={y - 110} size={30} fill={color.inkSoft}>
          1982年8月19日
        </T>
        <T x={left} y={y - 60} size={40} weight={900}>
          事件
        </T>
        <circle cx={right} cy={y} r={20} fill={color.accent} />
        <T x={right} y={y - 110} size={30} fill={color.accent}>
          1997年8月
        </T>
        <T x={right} y={y - 60} size={40} weight={900} fill={color.accent}>
          時効
        </T>
        <T x={(left + right) / 2} y={y + 80} size={34} fill={color.inkSoft}>
          強盗殺人の公訴時効は15年（当時）
        </T>
      </g>
      <g opacity={reward * (1 - end)}>
        <circle cx={at(1996, 8, 1)} cy={y} r={18} fill={color.cool} />
        <line x1={at(1996, 8, 1)} x2={at(1996, 8, 1)} y1={y + 20} y2={y + 150} stroke={color.cool} strokeWidth={4} />
        <T x={at(1996, 8, 1)} y={y + 200} size={30} fill={color.cool} anchor="end">
          1996年8月
        </T>
        <T x={at(1996, 8, 1)} y={y + 250} size={40} weight={900} fill={color.cool} anchor="end">
          懸賞金の公開（日本で初めての例）
        </T>
      </g>
      <g opacity={end}>
        <circle cx={at(1997, 7, 29)} cy={y} r={20} fill={color.cool} />
        <line x1={at(1997, 7, 29)} x2={at(1997, 7, 29)} y1={y + 20} y2={y + 150} stroke={color.cool} strokeWidth={4} />
        <T x={at(1997, 7, 29)} y={y + 200} size={30} fill={color.cool} anchor="end">
          1997年7月29日
        </T>
        <T x={at(1997, 7, 29)} y={y + 250} size={42} weight={900} fill={color.cool} anchor="end">
          福井市で逮捕（逃亡14年11か月10日）
        </T>
        <T x={right} y={y + 330} size={30} fill={color.accent} anchor="end">
          1997年8月18日
        </T>
        <T x={right} y={y + 380} size={42} weight={900} fill={color.accent} anchor="end">
          起訴 ― 時効の11時間前
        </T>
      </g>
      <Source>出典：警察白書（平成12年）、松山地裁判決の報道、現代ビジネス</Source>
    </Svg>
  );
};

export const DIAGRAMS: Diagrams = { places: Places, timeline: Timeline };
