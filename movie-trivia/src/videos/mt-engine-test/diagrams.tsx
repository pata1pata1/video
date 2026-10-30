// Diagrams for mt-engine-test only, by the name used in the script (visual.diagram).
// Shared parts: src/diagram-kit.tsx (useSteps, Svg, T, Card). Colors: color.accent / color.cool.
// Example:
//
//   const Example: React.FC<{ steps: StepFrames }> = ({ steps }) => {
//     const { reveal } = useSteps(steps);
//     return (
//       <Svg>
//         <T x={W / 2} y={120} size={52} weight={900}>見出し</T>
//         <g opacity={reveal(2)}>…step 2 で出るもの…</g>
//       </Svg>
//     );
//   };
import { Diagrams } from "../../diagram-kit";

export const DIAGRAMS: Diagrams = {};
