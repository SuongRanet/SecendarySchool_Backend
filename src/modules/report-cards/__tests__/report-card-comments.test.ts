import { describe, expect, it } from 'vitest';
import { narrowComments } from '../report-card.service';
import { AppError } from '../../../utils/app-error';

/**
 * A report card carries three signatures. Keeping each writer to their own line
 * is what stops a homeroom teacher overwriting the principal's remark, so the
 * rule is pinned here rather than left to the interface to enforce.
 */
const OFFICE = { isOffice: true, isHomeroomTeacher: false };
const HOMEROOM = { isOffice: false, isHomeroomTeacher: true };
const OTHER_TEACHER = { isOffice: false, isHomeroomTeacher: false };

describe('narrowComments', () => {
  it('lets the office write every comment', () => {
    const input = {
      teacherComment: 'Subject remark',
      homeroomComment: 'Homeroom remark',
      principalComment: 'Principal remark',
    };

    expect(narrowComments(OFFICE, input)).toEqual(input);
  });

  it('lets the office edit the subject remarks', () => {
    const input = { subjectComments: [{ subjectId: 4, comment: 'Improving' }] };

    expect(narrowComments(OFFICE, input)).toEqual(input);
  });

  it('keeps a homeroom teacher to the homeroom comment', () => {
    const result = narrowComments(HOMEROOM, {
      teacherComment: 'Not mine to write',
      homeroomComment: 'Works hard and helps others',
      principalComment: 'Nor this',
      subjectComments: [{ subjectId: 4, comment: 'Nor this' }],
    });

    expect(result).toEqual({ homeroomComment: 'Works hard and helps others' });
  });

  it('lets a homeroom teacher clear their own comment', () => {
    expect(narrowComments(HOMEROOM, { homeroomComment: null })).toEqual({
      homeroomComment: null,
    });
  });

  it('refuses a homeroom teacher who sends only comments they do not own', () => {
    expect(() => narrowComments(HOMEROOM, { principalComment: 'Mine now' })).toThrow(AppError);
  });

  it('refuses a teacher who is not the homeroom teacher of the class', () => {
    expect(() =>
      narrowComments(OTHER_TEACHER, { homeroomComment: 'Not my class' }),
    ).toThrow(AppError);
  });
});
