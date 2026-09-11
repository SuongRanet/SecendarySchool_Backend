import { withTransaction } from '../../database/connection';
import type {
  AuditContext,
  AuthenticatedUser,
  PaginatedResult,
  PaginationParams,
} from '../../types';
import { AppError } from '../../utils/app-error';
import * as auditService from '../audit/audit.service';
import * as academicYearRepository from '../academic-years/academic-year.repository';
import * as attendanceRepository from '../attendance/attendance.repository';
import * as classRepository from '../classes/class.repository';
import * as enrollmentRepository from '../enrollments/enrollment.repository';
import * as gradeRepository from '../grades/grade.repository';
import * as gradeService from '../grades/grade.service';
import * as teacherRepository from '../teachers/teacher.repository';
import { isElevated } from '../../middleware/role.middleware';
import * as repository from './report-card.repository';
import type {
  GenerateReportCardsInput,
  ReportCardDto,
  ReportCardFilters,
  ReportCardRow,
  ReportCardSubjectDto,
  ReportCardSubjectRow,
  UpdateReportCardInput,
} from './report-card.types';

const toSubjectDto = (row: ReportCardSubjectRow): ReportCardSubjectDto => ({
  subjectId: row.subject_id,
  subjectName: row.subject_name ?? '',
  subjectNameKh: row.subject_name_kh ?? null,
  subjectCode: row.subject_code ?? '',
  score: row.score,
  maxScore: row.max_score,
  percentage: row.percentage,
  letterGrade: row.letter_grade,
  performance: row.performance,
  rankInClass: row.rank_in_class,
  comment: row.comment,
});

const toDto = (row: ReportCardRow, subjects: ReportCardSubjectRow[]): ReportCardDto => ({
  id: row.id,
  studentId: row.student_id,
  studentCode: row.student_code ?? '',
  studentName: `${row.student_first_name ?? ''} ${row.student_last_name ?? ''}`.trim(),
  studentNameKh:
    row.student_first_name_kh || row.student_last_name_kh
      ? `${row.student_first_name_kh ?? ''} ${row.student_last_name_kh ?? ''}`.trim()
      : null,
  studentPhoto: row.student_photo ?? null,
  dateOfBirth: row.date_of_birth ?? null,
  academicYearId: row.academic_year_id,
  academicYearName: row.academic_year_name ?? '',
  termId: row.term_id,
  termName: row.term_name ?? null,
  classId: row.class_id,
  className: row.class_name ?? '',
  gradeLevelName: row.grade_level_name ?? '',
  homeroomTeacherId: row.homeroom_teacher_id ?? null,
  homeroomTeacherName: row.homeroom_teacher_name ?? null,
  totalScore: row.total_score,
  averageScore: row.average_score,
  gpa: row.gpa,
  letterGrade: row.letter_grade,
  performance: row.performance,
  rankInClass: row.rank_in_class,
  classSize: row.class_size,
  attendance: {
    present: row.days_present,
    absent: row.days_absent,
    late: row.days_late,
    excused: row.days_excused,
    percent: row.attendance_percent,
  },
  teacherComment: row.teacher_comment,
  homeroomComment: row.homeroom_comment,
  principalComment: row.principal_comment,
  status: row.status,
  generatedAt: row.generated_at,
  publishedAt: row.published_at,
  subjects: subjects.map(toSubjectDto),
});

export const list = async (
  filters: ReportCardFilters,
  pagination: PaginationParams,
): Promise<PaginatedResult<Omit<ReportCardDto, 'subjects'>>> => {
  const result = await repository.findReportCards(filters, pagination);

  return {
    rows: result.rows.map((row) => {
      const { subjects, ...rest } = toDto(row, []);
      void subjects;
      return rest;
    }),
    total: result.total,
  };
};

export const getById = async (id: number): Promise<ReportCardDto> => {
  const row = await repository.findReportCardById(id);

  if (!row) {
    throw AppError.notFound('Report card not found', 'REPORT_CARD_NOT_FOUND');
  }

  const subjects = await repository.findSubjects(id);
  return toDto(row, subjects);
};

export const getForStudent = async (
  studentId: number,
  academicYearId: number,
  termId: number | null,
): Promise<ReportCardDto | null> => {
  const row = await repository.findReportCard(studentId, academicYearId, termId);

  if (!row) {
    return null;
  }

  const subjects = await repository.findSubjects(row.id);
  return toDto(row, subjects);
};

/**
 * Builds report cards for a class from data that already exists: the stored
 * subject grades, the attendance records and the class roster. Nothing is
 * recomputed from scratch, so a report card always matches what the grade pages
 * show.
 */
