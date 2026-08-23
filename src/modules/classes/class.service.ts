import { withTransaction } from '../../database/connection';
import type { Queryable } from '../../database/connection';
import type { AuditContext, PaginatedResult, PaginationParams, SortParams } from '../../types';
import { AppError } from '../../utils/app-error';
import * as auditService from '../audit/audit.service';
import * as academicYearService from '../academic-years/academic-year.service';
import * as gradeLevelRepository from '../grade-levels/grade-level.repository';
import * as roomRepository from '../rooms/room.repository';
import * as subjectRepository from '../subjects/subject.repository';
import * as teacherRepository from '../teachers/teacher.repository';
import * as repository from './class.repository';
import type { ClassSortColumn } from './class.repository';
import type {
  ClassDto,
  ClassFilters,
  ClassRow,
  ClassStudentDto,
  ClassStudentRow,
  ClassSubjectDto,
  ClassSubjectRow,
  CreateClassInput,
  UpdateClassInput,
} from './class.types';

const toDto = (row: ClassRow): ClassDto => {
  const enrolled = row.enrolled_count ?? 0;

  return {
    id: row.id,
    academicYearId: row.academic_year_id,
    academicYearName: row.academic_year_name ?? '',
    academicYearStatus: row.academic_year_status ?? 'UPCOMING',
    gradeLevelId: row.grade_level_id,
    gradeLevelName: row.grade_level_name ?? '',
    gradeLevelOrder: row.grade_level_order ?? 0,
    homeroomTeacherId: row.homeroom_teacher_id,
    homeroomTeacherName: row.homeroom_teacher_name ?? null,
    roomId: row.room_id,
    roomName: row.room_name ?? null,
    code: row.code,
    name: row.name,
    capacity: row.capacity,
    description: row.description,
    isActive: row.is_active,
    enrolledCount: enrolled,
    availableSeats: Math.max(row.capacity - enrolled, 0),
    subjectCount: row.subject_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const toSubjectDto = (row: ClassSubjectRow): ClassSubjectDto => ({
  id: row.id,
  classId: row.class_id,
  subjectId: row.subject_id,
  subjectCode: row.subject_code,
  subjectNameEn: row.subject_name_en,
  subjectNameKh: row.subject_name_kh,
  teacherId: row.teacher_id,
  teacherName: row.teacher_name,
  weight: row.weight,
  isActive: row.is_active,
  assessmentCount: row.assessment_count,
});

const toStudentDto = (row: ClassStudentRow): ClassStudentDto => ({
  enrollmentId: row.enrollment_id,
  studentId: row.student_id,
  studentCode: row.student_code,
  firstNameEn: row.first_name_en,
  lastNameEn: row.last_name_en,
  firstNameKh: row.first_name_kh,
  lastNameKh: row.last_name_kh,
  fullName: `${row.first_name_en} ${row.last_name_en}`.trim(),
  gender: row.gender,
  dateOfBirth: row.date_of_birth,
  profilePhoto: row.profile_photo,
  studentStatus: row.student_status,
  enrollmentStatus: row.enrollment_status,
  rollNumber: row.roll_number,
  enrolledDate: row.enrolled_date,
});

/** Loads a class and refuses when its academic year has been closed. */
export const requireEditableClass = async (
  id: number,
  executor?: Queryable,
): Promise<ClassRow> => {
  const row = await repository.findClassById(id, executor);

  if (!row) {
    throw AppError.notFound('Class not found', 'CLASS_NOT_FOUND');
  }

  if (row.academic_year_status === 'CLOSED') {
    throw AppError.conflict(
      `Academic year ${row.academic_year_name} is closed and its classes can no longer be modified`,
      'ACADEMIC_YEAR_CLOSED',
    );
  }

  return row;
};

const assertReferencesExist = async (
  input: { gradeLevelId?: number; homeroomTeacherId?: number | null; roomId?: number | null },
): Promise<void> => {
  if (input.gradeLevelId !== undefined) {
    const gradeLevel = await gradeLevelRepository.findGradeLevelById(input.gradeLevelId);

    if (!gradeLevel) {
      throw AppError.badRequest('The selected grade level does not exist', 'GRADE_LEVEL_NOT_FOUND');
    }
  }

  if (input.homeroomTeacherId) {
    const teacher = await teacherRepository.findTeacherById(input.homeroomTeacherId);

    if (!teacher) {
      throw AppError.badRequest('The selected teacher does not exist', 'TEACHER_NOT_FOUND');
    }

    if (teacher.status !== 'ACTIVE') {
      throw AppError.badRequest(
        'Only an active teacher can be assigned as homeroom teacher',
        'TEACHER_NOT_ACTIVE',
      );
    }
  }

  if (input.roomId) {
    const room = await roomRepository.findRoomById(input.roomId);

    if (!room) {
      throw AppError.badRequest('The selected room does not exist', 'ROOM_NOT_FOUND');
    }
  }
};

export const list = async (
  filters: ClassFilters,
  pagination: PaginationParams,
  sort: SortParams<ClassSortColumn>,
): Promise<PaginatedResult<ClassDto>> => {
  const result = await repository.findClasses(filters, pagination, sort);

  return { rows: result.rows.map(toDto), total: result.total };
};

export const listAll = async (filters: ClassFilters = {}): Promise<ClassDto[]> => {
  const rows = await repository.findAllClasses(filters);
  return rows.map(toDto);
};

export const getById = async (id: number): Promise<ClassDto> => {
  const row = await repository.findClassById(id);

  if (!row) {
    throw AppError.notFound('Class not found', 'CLASS_NOT_FOUND');
  }

  return toDto(row);
};

export const create = async (
  input: CreateClassInput,
  context: AuditContext,
): Promise<ClassDto> => {
  await academicYearService.requireEditableYear(input.academicYearId);
  await assertReferencesExist(input);

  const duplicate = await repository.findClassByCode(input.academicYearId, input.code);

  if (duplicate) {
    throw AppError.conflict(
      'A class with this code already exists in the selected academic year',
      'CLASS_CODE_TAKEN',
    );
  }

  const created = await withTransaction(async (client) => {
    const row = await repository.insertClass(input, client);

    for (const subject of input.subjects ?? []) {
      await repository.upsertClassSubject(row.id, subject, client);
    }

    if (input.homeroomTeacherId) {
      await client.query(
        `INSERT INTO teacher_classes (teacher_id, class_id, is_homeroom)
         VALUES ($1, $2, TRUE)
         ON CONFLICT (teacher_id, class_id) DO UPDATE SET is_homeroom = TRUE`,
        [input.homeroomTeacherId, row.id],
      );
    }

    await auditService.record(
      {
        userId: context.userId,
        action: 'CREATE',
        entityType: 'class',
        entityId: row.id,
        description: `Created class ${row.name}`,
        newValue: {
          code: row.code,
          name: row.name,
          academicYearId: row.academic_year_id,
          gradeLevelId: row.grade_level_id,
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );

    return row;
  });

  return getById(created.id);
};

export const update = async (
  id: number,
  input: UpdateClassInput,
  context: AuditContext,
): Promise<ClassDto> => {
  const existing = await requireEditableClass(id);
  await assertReferencesExist(input);

  if (input.code) {
    const duplicate = await repository.findClassByCode(
      existing.academic_year_id,
      input.code,
      id,
    );

    if (duplicate) {
      throw AppError.conflict(
        'A class with this code already exists in this academic year',
        'CLASS_CODE_TAKEN',
      );
    }
  }

  if (input.capacity !== undefined) {
    const enrolled = await repository.countActiveEnrollments(id);

    if (input.capacity < enrolled) {
      throw AppError.badRequest(
        `Capacity cannot be lower than the ${enrolled} students currently enrolled`,
        'CAPACITY_BELOW_ENROLLED',
      );
    }
  }

  const { oldValue, newValue } = auditService.diff(
    {
      code: existing.code,
      name: existing.name,
      gradeLevelId: existing.grade_level_id,
      homeroomTeacherId: existing.homeroom_teacher_id,
      roomId: existing.room_id,
      capacity: existing.capacity,
      isActive: existing.is_active,
    },
    input,
  );

  await withTransaction(async (client) => {
    await repository.updateClass(id, input, client);

    if (input.homeroomTeacherId !== undefined) {
      await client.query('UPDATE teacher_classes SET is_homeroom = FALSE WHERE class_id = $1', [id]);

      if (input.homeroomTeacherId) {
        await client.query(
          `INSERT INTO teacher_classes (teacher_id, class_id, is_homeroom)
           VALUES ($1, $2, TRUE)
           ON CONFLICT (teacher_id, class_id) DO UPDATE SET is_homeroom = TRUE`,
          [input.homeroomTeacherId, id],
        );
      }
    }

    await auditService.record(
      {
        userId: context.userId,
        action: 'UPDATE',
        entityType: 'class',
        entityId: id,
        description: `Updated class ${existing.name}`,
        oldValue,
        newValue,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });

  return getById(id);
};

/**
 * Archives a class. A class that ever held an enrollment is part of the school's
 * history, so archiving is refused while any enrollment references it.
 */
export const archive = async (id: number, context: AuditContext): Promise<void> => {
  const existing = await requireEditableClass(id);
  const enrollments = await repository.countEnrollmentsEver(id);

  if (enrollments > 0) {
    throw AppError.conflict(
      'This class has enrollment history and cannot be archived. Deactivate it instead.',
      'CLASS_HAS_ENROLLMENTS',
    );
  }

  await withTransaction(async (client) => {
    await repository.softDeleteClass(id, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'ARCHIVE',
        entityType: 'class',
        entityId: id,
        description: `Archived class ${existing.name}`,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });
};

// ---------------------------------------------------------------------------
// Class subjects
// ---------------------------------------------------------------------------

export const listSubjects = async (classId: number): Promise<ClassSubjectDto[]> => {
  await getById(classId);

  const rows = await repository.findClassSubjects(classId);
  return rows.map(toSubjectDto);
};

export const assignSubject = async (
  classId: number,
  input: { subjectId: number; teacherId?: number | null; weight?: number; isActive?: boolean },
  context: AuditContext,
): Promise<ClassSubjectDto> => {
  const classRow = await requireEditableClass(classId);

  const subject = await subjectRepository.findSubjectById(input.subjectId);

  if (!subject) {
    throw AppError.badRequest('The selected subject does not exist', 'SUBJECT_NOT_FOUND');
  }

  if (input.teacherId) {
    const teacher = await teacherRepository.findTeacherById(input.teacherId);

    if (!teacher) {
      throw AppError.badRequest('The selected teacher does not exist', 'TEACHER_NOT_FOUND');
    }
  }

  const saved = await withTransaction(async (client) => {
    const row = await repository.upsertClassSubject(classId, input, client);

    if (input.teacherId) {
      await client.query(
        `INSERT INTO teacher_classes (teacher_id, class_id)
         VALUES ($1, $2)
         ON CONFLICT (teacher_id, class_id) DO NOTHING`,
        [input.teacherId, classId],
      );
    }

    await auditService.record(
      {
        userId: context.userId,
        action: 'ASSIGN',
        entityType: 'class_subject',
        entityId: row.id,
        description: `Assigned ${subject.name_en} to class ${classRow.name}`,
        newValue: { subjectId: input.subjectId, teacherId: input.teacherId ?? null },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );

    return row;
  });

  const created = await repository.findClassSubjectById(saved.id);
  return toSubjectDto(created as ClassSubjectRow);
};

/** Replaces the whole subject list of a class in one operation. */
export const replaceSubjects = async (
  classId: number,
  subjects: { subjectId: number; teacherId?: number | null; weight?: number }[],
  context: AuditContext,
): Promise<ClassSubjectDto[]> => {
  const classRow = await requireEditableClass(classId);
  const existing = await repository.findClassSubjects(classId);
  const keptSubjectIds = new Set(subjects.map((subject) => subject.subjectId));

  for (const current of existing) {
    if (keptSubjectIds.has(current.subject_id)) {
      continue;
    }

    if (current.assessment_count > 0) {
      throw AppError.conflict(
        `${current.subject_name_en} has assessments in this class and cannot be removed`,
        'CLASS_SUBJECT_HAS_ASSESSMENTS',
      );
    }
  }

  await withTransaction(async (client) => {
    for (const current of existing) {
      if (!keptSubjectIds.has(current.subject_id)) {
        await repository.deleteClassSubject(current.id, client);
      }
    }

    for (const subject of subjects) {
      await repository.upsertClassSubject(classId, subject, client);
    }

    await auditService.record(
      {
        userId: context.userId,
        action: 'UPDATE',
        entityType: 'class',
        entityId: classId,
        description: `Updated the subjects of class ${classRow.name}`,
        oldValue: { subjectIds: existing.map((item) => item.subject_id) },
        newValue: { subjectIds: subjects.map((item) => item.subjectId) },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });

  return listSubjects(classId);
};

export const removeSubject = async (
  classId: number,
  classSubjectId: number,
  context: AuditContext,
): Promise<void> => {
  const classRow = await requireEditableClass(classId);
  const classSubject = await repository.findClassSubjectById(classSubjectId);

  if (!classSubject || classSubject.class_id !== classId) {
    throw AppError.notFound('Class subject not found', 'CLASS_SUBJECT_NOT_FOUND');
  }

  const assessments = await repository.countAssessmentsForClassSubject(
    classId,
    classSubject.subject_id,
  );

  if (assessments > 0) {
    throw AppError.conflict(
      'This subject has assessments in this class and cannot be removed',
      'CLASS_SUBJECT_HAS_ASSESSMENTS',
    );
  }

  await withTransaction(async (client) => {
    await repository.deleteClassSubject(classSubjectId, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'UNASSIGN',
        entityType: 'class_subject',
        entityId: classSubjectId,
        description: `Removed ${classSubject.subject_name_en} from class ${classRow.name}`,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });
};

export const listStudents = async (
  classId: number,
  includeInactive = false,
): Promise<ClassStudentDto[]> => {
  await getById(classId);

  const rows = await repository.findClassStudents(classId, includeInactive);
  return rows.map(toStudentDto);
};
