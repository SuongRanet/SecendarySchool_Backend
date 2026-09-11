import { withTransaction } from '../../database/connection';
import type { Queryable } from '../../database/connection';
import type { AuditContext, PaginatedResult, PaginationParams, SortParams } from '../../types';
import { AppError } from '../../utils/app-error';
import * as auditService from '../audit/audit.service';
import * as academicYearRepository from '../academic-years/academic-year.repository';
import * as classRepository from '../classes/class.repository';
import * as studentRepository from '../students/student.repository';
import * as repository from './enrollment.repository';
import type { EnrollmentSortColumn } from './enrollment.repository';
import type {
  CreateEnrollmentInput,
  EnrollmentDto,
  EnrollmentFilters,
  EnrollmentRow,
  PromotionInput,
  PromotionResult,
  TransferEnrollmentInput,
  WithdrawEnrollmentInput,
} from './enrollment.types';

const toDto = (row: EnrollmentRow): EnrollmentDto => ({
  id: row.id,
  studentId: row.student_id,
  studentCode: row.student_code ?? '',
  studentName: `${row.student_first_name ?? ''} ${row.student_last_name ?? ''}`.trim(),
  studentPhoto: row.student_photo ?? null,
  academicYearId: row.academic_year_id,
  academicYearName: row.academic_year_name ?? '',
  classId: row.class_id,
  className: row.class_name ?? '',
  classCode: row.class_code ?? '',
  gradeLevelId: row.grade_level_id ?? 0,
  gradeLevelName: row.grade_level_name ?? '',
  rollNumber: row.roll_number,
  enrolledDate: row.enrolled_date,
  endDate: row.end_date,
  status: row.status,
  transferredFrom: row.transferred_from,
  remarks: row.remarks,
  createdAt: row.created_at,
});

/**
 * Validates that a class can accept another student: it must exist, belong to the
 * given academic year, be open, and still have a free seat.
 */
/**
 * An enrollment may not be closed before the day it started. The database
 * enforces this too, but a raw constraint violation reaches the client as an
 * unhelpful "a value violates a data rule", so it is caught here first.
 */
export const assertNotBeforeStart = (
  endDate: string | null | undefined,
  enrolledDate: string,
): void => {
  if (endDate && endDate < enrolledDate) {
    throw AppError.badRequest(
      `The end date cannot be earlier than the enrolment date (${enrolledDate})`,
      'ENROLLMENT_END_BEFORE_START',
    );
  }
};

const assertClassAcceptsStudent = async (
  classId: number,
  academicYearId: number,
  executor?: Queryable,
): Promise<void> => {
  const classRow = await classRepository.findClassById(classId, executor);

  if (!classRow) {
    throw AppError.badRequest('The selected class does not exist', 'CLASS_NOT_FOUND');
  }

  if (classRow.academic_year_id !== academicYearId) {
    throw AppError.badRequest(
      'The selected class does not belong to the selected academic year',
      'CLASS_YEAR_MISMATCH',
    );
  }

  if (classRow.academic_year_status === 'CLOSED') {
    throw AppError.conflict(
      'The academic year of this class is closed',
      'ACADEMIC_YEAR_CLOSED',
    );
  }

  const enrolled = await classRepository.countActiveEnrollments(classId, executor);

  if (enrolled >= classRow.capacity) {
    throw AppError.conflict(
      `Class ${classRow.name} is full (${enrolled}/${classRow.capacity})`,
      'CLASS_FULL',
    );
  }
};

export const list = async (
  filters: EnrollmentFilters,
  pagination: PaginationParams,
  sort: SortParams<EnrollmentSortColumn>,
): Promise<PaginatedResult<EnrollmentDto>> => {
  const result = await repository.findEnrollments(filters, pagination, sort);

  return { rows: result.rows.map(toDto), total: result.total };
};

export const getById = async (id: number): Promise<EnrollmentDto> => {
  const row = await repository.findEnrollmentById(id);

  if (!row) {
    throw AppError.notFound('Enrollment not found', 'ENROLLMENT_NOT_FOUND');
  }

  return toDto(row);
};

export const listByStudent = async (studentId: number): Promise<EnrollmentDto[]> => {
  const rows = await repository.findEnrollmentsByStudent(studentId);
  return rows.map(toDto);
};

export const getCurrentForStudent = async (studentId: number): Promise<EnrollmentDto | null> => {
  const row = await repository.findCurrentEnrollment(studentId);
  return row ? toDto(row) : null;
};

/**
 * Enrolls a student into a class for an academic year. A student may hold only one
 * active enrollment per year; previous years stay untouched as history.
 */
