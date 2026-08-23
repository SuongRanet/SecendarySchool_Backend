import { describe, expect, it } from 'vitest';
import { calculateAttendanceRate } from '../attendance.service';

describe('calculateAttendanceRate', () => {
  it('is 100 for a student who was never absent', () => {
    expect(calculateAttendanceRate({ present: 40, late: 0, totalRecords: 40 })).toBe(100);
  });

  it('counts a late arrival as attending', () => {
    expect(calculateAttendanceRate({ present: 35, late: 5, totalRecords: 40 })).toBe(100);
  });

  it('excludes absences from the rate', () => {
    expect(calculateAttendanceRate({ present: 30, late: 0, totalRecords: 40 })).toBe(75);
  });

  it('is 0 for a student who never attended', () => {
    expect(calculateAttendanceRate({ present: 0, late: 0, totalRecords: 40 })).toBe(0);
  });

  it('returns 0 rather than dividing by zero before any register is taken', () => {
    expect(calculateAttendanceRate({ present: 0, late: 0, totalRecords: 0 })).toBe(0);
  });

  it('rounds to two decimals', () => {
    expect(calculateAttendanceRate({ present: 2, late: 0, totalRecords: 3 })).toBe(66.67);
  });

  it('is unaffected by how the remaining records are classified', () => {
    // Excused, unexcused and sick absences all count the same way here.
    expect(calculateAttendanceRate({ present: 18, late: 2, totalRecords: 25 })).toBe(80);
  });
});
