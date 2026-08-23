import { describe, expect, it } from 'vitest';
import { calculatePassRate, isPassingGrade } from '../national-exam.service';

describe('isPassingGrade', () => {
  it('treats every grade from A to E as a pass', () => {
    expect(['A', 'B', 'C', 'D', 'E'].every((grade) => isPassingGrade(grade as 'A'))).toBe(true);
  });

  it('treats F as the only failing grade', () => {
    expect(isPassingGrade('F')).toBe(false);
  });
});

describe('calculatePassRate', () => {
  it('reports the share of published results that passed', () => {
    expect(calculatePassRate(42, 50)).toBe(84);
  });

  it('reports 100 when every candidate passed', () => {
    expect(calculatePassRate(30, 30)).toBe(100);
  });

  it('reports 0 when nobody passed, rather than null', () => {
    expect(calculatePassRate(0, 25)).toBe(0);
  });

  it('is null while no result has been published, so the UI can say "not yet"', () => {
    expect(calculatePassRate(0, 0)).toBeNull();
  });

  it('rounds to two decimals', () => {
    expect(calculatePassRate(1, 3)).toBe(33.33);
  });
});
