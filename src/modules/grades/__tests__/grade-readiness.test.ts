import { describe, expect, it } from 'vitest';
import { computeWeightedPercentage } from '../grade.service';

/**
 * A term with nothing recorded must not look like a term where everyone scored
 * nothing. These pin the boundary the generation guard relies on.
 */
const components = [
  { assessment_type: 'HOMEWORK', weight_percent: 10 },
  { assessment_type: 'QUIZ', weight_percent: 20 },
  { assessment_type: 'MIDTERM', weight_percent: 30 },
  { assessment_type: 'FINAL', weight_percent: 40 },
] as never as Parameters<typeof computeWeightedPercentage>[0];

describe('an unassessed subject', () => {
  it('has no percentage at all, rather than a percentage of zero', () => {
    expect(computeWeightedPercentage(components, []).percentage).toBeNull();
  });

  it('still reports every component, so the teacher sees what is missing', () => {
    const { breakdown } = computeWeightedPercentage(components, []);

    expect(breakdown).toHaveLength(4);
    expect(breakdown.every((row) => row.percent === null)).toBe(true);
  });

  it('separates a student who sat nothing from one who scored nothing', () => {
    const satNothing = computeWeightedPercentage(components, []);
    const scoredNothing = computeWeightedPercentage(components, [
      { type: 'QUIZ', earned: 0, possible: 50 },
    ]);

    expect(satNothing.percentage).toBeNull();
    expect(scoredNothing.percentage).toBe(0);
  });

  it('grades on the work actually marked when only part of the term is done', () => {
    // Only the quiz has happened: a full mark is 100, not 20 out of a whole term.
    const result = computeWeightedPercentage(components, [
      { type: 'QUIZ', earned: 50, possible: 50 },
    ]);

    expect(result.percentage).toBe(100);
  });
});