export const create = async (
  input: CreateEnrollmentInput,
  context: AuditContext,
  executor?: Queryable,
): Promise<EnrollmentDto> => {
  const student = await studentRepository.findStudentById(input.studentId, executor);

  if (!student) {
    throw AppError.badRequest('The selected student does not exist', 'STUDENT_NOT_FOUND');
  }

  const year = await academicYearRepository.findAcademicYearById(input.academicYearId, executor);

  if (!year) {
    throw AppError.badRequest('The selected academic year does not exist', 'ACADEMIC_YEAR_NOT_FOUND');
  }

  if (year.status === 'CLOSED') {
    throw AppError.conflict(
      `Academic year ${year.name} is closed and cannot accept new enrollments`,
      'ACADEMIC_YEAR_CLOSED',
    );
  }

  const existing = await repository.findActiveEnrollment(
    input.studentId,
    input.academicYearId,
    executor,
  );

  if (existing) {
    throw AppError.conflict(
      `${student.first_name_en} ${student.last_name_en} is already enrolled in ${existing.class_name} for ${year.name}`,
      'STUDENT_ALREADY_ENROLLED',
    );
  }

  await assertClassAcceptsStudent(input.classId, input.academicYearId, executor);

  const run = async (client: Queryable): Promise<EnrollmentRow> => {
    const row = await repository.insertEnrollment(
      { ...input, createdBy: context.userId },
      client,
    );

    // A student who returns from withdrawal becomes active again on enrollment.
    if (student.status !== 'ACTIVE') {
      await studentRepository.updateStudent(input.studentId, { status: 'ACTIVE' }, client);
    }

    await auditService.record(
      {
        userId: context.userId,
        action: 'CREATE',
        entityType: 'enrollment',
        entityId: row.id,
        description: `Enrolled ${student.first_name_en} ${student.last_name_en} into ${row.class_name} for ${year.name}`,
        newValue: {
          studentId: input.studentId,
          classId: input.classId,
          academicYearId: input.academicYearId,
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );

    return row;
  };

  const created = executor ? await run(executor) : await withTransaction(run);

  return toDto(created);
};

/**
 * Moves a student to another class inside the same academic year. The previous
 * enrollment is closed as TRANSFERRED and a new row is created that points back
 * to it, so the full path through the school stays visible.
 */
export const transfer = async (
  enrollmentId: number,
  input: TransferEnrollmentInput,
  context: AuditContext,
): Promise<EnrollmentDto> => {
  const existing = await repository.findEnrollmentById(enrollmentId);

  if (!existing) {
    throw AppError.notFound('Enrollment not found', 'ENROLLMENT_NOT_FOUND');
  }

  if (existing.status !== 'ACTIVE') {
    throw AppError.conflict(
      'Only an active enrollment can be transferred',
      'ENROLLMENT_NOT_ACTIVE',
    );
  }

  if (existing.class_id === input.classId) {
    throw AppError.badRequest(
      'The student is already enrolled in this class',
      'SAME_CLASS_TRANSFER',
    );
  }

  assertNotBeforeStart(input.effectiveDate, existing.enrolled_date);

  await assertClassAcceptsStudent(input.classId, existing.academic_year_id);

  const created = await withTransaction(async (client) => {
    await repository.closeEnrollment(
      enrollmentId,
      'TRANSFERRED',
      input.effectiveDate ?? null,
      input.remarks ?? null,
      client,
    );

    const row = await repository.insertEnrollment(
      {
        studentId: existing.student_id,
        academicYearId: existing.academic_year_id,
        classId: input.classId,
        rollNumber: input.rollNumber ?? null,
        enrolledDate: input.effectiveDate,
        remarks: input.remarks ?? null,
        createdBy: context.userId,
        transferredFrom: enrollmentId,
      },
      client,
    );

    await auditService.record(
      {
        userId: context.userId,
        action: 'UPDATE',
        entityType: 'enrollment',
        entityId: row.id,
        description: `Transferred ${existing.student_first_name} ${existing.student_last_name} from ${existing.class_name} to ${row.class_name}`,
        oldValue: { enrollmentId, classId: existing.class_id },
        newValue: { enrollmentId: row.id, classId: input.classId },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );

    return row;
  });

  return toDto(created);
};

/** Ends an enrollment without deleting it. */
export const withdraw = async (
  enrollmentId: number,
  input: WithdrawEnrollmentInput,
  context: AuditContext,
): Promise<EnrollmentDto> => {
  const existing = await repository.findEnrollmentById(enrollmentId);

  if (!existing) {
    throw AppError.notFound('Enrollment not found', 'ENROLLMENT_NOT_FOUND');
  }

  if (existing.status !== 'ACTIVE') {
    throw AppError.conflict('This enrollment is already closed', 'ENROLLMENT_NOT_ACTIVE');
  }

  assertNotBeforeStart(input.endDate, existing.enrolled_date);

  const status = input.status ?? 'WITHDRAWN';

  const closed = await withTransaction(async (client) => {
    const row = await repository.closeEnrollment(
      enrollmentId,
      status,
      input.endDate ?? null,
      input.remarks ?? null,
      client,
    );

    if (input.updateStudentStatus !== false && status === 'WITHDRAWN') {
      await studentRepository.updateStudent(existing.student_id, { status: 'WITHDRAWN' }, client);
    }

    if (input.updateStudentStatus !== false && status === 'TRANSFERRED') {
      await studentRepository.updateStudent(existing.student_id, { status: 'TRANSFERRED' }, client);
    }

    await auditService.record(
      {
        userId: context.userId,
        action: 'UPDATE',
        entityType: 'enrollment',
        entityId: enrollmentId,
        description: `Ended the enrollment of ${existing.student_first_name} ${existing.student_last_name} in ${existing.class_name}`,
        oldValue: { status: existing.status },
        newValue: { status, endDate: input.endDate ?? null },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );

    return row;
  });

  if (!closed) {
    throw AppError.notFound('Enrollment not found', 'ENROLLMENT_NOT_FOUND');
  }

  return toDto(closed);
};

export const updateDetails = async (
  enrollmentId: number,
  input: { rollNumber?: string | null; remarks?: string | null },
  context: AuditContext,
): Promise<EnrollmentDto> => {
  const existing = await repository.findEnrollmentById(enrollmentId);

  if (!existing) {
    throw AppError.notFound('Enrollment not found', 'ENROLLMENT_NOT_FOUND');
  }

  if (existing.academic_year_status === 'CLOSED') {
    throw AppError.conflict(
      'This enrollment belongs to a closed academic year and cannot be modified',
      'ACADEMIC_YEAR_CLOSED',
    );
  }

  const updated = await withTransaction(async (client) => {
    const row = await repository.updateEnrollmentDetails(enrollmentId, input, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'UPDATE',
        entityType: 'enrollment',
        entityId: enrollmentId,
        description: `Updated the enrollment of ${existing.student_first_name} ${existing.student_last_name}`,
        oldValue: { rollNumber: existing.roll_number, remarks: existing.remarks },
        newValue: input as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );

    return row;
  });

  if (!updated) {
    throw AppError.notFound('Enrollment not found', 'ENROLLMENT_NOT_FOUND');
  }

  return toDto(updated);
};

/**
 * Promotes a whole cohort into the next academic year. Previous enrollments are
 * completed rather than edited, and each student receives a new enrollment row,
 * which is what keeps `2026 -> Grade 3A`, `2027 -> Grade 4A` intact.
 */
export const promoteCohort = async (
  input: PromotionInput,
  context: AuditContext,
): Promise<PromotionResult> => {
  const fromYear = await academicYearRepository.findAcademicYearById(input.fromAcademicYearId);
  const toYear = await academicYearRepository.findAcademicYearById(input.toAcademicYearId);

  if (!fromYear || !toYear) {
    throw AppError.badRequest('The selected academic year does not exist', 'ACADEMIC_YEAR_NOT_FOUND');
  }

  if (toYear.status === 'CLOSED') {
    throw AppError.conflict('The destination academic year is closed', 'ACADEMIC_YEAR_CLOSED');
  }

  if (fromYear.id === toYear.id) {
    throw AppError.badRequest(
      'The source and destination academic years must be different',
      'SAME_ACADEMIC_YEAR',
    );
  }

  const excluded = new Set(input.excludeStudentIds ?? []);

  return withTransaction(async (client) => {
    const details: PromotionResult['details'] = [];
    let skipped = 0;

    for (const mapping of input.classMapping) {
      const sourceClass = await classRepository.findClassById(mapping.fromClassId, client);
      const targetClass = await classRepository.findClassById(mapping.toClassId, client);

      if (!sourceClass || !targetClass) {
        throw AppError.badRequest(
          'One of the classes in the mapping does not exist',
          'CLASS_NOT_FOUND',
        );
      }

      if (sourceClass.academic_year_id !== fromYear.id) {
        throw AppError.badRequest(
          `Class ${sourceClass.name} does not belong to ${fromYear.name}`,
          'CLASS_YEAR_MISMATCH',
        );
      }

      if (targetClass.academic_year_id !== toYear.id) {
        throw AppError.badRequest(
          `Class ${targetClass.name} does not belong to ${toYear.name}`,
          'CLASS_YEAR_MISMATCH',
        );
      }

      const enrollments = await repository.findActiveEnrollmentsByClass(mapping.fromClassId, client);
      let seatsLeft =
        targetClass.capacity - (await classRepository.countActiveEnrollments(targetClass.id, client));

      for (const enrollment of enrollments) {
        if (excluded.has(enrollment.student_id)) {
          skipped += 1;
          continue;
        }

        const alreadyEnrolled = await repository.findActiveEnrollment(
          enrollment.student_id,
          toYear.id,
          client,
        );

        if (alreadyEnrolled) {
          skipped += 1;
          continue;
        }

        if (seatsLeft <= 0) {
          throw AppError.conflict(
            `Class ${targetClass.name} does not have enough seats for the promoted students`,
            'CLASS_FULL',
          );
        }

        await repository.closeEnrollment(
          enrollment.id,
          'PROMOTED',
          fromYear.end_date,
          `Promoted to ${toYear.name}`,
          client,
        );

        const created = await repository.insertEnrollment(
          {
            studentId: enrollment.student_id,
            academicYearId: toYear.id,
            classId: targetClass.id,
            rollNumber: enrollment.roll_number,
            enrolledDate: input.enrolledDate ?? toYear.start_date,
            remarks: `Promoted from ${sourceClass.name} (${fromYear.name})`,
            createdBy: context.userId,
            transferredFrom: enrollment.id,
          },
          client,
        );

        seatsLeft -= 1;

        details.push({
          studentId: enrollment.student_id,
          fromClassId: sourceClass.id,
          toClassId: targetClass.id,
          enrollmentId: created.id,
        });
      }
    }

    await auditService.record(
      {
        userId: context.userId,
        action: 'CREATE',
        entityType: 'enrollment',
        description: `Promoted ${details.length} student(s) from ${fromYear.name} to ${toYear.name}`,
        newValue: { promoted: details.length, skipped },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );

    return { promoted: details.length, skipped, details };
  });
};

export const enrollmentStatsByGrade = async (academicYearId: number) =>
  repository.countEnrollmentsByGrade(academicYearId);

export const enrollmentStatsByClass = async (academicYearId: number) =>
  repository.countEnrollmentsByClass(academicYearId);

/**
 * Graduates the pupils of the exit grade at the end of a year.
 *
 * Promotion moves a cohort up a grade; this is what happens to the cohort that
 * has no grade left to move to. `grade_levels.is_exit_grade` decides who that
 * is, so the rule follows the curriculum rather than a hard-coded grade code —
 * a school that later adds a Grade 10 moves the flag and nothing else changes.
 *
 * Each pupil gets `students.status = GRADUATED` and their enrolment is closed as
 * COMPLETED on the last day of the year. Both halves matter: the enrolment is
 * what puts a pupil on a roster, a register and a report card, so leaving it
 * open would keep a leaver appearing everywhere, while leaving the student
 * status ACTIVE would make them look like they are still attending.
 */
export const graduateExitGrade = async (
  input: { academicYearId: number; excludeStudentIds?: number[] },
  context: AuditContext,
): Promise<{ graduated: number; skipped: number; classes: string[] }> => {
  const year = await academicYearRepository.findAcademicYearById(input.academicYearId);

  if (!year) {
    throw AppError.badRequest('The selected academic year does not exist', 'ACADEMIC_YEAR_NOT_FOUND');
  }

  if (year.status === 'CLOSED') {
    throw AppError.conflict(
      'That academic year is closed. Graduate the cohort before closing the year.',
      'ACADEMIC_YEAR_CLOSED',
    );
  }

  const excluded = new Set(input.excludeStudentIds ?? []);

  return withTransaction(async (client) => {
    const leavers = await repository.findExitGradeEnrollments(input.academicYearId, client);

    if (leavers.length === 0) {
      throw AppError.badRequest(
        `No pupil in ${year.name} is enrolled in a grade marked as the exit grade`,
        'NO_EXIT_GRADE_STUDENTS',
      );
    }

    const classes = new Set<string>();
    let graduated = 0;
    let skipped = 0;

    for (const leaver of leavers) {
      if (excluded.has(leaver.student_id)) {
        skipped += 1;
        continue;
      }

      await repository.closeEnrollment(
        leaver.id,
        'COMPLETED',
        year.end_date,
        `Completed ${leaver.grade_level_name} and left the school`,
        client,
      );

      await client.query(
        `UPDATE students SET status = 'GRADUATED'::student_status WHERE id = $1`,
        [leaver.student_id],
      );

      classes.add(leaver.class_name);
      graduated += 1;
    }

    await auditService.record(
      {
        userId: context.userId,
        action: 'UPDATE',
        entityType: 'enrollment',
        description: `Graduated ${graduated} pupil(s) from ${year.name}`,
        newValue: { graduated, skipped, classes: [...classes] },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );

    return { graduated, skipped, classes: [...classes].sort() };
  });
};
