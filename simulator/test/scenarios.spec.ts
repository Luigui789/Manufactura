import { describe, expect, it } from 'vitest';
import { createScenario, DEVIATION_START } from '../src/scenarios/index.js';
import type { Process, Scenario } from '../src/config.js';

function sequence(process: Process, scenario: Scenario, seed = 42, samples = 60) {
  const next = createScenario({ process, scenario, seed, samples });
  return Array.from({ length: samples }, () => next());
}
describe.each(['bar', 'liquid'] as const)('%s temporal profiles', (process) => {
  it.each(['normal', 'deviation'] as const)(
    '%s is deterministic, finite, canonical and rounded',
    (scenario) => {
      const result = sequence(process, scenario);
      expect(result).toEqual(sequence(process, scenario));
      expect(result).not.toEqual(sequence(process, scenario, 43));
      const expected =
        process === 'bar'
          ? [
              ['TEMPERATURE', '°C'],
              ['HUMIDITY', '%'],
            ]
          : [
              ['TEMPERATURE', '°C'],
              ['PH', 'pH'],
              ['TANK_LEVEL', '%'],
              ['MIXER_RPM', 'RPM'],
            ];
      for (const metrics of result) {
        expect(metrics.map(({ metric, unit }) => [metric, unit])).toEqual(expected);
        expect(new Set(metrics.map((m) => m.metric)).size).toBe(metrics.length);
        for (const metric of metrics) {
          expect(Object.keys(metric).sort()).toEqual(['metric', 'unit', 'value']);
          expect(Number.isFinite(metric.value)).toBe(true);
          expect(metric.value).toBe(Number(metric.value.toFixed(2)));
          if (metric.metric === 'TANK_LEVEL') {
            expect(metric.value).toBeGreaterThanOrEqual(0);
            expect(metric.value).toBeLessThanOrEqual(100);
          }
        }
      }
    },
  );
  it('normal remains stable and adjacent samples remain continuous', () => {
    const result = sequence(process, 'normal');
    for (let i = 1; i < result.length; i++) {
      for (let j = 0; j < result[i].length; j++) {
        expect(Math.abs(result[i][j].value - result[i - 1][j].value)).toBeLessThan(j === 3 ? 4 : 1);
      }
    }
    const temps = result.map((m) => m[0].value);
    expect(Math.max(...temps) - Math.min(...temps)).toBeLessThan(1);
    if (process === 'liquid') expect(result.at(-1)![2].value).toBeLessThan(result[0][2].value - 20);
  });
  it('deviation shares the normal prefix and then rises progressively', () => {
    const normal = sequence(process, 'normal');
    const deviation = sequence(process, 'deviation');
    const prefix = Math.floor(DEVIATION_START * 59) + 1;
    expect(deviation.slice(0, prefix)).toEqual(normal.slice(0, prefix));
    expect(deviation.at(-1)![0].value).toBeGreaterThan(normal.at(-1)![0].value + 9);
    expect(deviation.at(-1)![1].value).toBeGreaterThan(
      normal.at(-1)![1].value + (process === 'bar' ? 15 : 1),
    );
    expect(deviation.at(-1)![0].value).toBeGreaterThan(deviation[45][0].value);
  });
  it('one sample and zero seed remain finite and deterministic', () => {
    expect(sequence(process, 'deviation', 0, 1)).toEqual(sequence(process, 'normal', 0, 1));
  });
});
