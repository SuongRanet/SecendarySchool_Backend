import { describe, expect, it } from 'vitest';
import { computeWeightedPercentage } from '../grade.service';
import type { GradingComponentRow } from '../grade.types';

const component = (
  assessmentType: GradingComponentRow['assessment_type'],
  weightPercent: number,
  id = 1,
): GradingComponentRow => ({
  id,
  grading_scheme_id: 1,
  assessment_type: assessmentType,
  weight_percent: weightPercent,
});

/** The default scheme from the seed: Homework 10, Quiz 20, Midterm 30, Final 40. */
const defaultScheme: GradingComponentRow[] = [
  component('HOMEWORK', 10, 1),
  component('QUIZ', 20, 2),
  component('MIDTERM', 30, 3),
  component('FINAL', 40, 4),
];

describe('computeWeightedPercentage', () => {
  it('weights each component by its share of the scheme', () => {
    const { percentage } = computeWeightedPercentage(defaultScheme, [
      { type: 'HOMEWORK', earned: 100, possible: 100 },
      { type: 'QUIZ', earned: 80, possible: 100 },
      { type: 'MIDTERM', earned: 90, possible: 100 },
      { type: 'FINAL', earned: 70, possible: 100 },
    ]);

    // 100*0.1 + 80*0.2 + 90*0.3 + 70*0.4 = 81
    expect(percentage).toBe(81);
  });

  it('returns a full marks percentage of exactly 100', () => {
    const { percentage } = computeWeightedPercentage(defaultScheme, [
      { type: 'HOMEWORK', earned: 20, possible: 20 },
      { type: 'QUIZ', earned: 50, possible: 50 },
      { type: 'MIDTERM', earned: 100, possible: 100 },
      { type: 'FINAL', earned: 100, possible: 100 },
    ]);

    expect(percentage).toBe(100);
  });

  it('rescales to the work actually marked so far', () => {
    // Only homework and quizzes exist yet: 30 of the 100 weight points are in play.
    const { percentage } = computeWeightedPercentage(defaultScheme, [
      { type: 'HOMEWORK', earned: 90, possible: 100 },
      { type: 'QUIZ', earned: 60, possible: 100 },
    ]);

    // (90*0.1 + 60*0.2) / 0.30 = 70
    expect(percentage).toBe(70);
  });

  it('returns null when nothing has been marked at all', () => {
    const { percentage } = computeWeightedPercentage(defaultScheme, []);

    expect(percentage).toBeNull();
  });

  it('treats a component with a zero possible score as unmarked rather than a zero', () => {
    const { percentage, breakdown } = computeWeightedPercentage(defaultScheme, [
      { type: 'HOMEWORK', earned: 0, possible: 0 },
      { type: 'FINAL', earned: 50, possible: 100 },
    ]);

    expect(percentage).toBe(50);
    expect(breakdown.find((row) => row.assessmentType === 'HOMEWORK')?.percent).toBeNull();
  });

  it('counts a genuine zero score against the student', () => {
    const { percentage } = computeWeightedPercentage(defaultScheme, [
      { type: 'HOMEWORK', earned: 0, possible: 100 },
      { type: 'FINAL', earned: 100, possible: 100 },
    ]);

    // (0*0.1 + 100*0.4) / 0.50 = 80
    expect(percentage).toBe(80);
  });

  it('reports one breakdown row per component, marked or not', () => {
    const { breakdown } = computeWeightedPercentage(defaultScheme, [
      { type: 'QUIZ', earned: 45, possible: 50 },
    ]);

    expect(breakdown).toHaveLength(4);
    expect(breakdown.map((row) => row.assessmentType)).toEqual([
      'HOMEWORK',
      'QUIZ',
      'MIDTERM',
      'FINAL',
    ]);
    expect(breakdown[1]).toMatchObject({
      assessmentType: 'QUIZ',
      weightPercent: 20,
      earned: 45,
      possible: 50,
      percent: 90,
      weighted: 18,
    });
  });

  it('ignores an aggregate for a type the scheme does not weight', () => {
    const { percentage } = computeWeightedPercentage([component('FINAL', 100)], [
      { type: 'FINAL', earned: 60, possible: 100 },
      { type: 'PROJECT', earned: 0, possible: 100 },
    ]);

    expect(percentage).toBe(60);
  });

  it('rounds to two decimals rather than leaking floating point noise', () => {
    const { percentage } = computeWeightedPercentage([component('FINAL', 100)], [
      { type: 'FINAL', earned: 2, possible: 3 },
    ]);

    expect(percentage).toBe(66.67);
  });

  it('returns null when the scheme has no components configured', () => {
    const { percentage, breakdown } = computeWeightedPercentage([], [
      { type: 'FINAL', earned: 60, possible: 100 },
    ]);

    expect(percentage).toBeNull();
    expect(breakdown).toEqual([]);
  });
});
