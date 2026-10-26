// Diagrams for sekisui-jimenshi only, by the name used in the script (visual.diagram).
// Shared parts: src/diagram-kit.tsx (useSteps, Svg, T, Card). Colors: color.accent / color.cool.
// Facts: 積水ハウス 総括検証報告書（2020年12月7日）。
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

/** Arrow from (x1,y1) to (x2,y2), drawn up to `p` (0→1). */
const Arrow: React.FC<{ x1: number; y1: number; x2: number; y2: number; p: number; stroke?: string }> = ({ x1, y1, x2, y2, p, stroke = color.inkSoft }) => {
  const x = x1 + (x2 - x1) * p;
  const y = y1 + (y2 - y1) * p;
  const a = Math.atan2(y2 - y1, x2 - x1);
  const head = 18;
  return (
    <g opacity={p > 0 ? 1 : 0}>
      <line x1={x1} y1={y1} x2={x} y2={y} stroke={stroke} strokeWidth={5} />
      <polygon
        points={`${x},${y} ${x - head * Math.cos(a - 0.45)},${y - head * Math.sin(a - 0.45)} ${x - head * Math.cos(a + 0.45)},${y - head * Math.sin(a + 0.45)}`}
        fill={stroke}
        opacity={p}
      />
    </g>
  );
};

// 地面師グループの役割分担（判決が認定したもの）。step 3 で積水ハウスが会った2人を赤に
const Roles: React.FC<{ steps: StepFrames }> = ({ steps }) => {
  const { reveal } = useSteps(steps);
  const top = { x: W / 2, y: 260 };
  const roles = [
    { x: 330, name: "なりすまし役", sub: "持ち主のふりをする", met: true },
    { x: 750, name: "前さばき役", sub: "ばれないよう立ち回る", met: true },
    { x: 1170, name: "客つけ役", sub: "買い手を探す", met: false },
    { x: 1590, name: "連絡役", sub: "指示・道具の受け渡し", met: false },
  ];
  const y = 590;
  const met = reveal(3);
  return (
    <Svg>
      <Heading>地面師グループの役割分担</Heading>
      <g opacity={reveal(1)}>
        <Card x={top.x - 260} y={top.y - 70} w={520} h={140} />
        <T x={top.x} y={top.y - 18} size={46} weight={900}>
          上位者
        </T>
        <T x={top.x} y={top.y + 34} size={28} fill={color.inkSoft}>
          計画を立て、指示を出す
        </T>
      </g>
      {roles.map((r, i) => {
        const p = reveal(2, i * 5);
        const hot = r.met ? met : 0;
        const dim = r.met ? 1 : 1 - 0.55 * met;
        return (
          <g key={r.name} opacity={p * dim}>
            <line x1={top.x} y1={top.y + 70} x2={r.x} y2={y - 80} stroke={color.line} strokeWidth={4} />
            <Card x={r.x - 190} y={y - 80} w={380} h={160} highlight={hot} />
            <T x={r.x} y={y - 22} size={44} weight={900} fill={hot > 0.5 ? color.accent : color.ink}>
              {r.name}
            </T>
            <T x={r.x} y={y + 34} size={26} fill={color.inkSoft}>
              {r.sub}
            </T>
          </g>
        );
      })}
      <g opacity={met}>
        <path d={`M 140 ${y + 110} H 940`} stroke={color.accent} strokeWidth={4} />
        <T x={540} y={y + 160} size={36} weight={900} fill={color.accent}>
          積水ハウスの社員が会ったのは、この2人だけ
        </T>
      </g>
      <Source>出典：積水ハウス 総括検証報告書（2020年）</Source>
    </Svg>
  );
};

