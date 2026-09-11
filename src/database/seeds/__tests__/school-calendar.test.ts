import { describe, expect, it } from 'vitest';
import {
  addDays,
  calendarAround,
  elapsedFraction,
  mondayOf,
  schoolDays,
  shiftYearName,
} from '../school-calendar';

describe('mondayOf', () => {
  it('returns the same day for a Monday', () => {
    expect(mondayOf('2026-08-31')).toBe('2026-08-31');
  });

  it('walks back to Monday from midweek', () => {
    expect(mondayOf('2026-09-02')).toBe('2026-08-31');
  });

  it('treats Sunday as the end of the week it closes, not the start of the next', () => {
    // Getting this wrong shifts a whole term by a week whenever the seed runs
    // on a Sunday, which is exactly the day nobody tests on.
    expect(mondayOf('2026-09-06')).toBe('2026-08-31');
  });
});

describe('schoolDays', () => {
  it('counts weekdays only', () => {
    expect(schoolDays('2026-08-31', '2026-09-06')).toEqual([
      '2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04',
    ]);
  });

  it('stops at the cutoff so a running term has no future register', () => {
    expect(schoolDays('2026-08-31', '2026-12-31', '2026-09-02')).toEqual([
      '2026-08-31', '2026-09-01', '2026-09-02',
    ]);
  });

  it('ignores a cutoff that lies past the end of the range', () => {
    expect(schoolDays('2026-08-31', '2026-09-04', '2027-01-01')).toHaveLength(5);
  });
});

describe('calendarAround', () => {
  const calendar = calendarAround('2026-09-02');

  it('finishes Semester 1 before today', () => {
    expect(calendar.semester1.end < '2026-09-02').toBe(true);
  });

  it('places today inside Semester 2', () => {
    expect(calendar.semester2.start <= '2026-09-02').toBe(true);
    expect(calendar.semester2.end > '2026-09-02').toBe(true);
  });

  it('places today near the middle of Semester 2, past the midterm but short of the final', () => {
    const done = elapsedFraction(calendar.semester2.start, calendar.semester2.end, '2026-09-02');

    expect(done).toBeGreaterThan(0.4);
    expect(done).toBeLessThan(0.6);
  });

  it('starts each semester on a Monday and ends it on a Friday', () => {
    for (const term of [calendar.semester1, calendar.semester2]) {
      expect(mondayOf(term.start)).toBe(term.start);
      expect(addDays(mondayOf(term.end), 4)).toBe(term.end);
    }
  });

  it('leaves a break between the semesters rather than running them together', () => {
    expect(calendar.semester1.end < calendar.semester2.start).toBe(true);
  });

  it('holds whatever day it is run on', () => {
    // The seed has to keep producing the same scenario tomorrow, so the rule is
    // checked across a year of possible run dates rather than just today's.
    for (let offset = 0; offset < 365; offset += 1) {
      const today = addDays('2026-01-01', offset);
      const year = calendarAround(today);
      const done = elapsedFraction(year.semester2.start, year.semester2.end, today);

      expect(year.semester1.end < today).toBe(true);
      expect(done).toBeGreaterThan(0.4);
      expect(done).toBeLessThan(0.6);
    }
  });
});

describe('shiftYearName', () => {
  it('moves both halves back a year', () => {
    expect(shiftYearName('2025 - 2026', 1)).toBe('2024 - 2025');
  });

  it('leaves a name it cannot parse alone', () => {
    expect(shiftYearName('Pilot year', 1)).toBe('Pilot year');
  });
});
