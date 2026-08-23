import { describe, expect, it } from 'vitest';
import { applyScale } from '../grade.service';
import type { GradeScaleRow } from '../grade.types';

/** The scale the seed installs: A 85–100, B 70–84.99, C 55–69.99, D 40–54.99, F 0–39.99. */
const scales: GradeScaleRow[] = [
  {
    id: 1,
    grading_scheme_id: 1,
    letter_grade: 'A',
    min_score: 85,
    max_score: 100,
    gpa_point: 4,
    performance: 'EXCELLENT',
    remark_en: 'Excellent',
    remark_kh: null,
  },
  {
    id: 2,
    grading_scheme_id: 1,
    letter_grade: 'B',
    min_score: 70,
    max_score: 84.99,
    gpa_point: 3,
    performance: 'GOOD',
    remark_en: 'Good',
    remark_kh: null,
  },
  {
    id: 3,
    grading_scheme_id: 1,
    letter_grade: 'C',
    min_score: 55,
    max_score: 69.99,
    gpa_point: 2,
    performance: 'FAIR',
    remark_en: 'Fair',
    remark_kh: null,
  },
  {
    id: 4,
    grading_scheme_id: 1,
    letter_grade: 'D',
    min_score: 40,
    max_score: 54.99,
    gpa_point: 1,
    performance: 'NEEDS_IMPROVEMENT',
    remark_en: 'Needs improvement',
    remark_kh: null,
  },
  {
    id: 5,
    grading_scheme_id: 1,
    letter_grade: 'F',
    min_score: 0,
    max_score: 39.99,
    gpa_point: 0,
    performance: 'NEEDS_IMPROVEMENT',
    remark_en: 'Fail',
    remark_kh: null,
  },
];

describe('applyScale', () => {
  it('maps a percentage to its letter grade, performance and GPA', () => {
    expect(applyScale(92, scales)).toEqual({
      letterGrade: 'A',
      performance: 'EXCELLENT',
      gpaPoint: 4,
    });

    expect(applyScale(70, scales).letterGrade).toBe('B');
    expect(applyScale(55, scales).letterGrade).toBe('C');
    expect(applyScale(40, scales).letterGrade).toBe('D');
    expect(applyScale(12.5, scales).letterGrade).toBe('F');
  });

  it('treats the band boundaries as inclusive', () => {
    expect(applyScale(85, scales).letterGrade).toBe('A');
    expect(applyScale(84.99, scales).letterGrade).toBe('B');
    expect(applyScale(100, scales).letterGrade).toBe('A');
    expect(applyScale(0, scales).letterGrade).toBe('F');
  });

  it('returns nothing for an ungraded student rather than guessing', () => {
    expect(applyScale(null, scales)).toEqual({
      letterGrade: null,
      performance: null,
      gpaPoint: null,
    });
  });

  it('returns nothing when the percentage falls outside every band', () => {
    expect(applyScale(150, scales).letterGrade).toBeNull();
  });
});