export const generate = async (
  input: GenerateReportCardsInput,
  user: AuthenticatedUser,
  context: AuditContext,
): Promise<ReportCardDto[]> => {
  const classRow = await classRepository.findClassById(input.classId);

  if (!classRow) {
    throw AppError.notFound('Class not found', 'CLASS_NOT_FOUND');
  }

  // The permission is shared with the office, so the class still has to be the
  // teacher's own.
  if (!isElevated(user)) {
    const isHomeroom = user.teacherId
      ? await teacherRepository.isHomeroomTeacherOf(user.teacherId, input.classId)
      : false;

    if (!isHomeroom) {
      throw AppError.forbidden(
        'You may only generate report cards for your own homeroom class',
        'REPORT_CARD_GENERATE_DENIED',
      );
    }
  }

  const year = await academicYearRepository.findAcademicYearById(classRow.academic_year_id);

  if (!year) {
    throw AppError.notFound('Academic year not found', 'ACADEMIC_YEAR_NOT_FOUND');
  }

  const termId = input.termId ?? null;
  const students = await classRepository.findClassStudents(input.classId);
  const selected = input.studentIds
    ? students.filter((student) => input.studentIds?.includes(student.student_id))
    : students;

  if (selected.length === 0) {
    throw AppError.badRequest(
      'This class has no actively enrolled students to generate report cards for',
      'NO_STUDENTS_IN_CLASS',
    );
  }

  const classSubjects = await classRepository.findClassSubjects(input.classId);
  const subjectOrder = new Map(
    classSubjects.map((subject, index) => [subject.subject_id, index]),
  );

  const scheme = await gradeRepository.findDefaultGradingScheme();
  const scales = scheme ? await gradeRepository.findScales(scheme.id) : [];

  const generatedIds = await withTransaction(async (client) => {
    const ids: number[] = [];

    for (const student of selected) {
      const grades = await gradeRepository.findAllGrades({
        studentId: student.student_id,
        classId: input.classId,
        academicYearId: year.id,
        termId: termId ?? undefined,
      });

      const graded = grades.filter((grade) => grade.percentage !== null);
      const totalScore = graded.reduce((sum, grade) => sum + Number(grade.score ?? 0), 0);
      const averageScore =
        graded.length > 0
          ? Number(
              (
                graded.reduce((sum, grade) => sum + Number(grade.percentage ?? 0), 0) /
                graded.length
              ).toFixed(2),
            )
          : null;

      const gpaValues = graded
        .map((grade) => grade.gpa_point)
        .filter((value): value is number => value !== null && value !== undefined);
      const gpa =
        gpaValues.length > 0
          ? Number((gpaValues.reduce((sum, value) => sum + Number(value), 0) / gpaValues.length).toFixed(2))
          : null;

      const overall = gradeService.applyScale(averageScore, scales);

      const attendance = await attendanceRepository.summarizeStudent(student.student_id, {
        academicYearId: year.id,
      });
      const attendancePercent =
        attendance.totalRecords > 0
          ? Number(
              (((attendance.present + attendance.late) / attendance.totalRecords) * 100).toFixed(2),
            )
          : null;

      const enrollment = await enrollmentRepository.findActiveEnrollment(
        student.student_id,
        year.id,
        client,
      );

      const reportCardId = await repository.upsertReportCard(
        {
          studentId: student.student_id,
          enrollmentId: enrollment?.id ?? null,
          academicYearId: year.id,
          termId,
          classId: input.classId,
          totalScore: graded.length > 0 ? Number(totalScore.toFixed(2)) : null,
          averageScore,
          gpa,
          letterGrade: overall.letterGrade,
          performance: overall.performance,
          classSize: students.length,
          daysPresent: attendance.present,
          daysAbsent: attendance.absent,
          daysLate: attendance.late,
          daysExcused: attendance.excused,
          attendancePercent,
          status: input.publish ? 'PUBLISHED' : 'DRAFT',
          generatedBy: context.userId,
        },
        client,
      );

      await repository.replaceSubjects(
        reportCardId,
        grades.map((grade) => ({
          subjectId: grade.subject_id,
          gradeId: grade.id,
          score: grade.score,
          maxScore: grade.max_score,
          percentage: grade.percentage,
          letterGrade: grade.letter_grade,
          performance: grade.performance,
          rankInClass: grade.rank_in_class,
          displayOrder: subjectOrder.get(grade.subject_id) ?? 99,
        })),
        client,
      );

      ids.push(reportCardId);
    }

    await repository.recalculateRanks(input.classId, year.id, termId, client);

    await auditService.record(
      {
        userId: context.userId,
        action: input.publish ? 'PUBLISH' : 'CREATE',
        entityType: 'report_card',
        entityId: input.classId,
        description: `Generated ${ids.length} report card(s) for ${classRow.name}`,
        newValue: { classId: input.classId, termId, count: ids.length, published: Boolean(input.publish) },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );

    return ids;
  });

  return Promise.all(generatedIds.map((id) => getById(id)));
};

/**
 * Which part of a report card a writer owns.
 *
 * The office and the principal may write anywhere. A homeroom teacher owns the
 * homeroom comment on their own class and nothing else — the subject remarks
 * belong to the subject teachers and the principal's line to the principal, so
 * those are dropped rather than refused, which keeps a partial save working.
 *
 * Kept free of database access so the rule itself can be tested directly; the
 * caller supplies the two facts it needs.
 */
export const narrowComments = (
  writer: { isOffice: boolean; isHomeroomTeacher: boolean },
  input: UpdateReportCardInput,
): UpdateReportCardInput => {
  if (writer.isOffice) {
    return input;
  }

  if (!writer.isHomeroomTeacher) {
    throw AppError.forbidden(
      'You may only comment on the report cards of your own homeroom class',
      'REPORT_CARD_COMMENT_DENIED',
    );
  }

  if (input.homeroomComment === undefined) {
    throw AppError.forbidden(
      'A homeroom teacher may only write the homeroom comment',
      'REPORT_CARD_COMMENT_DENIED',
    );
  }

  return { homeroomComment: input.homeroomComment };
};

const narrowCommentsToScope = async (
  user: AuthenticatedUser,
  classId: number,
  input: UpdateReportCardInput,
): Promise<UpdateReportCardInput> =>
  narrowComments(
    {
      isOffice: isElevated(user),
      isHomeroomTeacher: user.teacherId
        ? await teacherRepository.isHomeroomTeacherOf(user.teacherId, classId)
        : false,
    },
    input,
  );

export const updateComments = async (
  id: number,
  input: UpdateReportCardInput,
  user: AuthenticatedUser,
  context: AuditContext,
): Promise<ReportCardDto> => {
  const existing = await repository.findReportCardById(id);

  if (!existing) {
    throw AppError.notFound('Report card not found', 'REPORT_CARD_NOT_FOUND');
  }

  const scoped = await narrowCommentsToScope(user, existing.class_id, input);

  await withTransaction(async (client) => {
    await repository.updateComments(id, scoped, client);

    for (const subjectComment of scoped.subjectComments ?? []) {
      await repository.updateSubjectComment(
        id,
        subjectComment.subjectId,
        subjectComment.comment ?? null,
        client,
      );
    }

    await auditService.record(
      {
        userId: context.userId,
        action: 'UPDATE',
        entityType: 'report_card',
        entityId: id,
        description: `Updated comments on the report card of ${existing.student_first_name} ${existing.student_last_name}`,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });

  return getById(id);
};

export const setStatus = async (
  id: number,
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED',
  context: AuditContext,
): Promise<ReportCardDto> => {
  const existing = await repository.findReportCardById(id);

  if (!existing) {
    throw AppError.notFound('Report card not found', 'REPORT_CARD_NOT_FOUND');
  }

  await withTransaction(async (client) => {
    await repository.setStatus(id, status, client);

    await auditService.record(
      {
        userId: context.userId,
        action: status === 'PUBLISHED' ? 'PUBLISH' : 'UPDATE',
        entityType: 'report_card',
        entityId: id,
        description: `Set the report card of ${existing.student_first_name} ${existing.student_last_name} to ${status}`,
        oldValue: { status: existing.status },
        newValue: { status },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });

  return getById(id);
};

/** Publishes every report card of a class at once. */
export const publishClass = async (
  classId: number,
  termId: number | null,
  context: AuditContext,
): Promise<number> => {
  const classRow = await classRepository.findClassById(classId);

  if (!classRow) {
    throw AppError.notFound('Class not found', 'CLASS_NOT_FOUND');
  }

  const cards = await repository.findReportCards(
    { classId, termId: termId ?? undefined, academicYearId: classRow.academic_year_id },
    { page: 1, limit: 500, offset: 0 },
  );

  await withTransaction(async (client) => {
    for (const card of cards.rows) {
      await repository.setStatus(card.id, 'PUBLISHED', client);
    }

    await auditService.record(
      {
        userId: context.userId,
        action: 'PUBLISH',
        entityType: 'report_card',
        entityId: classId,
        description: `Published ${cards.rows.length} report card(s) for ${classRow.name}`,
        newValue: { classId, termId, count: cards.rows.length },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });

  return cards.rows.length;
};