// 取引の形（地主 → 中間の会社 60億円 → 積水ハウス 70億円）と、稟議の飛び越し
const Deal: React.FC<{ steps: StepFrames }> = ({ steps }) => {
  const { reveal } = useSteps(steps);
  const y = 330;
  const nodes = [
    { x: 330, name: "偽の地主", sub: "本物になりすました女", fill: color.accent },
    { x: 960, name: "中間の会社", sub: "転売が目的", fill: color.ink },
    { x: 1590, name: "積水ハウス", sub: "マンション用地として", fill: color.ink },
  ];
  const p1 = reveal(1);
  const p2 = reveal(2);
  return (
    <Svg>
      <Heading>取引の形</Heading>
      {nodes.map((n, i) => (
        <g key={n.name} opacity={reveal(1, i * 8)}>
          <Card x={n.x - 220} y={y - 80} w={440} h={160} />
          <T x={n.x} y={y - 20} size={48} weight={900} fill={n.fill}>
            {n.name}
          </T>
          <T x={n.x} y={y + 38} size={26} fill={color.inkSoft}>
            {n.sub}
          </T>
        </g>
      ))}
      <Arrow x1={560} y1={y} x2={728} y2={y} p={reveal(1, 10)} />
      <Arrow x1={1190} y1={y} x2={1358} y2={y} p={reveal(1, 18)} />
      <g opacity={reveal(1, 14)}>
        <T x={645} y={y - 120} size={52} weight={900} fill={color.cool}>
          60億円
        </T>
      </g>
      <g opacity={reveal(1, 22)}>
        <T x={1275} y={y - 120} size={52} weight={900} fill={color.accent}>
          70億円
        </T>
      </g>
      <g opacity={p2} transform={`translate(0 ${(1 - p2) * 20})`}>
        <T x={W / 2} y={560} size={36} weight={900} fill={color.inkSoft}>
          社内の稟議（購入の承認）
        </T>
        <Card x={300} y={610} w={560} h={130} />
        <T x={580} y={655} size={34} weight={900} fill={color.inkFaint}>
          役員4人の押印
        </T>
        <T x={580} y={705} size={28} fill={color.inkFaint}>
          後回し（契約日以降に押印）
        </T>
        <Arrow x1={880} y1={675} x2={1040} y2={675} p={p2} stroke={color.accent} />
        <Card x={1060} y={610} w={560} h={130} highlight={p2} />
        <T x={1340} y={655} size={34} weight={900} fill={color.accent}>
          社長が先に決裁
        </T>
        <T x={1340} y={705} size={28} fill={color.inkSoft}>
          4月20日
        </T>
      </g>
      <g opacity={p1}>
        <Source>出典：積水ハウス 総括検証報告書（2020年）</Source>
      </g>
    </Svg>
  );
};

// 4月24日の契約から却下まで。step 1 で決済日を7月31日から6月1日へ、step 3 で却下
const Schedule: React.FC<{ steps: StepFrames }> = ({ steps }) => {
  const { reveal, step } = useSteps(steps);
  const y = 420;
  // x for a day counted from April 20
  const day = (m: number, d: number) => {
    const n = (m === 4 ? d : m === 5 ? 30 + d : m === 6 ? 61 + d : m === 7 ? 91 + d : 122 + d) - 20;
    return 260 + n * 14;
  };
  const moved = reveal(1, 10);
  const end = reveal(3);
  return (
    <Svg>
      <Heading>{step >= 3 ? "支払いから却下まで" : "支払いを2か月早めた"}</Heading>
      <line x1={180} x2={1760} y1={y} y2={y} stroke={color.line} strokeWidth={6} strokeLinecap="round" />
      {[
        { m: 5, label: "5月" },
        { m: 6, label: "6月" },
        { m: 7, label: "7月" },
      ].map((t) => (
        <g key={t.label}>
          <line x1={day(t.m, 1)} x2={day(t.m, 1)} y1={y - 14} y2={y + 14} stroke={color.line} strokeWidth={4} />
          <T x={day(t.m, 1)} y={y + 50} size={28} fill={color.inkFaint}>
            {t.label}
          </T>
        </g>
      ))}
      <g opacity={reveal(1)}>
        <circle cx={day(4, 24)} cy={y} r={16} fill={color.inkSoft} />
        <T x={day(4, 24)} y={y - 120} size={30} fill={color.inkSoft}>
          4月24日
        </T>
        <T x={day(4, 24)} y={y - 70} size={36} weight={900}>
          契約・手付金
        </T>
      </g>
      {/* the original settlement date, crossed out once it moves */}
      <g opacity={reveal(1)}>
        <circle cx={day(7, 31)} cy={y} r={16} fill={color.inkFaint} />
        <T x={day(7, 31)} y={y - 120} size={30} fill={color.inkFaint}>
          7月31日
        </T>
        <T x={day(7, 31)} y={y - 70} size={36} weight={900} fill={color.inkFaint}>
          当初の支払日
        </T>
        <line x1={day(7, 31) - 120} x2={day(7, 31) + 120} y1={y - 70} y2={y - 70} stroke={color.accent} strokeWidth={5} opacity={moved} />
      </g>
      <path
        d={`M ${day(7, 31)} ${y + 90} Q ${(day(7, 31) + day(6, 1)) / 2} ${y + 230} ${day(6, 1)} ${y + 90}`}
        fill="none"
        stroke={color.accent}
        strokeWidth={5}
        strokeDasharray="1200"
        strokeDashoffset={1200 * (1 - moved)}
        opacity={1 - end}
      />
      <g opacity={moved * (1 - end)}>
        <T x={(day(7, 31) + day(6, 1)) / 2} y={y + 230} size={34} weight={900} fill={color.accent}>
          約2か月の前倒し
        </T>
      </g>
      <g opacity={moved}>
        <circle cx={day(6, 1)} cy={y} r={22} fill={color.accent} />
        <T x={day(6, 1)} y={y - 120} size={30} fill={color.accent}>
          6月1日
        </T>
        <T x={day(6, 1)} y={y - 70} size={40} weight={900} fill={color.accent}>
          残りの代金を支払い
        </T>
      </g>
      <g opacity={reveal(2) * (1 - end)}>
        <T x={W / 2} y={790} size={36} weight={900} fill={color.cool}>
          弁護士「本人確認に十分な時間を取れないおそれ」
        </T>
      </g>
      <g opacity={end}>
        <circle cx={day(6, 9)} cy={y} r={18} fill={color.cool} />
        <T x={day(6, 9) + 40} y={y + 120} size={36} weight={900} fill={color.cool} anchor="start">
          6月9日 登記の申請が却下
        </T>
        <line x1={day(6, 9)} x2={day(6, 9) + 30} y1={y + 20} y2={y + 100} stroke={color.cool} strokeWidth={4} />
      </g>
      <Source>出典：積水ハウス 総括検証報告書（2020年）</Source>
    </Svg>
  );
};

