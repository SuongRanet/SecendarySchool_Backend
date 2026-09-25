import { withTransaction } from '../../database/connection';
import type { AuditContext, PaginatedResult, PaginationParams, SortParams } from '../../types';
import { AppError } from '../../utils/app-error';
import { buildYearPrefix, generateSequentialCode } from '../../utils/code-generator';
import { hashPassword } from '../../utils/password';
import * as auditService from '../audit/audit.service';
import * as photoService from '../files/photo.service';
import * as enrollmentRepository from '../enrollments/enrollment.repository';
import * as userRepository from '../users/user.repository';
import * as repository from './student.repository';
import type { StudentSortColumn } from './student.repository';
import type {
  CreateStudentInput,
  StudentDto,
  StudentEnrollmentHistoryDto,
  StudentEnrollmentHistoryRow,
  StudentFilters,
  StudentParentDto,
  StudentParentRow,
  StudentRow,
  UpdateStudentInput,
} from './student.types';

const toDto = (row: StudentRow): StudentDto => ({
  id: row.id,
  userId: row.user_id,
  username: row.username ?? null,
  studentCode: row.student_code,
  firstNameEn: row.first_name_en,
  lastNameEn: row.last_name_en,
  firstNameKh: row.first_name_kh,
  lastNameKh: row.last_name_kh,
  fullName: `${row.first_name_en} ${row.last_name_en}`.trim(),
  fullNameKh:
    row.first_name_kh || row.last_name_kh
      ? `${row.first_name_kh ?? ''} ${row.last_name_kh ?? ''}`.trim()
      : null,
  gender: row.gender,
  dateOfBirth: row.date_of_birth,
  placeOfBirth: row.place_of_birth,
  nationalId: row.national_id,
  phoneNumber: row.phone_number,
  email: row.email,
  currentAddress: row.current_address,
  province: row.province,
  profilePhoto: row.profile_photo,
  enrolledDate: row.enrolled_date,
  status: row.status,
  notes: row.notes,
  currentEnrollment: row.current_enrollment_id
    ? {
        enrollmentId: row.current_enrollment_id,
        classId: row.current_class_id ?? 0,
        className: row.current_class_name ?? '',
        gradeLevelId: row.current_grade_level_id ?? 0,
        gradeLevelName: row.current_grade_level_name ?? '',
        academicYearId: row.current_academic_year_id ?? 0,
        academicYearName: row.current_academic_year_name ?? '',
      }
    : null,
  parentCount: row.parent_count ?? 0,
  // Exposed so a list showing archived records can mark them and offer a restore.
  archivedAt: row.deleted_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toParentDto = (row: StudentParentRow): StudentParentDto => ({
  linkId: row.link_id,
  parentId: row.parent_id,
  parentCode: row.parent_code,
  fullName: `${row.first_name_en} ${row.last_name_en}`.trim(),
  firstNameEn: row.first_name_en,
  lastNameEn: row.last_name_en,
  firstNameKh: row.first_name_kh,
  lastNameKh: row.last_name_kh,
  phoneNumber: row.phone_number,
  email: row.email,
  occupation: row.occupation,
  profilePhoto: row.profile_photo,
  relationship: row.relationship,
  isPrimaryContact: row.is_primary_contact,
  isEmergencyContact: row.is_emergency_contact,
  canPickUp: row.can_pick_up,
});

const toHistoryDto = (row: StudentEnrollmentHistoryRow): StudentEnrollmentHistoryDto => ({
  id: row.id,
  academicYearId: row.academic_year_id,
  academicYearName: row.academic_year_name,
  classId: row.class_id,
  className: row.class_name,
  gradeLevelId: row.grade_level_id,
  gradeLevelName: row.grade_level_name,
  homeroomTeacherName: row.homeroom_teacher_name,
  rollNumber: row.roll_number,
  enrolledDate: row.enrolled_date,
  endDate: row.end_date,
  status: row.status,
  remarks: row.remarks,
});

export const list = async (
  filters: StudentFilters,
  pagination: PaginationParams,
  sort: SortParams<StudentSortColumn>,
): Promise<PaginatedResult<StudentDto>> => {
  const result = await repository.findStudents(filters, pagination, sort);

  return { rows: result.rows.map(toDto), total: result.total };
};

export const getById = async (id: number): Promise<StudentDto> => {
  const row = await repository.findStudentById(id);

  if (!row) {
    throw AppError.notFound('Student not found', 'STUDENT_NOT_FOUND');
  }

  return toDto(row);
};

export const getByUserId = async (userId: number): Promise<StudentDto | null> => {
  const row = await repository.findStudentByUserId(userId);
  return row ? toDto(row) : null;
};

/**
 * Creates a student. The profile, the optional account, the guardian links and the
 * first enrollment are all written inside one transaction: either the whole
 * student record exists or none of it does.
 */
export const create = async (
  input: CreateStudentInput,
  context: AuditContext,
): Promise<StudentDto> => {
  if (input.studentCode) {
    const duplicate = await repository.findStudentByCode(input.studentCode);

    if (duplicate) {
      throw AppError.conflict('A student with this code already exists', 'STUDENT_CODE_TAKEN');
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

      const roles = await userRepository.findRolesByCodes(['STUDENT'], client);
      await userRepository.replaceUserRoles(
        user.id,
        roles.map((role) => role.id),
        context.userId,
        client,
      );

      userId = user.id;
    }

    const studentCode =
      input.studentCode ??
      (await generateSequentialCode('students', 'student_code', buildYearPrefix('STU'), client));

    const student = await repository.insertStudent({ ...input, studentCode, userId }, client);

    for (const parent of input.parents ?? []) {
      await repository.upsertStudentParent(student.id, parent, client);
    }

    if (input.enrollment) {
      const activeSameYear = await enrollmentRepository.findActiveEnrollment(
        student.id,
        input.enrollment.academicYearId,
        client,
      );

      if (activeSameYear) {
        throw AppError.conflict(
          'This student already has an active enrollment for the selected academic year',
          'STUDENT_ALREADY_ENROLLED',
        );
      }

      await enrollmentRepository.insertEnrollment(
        {
          studentId: student.id,
          academicYearId: input.enrollment.academicYearId,
          classId: input.enrollment.classId,
          rollNumber: input.enrollment.rollNumber ?? null,
          enrolledDate: input.enrollment.enrolledDate,
          createdBy: context.userId,
        },
        client,
      );
    }

    await auditService.record(
      {
        userId: context.userId,
        action: 'CREATE',
        entityType: 'student',
        entityId: student.id,
        description: `Created student ${student.first_name_en} ${student.last_name_en}`,
        newValue: {
          studentCode: student.student_code,
          hasAccount: userId !== null,
          enrolled: Boolean(input.enrollment),
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );

    return student;
  });

  return getById(created.id);
};

/**
 * The enrolment status that matches a student who has stopped attending. A
 * student who leaves must not keep an ACTIVE enrolment: the enrolment is what
 * puts them on the class roster, the attendance sheet and the report card, so
 * leaving it open would keep an inactive student showing up everywhere.
 *
 * Returns null for a status that does not end attendance — ACTIVE is deliberate,
 * because re-enrolling has to name a class and is therefore an explicit action.
 */
export const enrollmentStatusForStudentStatus = (
  status: StudentRow['status'],
): 'WITHDRAWN' | 'TRANSFERRED' | 'COMPLETED' | null => {
  switch (status) {
    case 'INACTIVE':
    case 'WITHDRAWN':
      return 'WITHDRAWN';
    case 'TRANSFERRED':
      return 'TRANSFERRED';
    case 'GRADUATED':
      return 'COMPLETED';
    default:
      return null;
  }
};

export const update = async (
  id: number,
  input: UpdateStudentInput,
  context: AuditContext,
): Promise<StudentDto> => {
  const existing = await repository.findStudentById(id);

  if (!existing) {
    throw AppError.notFound('Student not found', 'STUDENT_NOT_FOUND');
  }

  if (input.studentCode) {
    const duplicate = await repository.findStudentByCode(input.studentCode, id);

    if (duplicate) {
      throw AppError.conflict('A student with this code already exists', 'STUDENT_CODE_TAKEN');
    }
  }

  const { oldValue, newValue } = auditService.diff(
    {
      studentCode: existing.student_code,
      firstNameEn: existing.first_name_en,
      lastNameEn: existing.last_name_en,
      firstNameKh: existing.first_name_kh,
      lastNameKh: existing.last_name_kh,
      gender: existing.gender,
      dateOfBirth: existing.date_of_birth,
      phoneNumber: existing.phone_number,
      email: existing.email,
      currentAddress: existing.current_address,
      status: existing.status,
    },
    input,
  );

  const leavingStatus =
    input.status && input.status !== existing.status
      ? enrollmentStatusForStudentStatus(input.status)
      : null;

  await withTransaction(async (client) => {
    await repository.updateStudent(id, input, client);

    // Keep the enrolment in step with the student. Without this a student set to
    // INACTIVE stays on the class roster and the attendance sheet.
    if (leavingStatus) {
      const current = await enrollmentRepository.findCurrentEnrollment(id, client);

      if (current) {
        await enrollmentRepository.closeEnrollment(
          current.id,
          leavingStatus,
          null,
          `Student marked ${input.status}`,
          client,
        );
      }
    }

    await auditService.record(
      {
        userId: context.userId,
        action: 'UPDATE',
        entityType: 'student',
        entityId: id,
        description: `Updated student ${existing.first_name_en} ${existing.last_name_en}`,
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
 * Archives a student. Enrollments, attendance and grades are deliberately left in
 * place — this is a soft delete, never a destructive one.
 */
export const archive = async (id: number, context: AuditContext): Promise<void> => {
  const existing = await repository.findStudentById(id);

  if (!existing) {
    throw AppError.notFound('Student not found', 'STUDENT_NOT_FOUND');
  }

  await withTransaction(async (client) => {
    const current = await enrollmentRepository.findCurrentEnrollment(id, client);

    if (current) {
      await enrollmentRepository.closeEnrollment(
        current.id,
        'WITHDRAWN',
        null,
        'Student archived',
        client,
      );
    }

    await repository.updateStudent(id, { status: 'INACTIVE' }, client);
    await repository.softDeleteStudent(id, client);

    if (existing.user_id) {
      await userRepository.updateUserStatus(existing.user_id, 'INACTIVE', client);
    }

    await auditService.record(
      {
        userId: context.userId,
        action: 'ARCHIVE',
        entityType: 'student',
        entityId: id,
        description: `Archived student ${existing.first_name_en} ${existing.last_name_en}`,
        oldValue: { status: existing.status },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });
};

export const restore = async (id: number, context: AuditContext): Promise<StudentDto> => {
  const restored = await repository.restoreStudent(id);

  if (!restored) {
    throw AppError.notFound('Archived student not found', 'STUDENT_NOT_FOUND');
  }

  await auditService.record({
    userId: context.userId,
    action: 'RESTORE',
    entityType: 'student',
    entityId: id,
    description: 'Restored an archived student',
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });

  return getById(id);
};

// ---------------------------------------------------------------------------
// Guardians
// ---------------------------------------------------------------------------

export const listParents = async (studentId: number): Promise<StudentParentDto[]> => {
  await getById(studentId);

  const rows = await repository.findStudentParents(studentId);
  return rows.map(toParentDto);
};

export const linkParent = async (
  studentId: number,
  input: {
    parentId: number;
    relationship?: string;
    isPrimaryContact?: boolean;
    isEmergencyContact?: boolean;
    canPickUp?: boolean;
  },
  context: AuditContext,
): Promise<StudentParentDto[]> => {
  const student = await repository.findStudentById(studentId);

  if (!student) {
    throw AppError.notFound('Student not found', 'STUDENT_NOT_FOUND');
  }

  await withTransaction(async (client) => {
    await repository.upsertStudentParent(studentId, input, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'ASSIGN',
        entityType: 'student_parent',
        entityId: studentId,
        description: `Linked a guardian to ${student.first_name_en} ${student.last_name_en}`,
        newValue: { parentId: input.parentId, relationship: input.relationship ?? 'OTHER' },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });

  return listParents(studentId);
};

/** Removes the link only — neither the student nor the guardian is deleted. */
export const unlinkParent = async (
  studentId: number,
  parentId: number,
  context: AuditContext,
): Promise<void> => {
  const student = await repository.findStudentById(studentId);

  if (!student) {
    throw AppError.notFound('Student not found', 'STUDENT_NOT_FOUND');
  }

  const removed = await withTransaction(async (client) => {
    const result = await repository.deleteStudentParent(studentId, parentId, client);

    if (result) {
      await auditService.record(
        {
          userId: context.userId,
          action: 'UNASSIGN',
          entityType: 'student_parent',
          entityId: studentId,
          description: `Removed a guardian from ${student.first_name_en} ${student.last_name_en}`,
          oldValue: { parentId },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        client,
      );
    }

    return result;
  });

  if (!removed) {
    throw AppError.notFound(
      'This guardian is not linked to the student',
      'STUDENT_PARENT_NOT_FOUND',
    );
  }
};

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export const listEnrollmentHistory = async (
  studentId: number,
): Promise<StudentEnrollmentHistoryDto[]> => {
  await getById(studentId);

  const rows = await repository.findEnrollmentHistory(studentId);
  return rows.map(toHistoryDto);
};

export const createAccount = async (
  id: number,
  account: { username: string; email: string; password: string },
  context: AuditContext,
): Promise<StudentDto> => {
  const existing = await repository.findStudentById(id);

  if (!existing) {
    throw AppError.notFound('Student not found', 'STUDENT_NOT_FOUND');
  }

  if (existing.user_id) {
    throw AppError.conflict('This student already has an account', 'STUDENT_HAS_ACCOUNT');
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

    const roles = await userRepository.findRolesByCodes(['STUDENT'], client);
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
        description: `Created an account for student ${existing.first_name_en} ${existing.last_name_en}`,
        newValue: { username: account.username },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });

  return getById(id);
};

export const statusBreakdown = async () => repository.countStudentsByStatus();

// ---------------------------------------------------------------------------
// Profile photo
// ---------------------------------------------------------------------------

/**
 * Stores a new profile photo on Cloudinary and points the student at it.
 *
 * The upload happens before the database write: if Cloudinary refuses the
 * image the student keeps their old photo rather than losing it.
 */
export const setPhoto = async (
  id: number,
  photo: Buffer,
  context: AuditContext,
): Promise<StudentDto> => {
  const existing = await repository.findStudentById(id);

  if (!existing) {
    throw AppError.notFound('Student not found', 'STUDENT_NOT_FOUND');
  }

  const url = await photoService.uploadPhoto('students', id, photo);

  await withTransaction(async (client) => {
    await repository.updateStudent(id, { profilePhoto: url }, client);
    await auditService.record(
      {
        userId: context.userId,
        action: 'UPDATE',
        entityType: 'student',
        entityId: id,
        description: `Changed the photo of student ${existing.first_name_en} ${existing.last_name_en}`,
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

export const removePhoto = async (id: number, context: AuditContext): Promise<StudentDto> => {
  const existing = await repository.findStudentById(id);

  if (!existing) {
    throw AppError.notFound('Student not found', 'STUDENT_NOT_FOUND');
  }

  if (existing.profile_photo) {
    await withTransaction(async (client) => {
      await repository.updateStudent(id, { profilePhoto: null }, client);
      await auditService.record(
        {
          userId: context.userId,
          action: 'UPDATE',
          entityType: 'student',
          entityId: id,
          description: `Removed the photo of student ${existing.first_name_en} ${existing.last_name_en}`,
          oldValue: { profilePhoto: existing.profile_photo },
          newValue: { profilePhoto: null },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        client,
      );
    });

    // Only once the database no longer refers to it.
    await photoService.deletePhoto('students', id);
  }

  return getById(id);
};
