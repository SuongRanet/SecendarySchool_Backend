import { describe, expect, it } from 'vitest';
import { classifyConflicts } from '../schedule.service';
import type { ConflictKind, ScheduleConflict } from '../schedule.types';

const conflict = (kind: ConflictKind, scheduleId: number): ScheduleConflict => ({
  kind,
  scheduleId,
  dayOfWeek: 'MONDAY',
  startTime: '07:30',
  endTime: '08:15',
  className: 'Grade 3A',
  subjectName: 'Mathematics',
  teacherName: 'Sokha Chan',
  roomName: 'Room 12',
  message: `${kind} clash`,
});

describe('classifyConflicts', () => {
  it('treats a teacher clash as blocking', () => {
    const { blocking, warnings } = classifyConflicts([conflict('TEACHER', 1)]);

    expect(blocking).toHaveLength(1);
    expect(warnings).toHaveLength(0);
  });

  it('treats a class clash as blocking', () => {
    const { blocking, warnings } = classifyConflicts([conflict('CLASS', 2)]);

    expect(blocking).toHaveLength(1);
    expect(warnings).toHaveLength(0);
  });

  it('treats a room clash as an overridable warning', () => {
    const { blocking, warnings } = classifyConflicts([conflict('ROOM', 3)]);

    expect(blocking).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].scheduleId).toBe(3);
  });

  it('separates a mixed set without losing or duplicating a conflict', () => {
    const conflicts = [
      conflict('ROOM', 1),
      conflict('TEACHER', 2),
      conflict('ROOM', 3),
      conflict('CLASS', 4),
    ];

    const { blocking, warnings } = classifyConflicts(conflicts);

    expect(blocking.map((row) => row.scheduleId)).toEqual([2, 4]);
    expect(warnings.map((row) => row.scheduleId)).toEqual([1, 3]);
    expect(blocking.length + warnings.length).toBe(conflicts.length);
  });

  it('returns two empty lists for a slot that is free', () => {
    expect(classifyConflicts([])).toEqual({ blocking: [], warnings: [] });
  });

  it('preserves the order the detector reported, so the first message is the earliest clash', () => {
    const { blocking } = classifyConflicts([conflict('CLASS', 9), conflict('TEACHER', 4)]);

    expect(blocking[0].scheduleId).toBe(9);
  });
});
