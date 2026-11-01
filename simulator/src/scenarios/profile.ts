export const DEVIATION_START = 0.55;
export function deviationProgress(progress: number): number {
  return Math.max(0, (progress - DEVIATION_START) / (1 - DEVIATION_START));
}
export function approach(
  previous: number,
  target: number,
  noise: number,
  rng: () => number,
): number {
  return previous + (target - previous) * 0.25 + (rng() - 0.5) * noise;
}
