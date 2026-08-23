import { withTransaction } from '../../database/connection';
import type { AuditContext, PaginatedResult, PaginationParams, SortParams } from '../../types';
import { AppError } from '../../utils/app-error';
import { buildYearPrefix, generateSequentialCode } from '../../utils/code-generator';
import { hashPassword } from '../../utils/password';
import * as auditService from '../audit/audit.service';
import * as studentRepository from '../students/student.repository';
import * as userRepository from '../users/user.repository';
import * as repository from './parent.repository';
import type { ParentSortColumn } from './parent.repository';
import type {
  CreateParentInput,
  ParentChildDto,
  ParentChildRow,
  ParentDto,
  ParentFilters,
  ParentRow,
  UpdateParentInput,
} from './parent.types';

const toDto = (row: ParentRow): ParentDto => ({
  id: row.id,
  userId: row.user_id,
  username: row.username ?? null,
  parentCode: row.parent_code,
  firstNameEn: row.first_name_en,
  lastNameEn: row.last_name_en,
  firstNameKh: row.first_name_kh,
  lastNameKh: row.last_name_kh,
  fullName: `${row.first_name_en} ${row.last_name_en}`.trim(),
  gender: row.gender,
  dateOfBirth: row.date_of_birth,
  nationalId: row.national_id,
  phoneNumber: row.phone_number,
  alternatePhone: row.alternate_phone,
  email: row.email,
  occupation: row.occupation,
  workplace: row.workplace,
  address: row.address,
  province: row.province,
  profilePhoto: row.profile_photo,
  isActive: row.is_active,
  childrenCount: row.children_count ?? 0,
  // Exposed so a list showing archived records can mark them and offer a restore.
  archivedAt: row.deleted_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toChildDto = (row: ParentChildRow): ParentChildDto => ({
  linkId: row.link_id,
  studentId: row.student_id,
  studentCode: row.student_code,
  firstNameEn: row.first_name_en,
  lastNameEn: row.last_name_en,
  fullName: `${row.first_name_en} ${row.last_name_en}`.trim(),
  fullNameKh:
    row.first_name_kh || row.last_name_kh
      ? `${row.first_name_kh ?? ''} ${row.last_name_kh ?? ''}`.trim()
      : null,
  gender: row.gender,
  dateOfBirth: row.date_of_birth,
  profilePhoto: row.profile_photo,
  status: row.status,
  relationship: row.relationship,
  isPrimaryContact: row.is_primary_contact,
  isEmergencyContact: row.is_emergency_contact,
  canPickUp: row.can_pick_up,
  currentClassId: row.current_class_id,
  currentClassName: row.current_class_name,
  currentGradeLevelName: row.current_grade_level_name,
  currentAcademicYearId: row.current_academic_year_id,
  currentAcademicYearName: row.current_academic_year_name,
});

export const list = async (
  filters: ParentFilters,
  pagination: PaginationParams,
  sort: SortParams<ParentSortColumn>,
): Promise<PaginatedResult<ParentDto>> => {
  const result = await repository.findParents(filters, pagination, sort);

  return { rows: result.rows.map(toDto), total: result.total };
};

export const listAll = async (filters: ParentFilters = {}): Promise<ParentDto[]> => {
  const rows = await repository.findAllParents({ isActive: true, ...filters });
  return rows.map(toDto);
};

export const getById = async (id: number): Promise<ParentDto> => {
  const row = await repository.findParentById(id);

  if (!row) {
    throw AppError.notFound('Guardian not found', 'PARENT_NOT_FOUND');
  }

  return toDto(row);
};

export const getByUserId = async (userId: number): Promise<ParentDto | null> => {
  const row = await repository.findParentByUserId(userId);
  return row ? toDto(row) : null;
};

export const create = async (
  input: CreateParentInput,
  context: AuditContext,
): Promise<ParentDto> => {
  if (input.parentCode) {
    const duplicate = await repository.findParentByCode(input.parentCode);

    if (duplicate) {
      throw AppError.conflict('A guardian with this code already exists', 'PARENT_CODE_TAKEN');
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

      const roles = await userRepository.findRolesByCodes(['PARENT'], client);
      await userRepository.replaceUserRoles(
        user.id,
        roles.map((role) => role.id),
        context.userId,
        client,
      );

      userId = user.id;
    }

    const parentCode =
      input.parentCode ??
      (await generateSequentialCode('parents', 'parent_code', buildYearPrefix('PAR'), client));

    const parent = await repository.insertParent({ ...input, parentCode, userId }, client);

    for (const child of input.children ?? []) {
      await studentRepository.upsertStudentParent(
        child.studentId,
        {
          parentId: parent.id,
          relationship: child.relationship,
          isPrimaryContact: child.isPrimaryContact,
          isEmergencyContact: child.isEmergencyContact,
        },
        client,
      );
    }

    await auditService.record(
      {
        userId: context.userId,
        action: 'CREATE',
        entityType: 'parent',
        entityId: parent.id,
        description: `Created guardian ${parent.first_name_en} ${parent.last_name_en}`,
        newValue: {
          parentCode: parent.parent_code,
          hasAccount: userId !== null,
          children: input.children?.map((child) => child.studentId) ?? [],
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );

    return parent;
  });

  return getById(created.id);
};

export const update = async (
  id: number,
  input: UpdateParentInput,
  context: AuditContext,
): Promise<ParentDto> => {
  const existing = await repository.findParentById(id);

  if (!existing) {
    throw AppError.notFound('Guardian not found', 'PARENT_NOT_FOUND');
  }

  if (input.parentCode) {
    const duplicate = await repository.findParentByCode(input.parentCode, id);

    if (duplicate) {
      throw AppError.conflict('A guardian with this code already exists', 'PARENT_CODE_TAKEN');
    }
  }

  const { oldValue, newValue } = auditService.diff(
    {
      parentCode: existing.parent_code,
      firstNameEn: existing.first_name_en,
      lastNameEn: existing.last_name_en,
      phoneNumber: existing.phone_number,
      email: existing.email,
      occupation: existing.occupation,
      isActive: existing.is_active,
    },
    input,
  );

  await withTransaction(async (client) => {
    await repository.updateParent(id, input, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'UPDATE',
        entityType: 'parent',
        entityId: id,
        description: `Updated guardian ${existing.first_name_en} ${existing.last_name_en}`,
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
 * Archives a guardian. The links to their children are kept so a student's
 * guardian history is not lost; only the guardian record is hidden.
 */
export const archive = async (id: number, context: AuditContext): Promise<void> => {
  const existing = await repository.findParentById(id);

  if (!existing) {
    throw AppError.notFound('Guardian not found', 'PARENT_NOT_FOUND');
  }

  await withTransaction(async (client) => {
    await repository.softDeleteParent(id, client);

    if (existing.user_id) {
      await userRepository.updateUserStatus(existing.user_id, 'INACTIVE', client);
    }

    await auditService.record(
      {
        userId: context.userId,
        action: 'ARCHIVE',
        entityType: 'parent',
        entityId: id,
        description: `Archived guardian ${existing.first_name_en} ${existing.last_name_en}`,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });
};

export const listChildren = async (parentId: number): Promise<ParentChildDto[]> => {
  await getById(parentId);

  const rows = await repository.findParentChildren(parentId);
  return rows.map(toChildDto);
};

export const linkChild = async (
  parentId: number,
  input: {
    studentId: number;
    relationship?: string;
    isPrimaryContact?: boolean;
    isEmergencyContact?: boolean;
    canPickUp?: boolean;
  },
  context: AuditContext,
): Promise<ParentChildDto[]> => {
  const parent = await repository.findParentById(parentId);

  if (!parent) {
    throw AppError.notFound('Guardian not found', 'PARENT_NOT_FOUND');
  }

  const student = await studentRepository.findStudentById(input.studentId);

  if (!student) {
    throw AppError.badRequest('The selected student does not exist', 'STUDENT_NOT_FOUND');
  }

  await withTransaction(async (client) => {
    await studentRepository.upsertStudentParent(
      input.studentId,
      { ...input, parentId },
      client,
    );

    await auditService.record(
      {
        userId: context.userId,
        action: 'ASSIGN',
        entityType: 'student_parent',
        entityId: parentId,
        description: `Linked ${student.first_name_en} ${student.last_name_en} to guardian ${parent.first_name_en} ${parent.last_name_en}`,
        newValue: { studentId: input.studentId, relationship: input.relationship ?? 'OTHER' },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });

  return listChildren(parentId);
};

export const unlinkChild = async (
  parentId: number,
  studentId: number,
  context: AuditContext,
): Promise<void> => {
  const parent = await repository.findParentById(parentId);

  if (!parent) {
    throw AppError.notFound('Guardian not found', 'PARENT_NOT_FOUND');
  }

  const removed = await withTransaction(async (client) => {
    const result = await studentRepository.deleteStudentParent(studentId, parentId, client);

    if (result) {
      await auditService.record(
        {
          userId: context.userId,
          action: 'UNASSIGN',
          entityType: 'student_parent',
          entityId: parentId,
          description: `Removed a child from guardian ${parent.first_name_en} ${parent.last_name_en}`,
          oldValue: { studentId },
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
      'This student is not linked to the guardian',
      'STUDENT_PARENT_NOT_FOUND',
    );
  }
};

export const createAccount = async (
  id: number,
  account: { username: string; email: string; password: string },
  context: AuditContext,
): Promise<ParentDto> => {
  const existing = await repository.findParentById(id);

  if (!existing) {
    throw AppError.notFound('Guardian not found', 'PARENT_NOT_FOUND');
  }

  if (existing.user_id) {
    throw AppError.conflict('This guardian already has an account', 'PARENT_HAS_ACCOUNT');
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

    const roles = await userRepository.findRolesByCodes(['PARENT'], client);
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
        description: `Created an account for guardian ${existing.first_name_en} ${existing.last_name_en}`,
        newValue: { username: account.username },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });

  return getById(id);
};

/**
 * Brings an archived parent back into the active list.
 *
 * Archiving is reversible on purpose: it is a soft delete, and an administrator
 * who archived the wrong person needs a way back that does not touch history.
 */
export const restore = async (id: number, context: AuditContext): Promise<ParentDto> => {
  const restored = await repository.restoreParent(id);

  if (!restored) {
    throw AppError.notFound('Archived parent not found', 'PARENT_NOT_FOUND');
  }

  await auditService.record({
    userId: context.userId,
    action: 'RESTORE',
    entityType: 'parent',
    entityId: id,
    description: 'Restored an archived parent',
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });

  return getById(id);
};
