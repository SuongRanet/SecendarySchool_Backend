import { describe, expect, it } from 'vitest';
import { enrollmentStatusForStudentStatus } from '../student.service';

describe('enrollmentStatusForStudentStatus', () => {
  it('closes the enrolment of a student who is made inactive', () => {
    expect(enrollmentStatusForStudentStatus('INACTIVE')).toBe('WITHDRAWN');
  });

  it('closes the enrolment of a withdrawn student', () => {
    expect(enrollmentStatusForStudentStatus('WITHDRAWN')).toBe('WITHDRAWN');
  });

  it('records a transfer rather than a withdrawal when the student transfers out', () => {
    expect(enrollmentStatusForStudentStatus('TRANSFERRED')).toBe('TRANSFERRED');
  });

  it('completes rather than withdraws the enrolment of a graduate', () => {
    expect(enrollmentStatusForStudentStatus('GRADUATED')).toBe('COMPLETED');
  });

  it('leaves the enrolment alone for an active student, because re-enrolling names a class', () => {
    expect(enrollmentStatusForStudentStatus('ACTIVE')).toBeNull();
  });
});
