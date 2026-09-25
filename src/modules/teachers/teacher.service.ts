import { withTransaction } from '../../database/connection';
import type { AuditContext, PaginatedResult, PaginationParams, RoleCode, SortParams } from '../../types';
import { AppError } from '../../utils/app-error';
import { buildYearPrefix, generateSequentialCode } from '../../utils/code-generator';
import { hashPassword } from '../../utils/password';
import * as auditService from '../audit/audit.service';
import * as photoService from '../files/photo.service';
import * as userRepository from '../users/user.repository';
import * as academicYearRepository from '../academic-years/academic-year.repository';
import * as repository from './teacher.repository';
import type { TeacherSortColumn } from './teacher.repository';
import type {
  CreateTeacherInput,
  TeacherAssignmentDto,
  TeacherAssignmentRow,
  TeacherDto,
  TeacherFilters,
  TeacherRow,
  TeacherScheduleDto,
  TeacherScheduleRow,
  UpdateTeacherInput,
} from './teacher.types';

const toDto = (row: TeacherRow): TeacherDto => ({
  id: row.id,
  userId: row.user_id,
  username: row.username ?? null,
  teacherCode: row.teacher_code,
  firstNameEn: row.first_name_en,
  lastNameEn: row.last_name_en,
  firstNameKh: row.first_name_kh,
  lastNameKh: row.last_name_kh,
  fullName: `${row.first_name_en} ${row.last_name_en}`.trim(),
  gender: row.gender,
  dateOfBirth: row.date_of_birth,
  nationalId: row.national_id,
  phoneNumber: row.phone_number,
  email: row.email,
  address: row.address,
  qualification: row.qualification,
  specialization: row.specialization,
  hireDate: row.hire_date,
  status: row.status,
  profilePhoto: row.profile_photo,
  notes: row.notes,
  subjectIds: row.subject_ids ?? [],
  homeroomClassIds: row.homeroom_class_ids ?? [],
  classCount: row.class_count ?? 0,
  studentCount: row.student_count ?? 0,
  // Exposed so a list showing archived records can mark them and offer a restore.
  archivedAt: row.deleted_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toAssignmentDto = (row: TeacherAssignmentRow): TeacherAssignmentDto => ({
  classSubjectId: row.class_subject_id,
  classId: row.class_id,
  className: row.class_name,
  classCode: row.class_code,
  academicYearId: row.academic_year_id,
  academicYearName: row.academic_year_name,
  gradeLevelId: row.grade_level_id,
  gradeLevelName: row.grade_level_name,
  subjectId: row.subject_id,
  subjectName: row.subject_name,
  isHomeroom: row.is_homeroom,
  studentCount: row.student_count,
});

const toScheduleDto = (row: TeacherScheduleRow): TeacherScheduleDto => ({
  id: row.id,
  dayOfWeek: row.day_of_week,
  periodNumber: row.period_number,
  startTime: row.start_time,
  endTime: row.end_time,
  classId: row.class_id,
  className: row.class_name,
  subjectId: row.subject_id,
  subjectName: row.subject_name,
  roomId: row.room_id,
  roomName: row.room_name,
  academicYearId: row.academic_year_id,
});

export const list = async (
  filters: TeacherFilters,
  pagination: PaginationParams,
  sort: SortParams<TeacherSortColumn>,
): Promise<PaginatedResult<TeacherDto>> => {
  const result = await repository.findTeachers(filters, pagination, sort);

  return { rows: result.rows.map(toDto), total: result.total };
};

export const listAll = async (filters: TeacherFilters = {}): Promise<TeacherDto[]> => {
  const rows = await repository.findAllTeachers({ status: 'ACTIVE', ...filters });
  return rows.map(toDto);
};

export const getById = async (id: number): Promise<TeacherDto> => {
  const row = await repository.findTeacherById(id);

  if (!row) {
    throw AppError.notFound('Teacher not found', 'TEACHER_NOT_FOUND');
  }

  return toDto(row);
};

export const getByUserId = async (userId: number): Promise<TeacherDto | null> => {
  const row = await repository.findTeacherByUserId(userId);
  return row ? toDto(row) : null;
};

/**
 * Creates a teacher profile, optionally with a linked user account. Profile and
 * account are written in one transaction so a failure never leaves an orphan.
 */
export const create = async (
  input: CreateTeacherInput,
  context: AuditContext,
): Promise<TeacherDto> => {
  if (input.teacherCode) {
    const duplicate = await repository.findTeacherByCode(input.teacherCode);

    if (duplicate) {
      throw AppError.conflict('A teacher with this code already exists', 'TEACHER_CODE_TAKEN');
    }
  }

  if (input.account) {
    if (await userRepository.usernameExists(input.account.username)) {
      throw AppError.conflict('This username is already taken', 'USERNAME_TAKEN');
    }

    if (await userRepository.emailExists(input.account.email)) {
      throw AppError.conflict('This email is already registered', 'EMAIL_TAKEN');
    }
  }

  const passwordHash = input.account ? await hashPassword(input.account.password) : null;

  const created = await withTransaction(async (client) => {
    let userId: number | null = null;

    if (input.account && passwordHash) {
      const user = await userRepository.insertUser(
        {
          username: input.account.username,
          email: input.account.email,
          passwordHash,
          status: 'ACTIVE',
          createdBy: context.userId,
        },
        client,
      );

      const roleCodes: RoleCode[] = input.account.isHomeroomTeacher
        ? ['TEACHER', 'HOMEROOM_TEACHER']
        : ['TEACHER'];

      const roles = await userRepository.findRolesByCodes(roleCodes, client);
      await userRepository.replaceUserRoles(
        user.id,
        roles.map((role) => role.id),
        context.userId,
        client,
      );

      userId = user.id;
    }

    const teacherCode =
      input.teacherCode ??
      (await generateSequentialCode(
        'teachers',
        'teacher_code',
        buildYearPrefix('TCH'),
        client,
      ));

    const row = await repository.insertTeacher({ ...input, teacherCode, userId }, client);

    if (input.subjectIds) {
      await repository.replaceTeacherSubjects(row.id, input.subjectIds, client);
    }

    await auditService.record(
      {
        userId: context.userId,
        action: 'CREATE',
        entityType: 'teacher',
        entityId: row.id,
        description: `Created teacher ${row.first_name_en} ${row.last_name_en}`,
        newValue: { teacherCode: row.teacher_code, hasAccount: userId !== null },
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
  input: UpdateTeacherInput,
  context: AuditContext,
): Promise<TeacherDto> => {
  const existing = await repository.findTeacherById(id);

  if (!existing) {
    throw AppError.notFound('Teacher not found', 'TEACHER_NOT_FOUND');
  }

  if (input.teacherCode) {
    const duplicate = await repository.findTeacherByCode(input.teacherCode, id);

    if (duplicate) {
      throw AppError.conflict('A teacher with this code already exists', 'TEACHER_CODE_TAKEN');
    }
  }

  const { oldValue, newValue } = auditService.diff(
    {
      teacherCode: existing.teacher_code,
      firstNameEn: existing.first_name_en,
      lastNameEn: existing.last_name_en,
      phoneNumber: existing.phone_number,
      email: existing.email,
      status: existing.status,
      subjectIds: existing.subject_ids ?? [],
    },
    input,
  );

  await withTransaction(async (client) => {
    await repository.updateTeacher(id, input, client);

    if (input.subjectIds) {
      await repository.replaceTeacherSubjects(id, input.subjectIds, client);
    }

    await auditService.record(
      {
        userId: context.userId,
        action: 'UPDATE',
        entityType: 'teacher',
        entityId: id,
        description: `Updated teacher ${existing.first_name_en} ${existing.last_name_en}`,
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
 * Archives a teacher. The teacher's past classes, grades and attendance entries
 * stay untouched; only current homeroom duty blocks the archive.
 */
export const archive = async (id: number, context: AuditContext): Promise<void> => {
  const existing = await repository.findTeacherById(id);

  if (!existing) {
    throw AppError.notFound('Teacher not found', 'TEACHER_NOT_FOUND');
  }

  const homeroomCount = await repository.countHomeroomClasses(id);

  if (homeroomCount > 0) {
    throw AppError.conflict(
      'This teacher is still the homeroom teacher of an open class. Reassign the homeroom first.',
      'TEACHER_IS_HOMEROOM',
    );
  }

  await withTransaction(async (client) => {
    await repository.softDeleteTeacher(id, client);

    // Release future teaching assignments but keep the historical rows.
    await client.query(
      `UPDATE class_subjects cs
          SET teacher_id = NULL
         FROM classes c
         JOIN academic_years y ON y.id = c.academic_year_id
        WHERE cs.class_id = c.id AND cs.teacher_id = $1 AND y.status <> 'CLOSED'`,
      [id],
    );

    if (existing.user_id) {
      await userRepository.updateUserStatus(existing.user_id, 'INACTIVE', client);
    }

    await auditService.record(
      {
        userId: context.userId,
        action: 'ARCHIVE',
        entityType: 'teacher',
        entityId: id,
        description: `Archived teacher ${existing.first_name_en} ${existing.last_name_en}`,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });
};

export const assignSubjects = async (
  id: number,
  subjectIds: number[],
  context: AuditContext,
): Promise<TeacherDto> => {
  const existing = await repository.findTeacherById(id);

  if (!existing) {
    throw AppError.notFound('Teacher not found', 'TEACHER_NOT_FOUND');
  }

  await withTransaction(async (client) => {
    await repository.replaceTeacherSubjects(id, subjectIds, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'ASSIGN',
        entityType: 'teacher',
        entityId: id,
        description: `Updated the subjects of ${existing.first_name_en} ${existing.last_name_en}`,
        oldValue: { subjectIds: existing.subject_ids ?? [] },
        newValue: { subjectIds },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });

  return getById(id);
};

export const listAssignments = async (
  id: number,
  academicYearId?: number,
): Promise<TeacherAssignmentDto[]> => {
  await getById(id);

  const rows = await repository.findTeacherAssignments(id, academicYearId);
  return rows.map(toAssignmentDto);
};

/**
 * The classes a teacher is teaching now, for their own workspace.
 *
 * Separate from `listAssignments` because the two questions differ. An
 * administrator opening a teacher's record wants their history, and that page
 * prints an academic-year column beside every row. A teacher opening "My
 * Classes" wants this year: unscoped, they were shown last year's 8A beside
 * this year's, every class counted twice, and the register could be opened on a
 * class that finished a year ago.
 */
export const listMyAssignments = async (
  id: number,
  academicYearId?: number,
): Promise<TeacherAssignmentDto[]> => {
  const year =
    academicYearId ?? (await academicYearRepository.findActiveAcademicYear())?.id ?? undefined;

  return listAssignments(id, year);
};

export const listSchedule = async (
  id: number,
  academicYearId?: number,
): Promise<TeacherScheduleDto[]> => {
  await getById(id);

  const rows = await repository.findTeacherSchedule(id, academicYearId);
  return rows.map(toScheduleDto);
};

/**
 * Creates and links a login account for an existing teacher profile.
 */
export const createAccount = async (
  id: number,
  account: { username: string; email: string; password: string; isHomeroomTeacher?: boolean },
  context: AuditContext,
): Promise<TeacherDto> => {
  const existing = await repository.findTeacherById(id);

  if (!existing) {
    throw AppError.notFound('Teacher not found', 'TEACHER_NOT_FOUND');
  }

  if (existing.user_id) {
    throw AppError.conflict('This teacher already has an account', 'TEACHER_HAS_ACCOUNT');
  }

  if (await userRepository.usernameExists(account.username)) {
    throw AppError.conflict('This username is already taken', 'USERNAME_TAKEN');
  }

  if (await userRepository.emailExists(account.email)) {
    throw AppError.conflict('This email is already registered', 'EMAIL_TAKEN');
  }

  const passwordHash = await hashPassword(account.password);

  await withTransaction(async (client) => {
    const user = await userRepository.insertUser(
      {
        username: account.username,
        email: account.email,
        passwordHash,
        status: 'ACTIVE',
        createdBy: context.userId,
      },
      client,
    );

    const roleCodes: RoleCode[] = account.isHomeroomTeacher
      ? ['TEACHER', 'HOMEROOM_TEACHER']
      : ['TEACHER'];

    const roles = await userRepository.findRolesByCodes(roleCodes, client);
    await userRepository.replaceUserRoles(
      user.id,
      roles.map((role) => role.id),
      context.userId,
      client,
    );

    await repository.linkUser(id, user.id, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'CREATE',
        entityType: 'user',
        entityId: user.id,
        description: `Created an account for teacher ${existing.first_name_en} ${existing.last_name_en}`,
        newValue: { username: account.username, roles: roleCodes },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });

  return getById(id);
};

/**
 * Brings an archived teacher back into the active list.
 *
 * Archiving is reversible on purpose: it is a soft delete, and an administrator
 * who archived the wrong person needs a way back that does not touch history.
 */
export const restore = async (id: number, context: AuditContext): Promise<TeacherDto> => {
  const restored = await repository.restoreTeacher(id);

  if (!restored) {
    throw AppError.notFound('Archived teacher not found', 'TEACHER_NOT_FOUND');
  }

  await auditService.record({
    userId: context.userId,
    action: 'RESTORE',
    entityType: 'teacher',
    entityId: id,
    description: 'Restored an archived teacher',
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });

  return getById(id);
};

// ---------------------------------------------------------------------------
// Profile photo
// ---------------------------------------------------------------------------

/**
 * Stores a new profile photo on Cloudinary and points the teacher at it.
 *
 * The upload happens before the database write: if Cloudinary refuses the
 * image the teacher keeps their old photo rather than losing it.
 */
export const setPhoto = async (
  id: number,
  photo: Buffer,
  context: AuditContext,
): Promise<TeacherDto> => {
  const existing = await repository.findTeacherById(id);

  if (!existing) {
    throw AppError.notFound('Teacher not found', 'TEACHER_NOT_FOUND');
  }

  const url = await photoService.uploadPhoto('teachers', id, photo);

  await withTransaction(async (client) => {
    await repository.updateTeacher(id, { profilePhoto: url }, client);
    await auditService.record(
      {
        userId: context.userId,
        action: 'UPDATE',
        entityType: 'teacher',
        entityId: id,
        description: `Changed the photo of teacher ${existing.first_name_en} ${existing.last_name_en}`,
        oldValue: { profilePhoto: existing.profile_photo },
        newValue: { profilePhoto: url },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });

  return getById(id);
};

export const removePhoto = async (id: number, context: AuditContext): Promise<TeacherDto> => {
  const existing = await repository.findTeacherById(id);

  if (!existing) {
    throw AppError.notFound('Teacher not found', 'TEACHER_NOT_FOUND');
  }

  if (existing.profile_photo) {
    await withTransaction(async (client) => {
      await repository.updateTeacher(id, { profilePhoto: null }, client);
      await auditService.record(
        {
          userId: context.userId,
          action: 'UPDATE',
          entityType: 'teacher',
          entityId: id,
          description: `Removed the photo of teacher ${existing.first_name_en} ${existing.last_name_en}`,
          oldValue: { profilePhoto: existing.profile_photo },
          newValue: { profilePhoto: null },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        client,
      );
    });

    // Only once the database no longer refers to it.
    await photoService.deletePhoto('teachers', id);
  }

  return getById(id);
};