// 損害額の内訳：支払った約63億円 − 偽の地主が買ったマンションの代金 約7億5千万円 ＝ 約55億5900万円
const Loss: React.FC<{ steps: StepFrames }> = ({ steps }) => {
  const { reveal } = useSteps(steps);
  const left = 260;
  const full = 1400;
  const scale = full / 63.08;
  const y1 = 330;
  const y2 = 560;
  const paid = reveal(1);
  const back = reveal(1, 18);
  const loss = reveal(2);
  return (
    <Svg>
      <Heading>損害額の内訳</Heading>
      <T x={left} y={y1 - 70} size={34} weight={700} fill={color.inkSoft} anchor="start">
        支払った額
      </T>
      <rect x={left} y={y1 - 40} width={full * paid} height={90} fill={color.inkSoft} opacity={0.55} />
      <T x={left + full + 30} y={y1 + 5} size={44} weight={900} anchor="start" opacity={paid}>
        約63億円
      </T>
      <g opacity={back}>
        <rect x={left + 55.58 * scale} y={y1 - 40} width={7.5 * scale} height={90} fill={color.cool} />
        <T x={left + 55.58 * scale + 3.75 * scale} y={y1 + 110} size={30} weight={900} fill={color.cool}>
          約7億5千万円
        </T>
        <T x={left + 55.58 * scale + 3.75 * scale} y={y1 + 150} size={24} fill={color.inkSoft}>
          偽の地主が買ったマンションの代金
        </T>
      </g>
      <T x={left} y={y2 - 70} size={34} weight={700} fill={color.accent} anchor="start" opacity={loss}>
        損害
      </T>
      <rect x={left} y={y2 - 40} width={55.58 * scale * loss} height={90} fill={color.accent} />
      <g opacity={loss}>
        <T x={left + 55.58 * scale / 2} y={y2 + 160} size={72} weight={900} fill={color.accent}>
          約55億5900万円
        </T>
      </g>
      <Source>出典：積水ハウス 総括検証報告書（2020年）</Source>
    </Svg>
  );
};

export const DIAGRAMS: Diagrams = { roles: Roles, deal: Deal, schedule: Schedule, loss: Loss };
