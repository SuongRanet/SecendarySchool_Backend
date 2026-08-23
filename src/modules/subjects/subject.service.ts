import { withTransaction } from '../../database/connection';
import type { AuditContext, PaginatedResult, PaginationParams, SortParams } from '../../types';
import { AppError } from '../../utils/app-error';
import * as auditService from '../audit/audit.service';
import * as repository from './subject.repository';
import type { SubjectSortColumn } from './subject.repository';
import type {
  CreateSubjectInput,
  SubjectDto,
  SubjectFilters,
  SubjectRow,
  UpdateSubjectInput,
} from './subject.types';

const toDto = (row: SubjectRow): SubjectDto => ({
  id: row.id,
  code: row.code,
  nameEn: row.name_en,
  nameKh: row.name_kh,
  description: row.description,
  isActive: row.is_active,
  gradeLevelIds: row.grade_level_ids ?? [],
  classCount: row.class_count ?? 0,
  teacherCount: row.teacher_count ?? 0,
});

export const list = async (
  filters: SubjectFilters,
  pagination: PaginationParams,
  sort: SortParams<SubjectSortColumn>,
): Promise<PaginatedResult<SubjectDto>> => {
  const result = await repository.findSubjects(filters, pagination, sort);

  return { rows: result.rows.map(toDto), total: result.total };
};

export const listAll = async (filters: SubjectFilters = {}): Promise<SubjectDto[]> => {
  const rows = await repository.findAllSubjects(filters);
  return rows.map(toDto);
};

export const getById = async (id: number): Promise<SubjectDto> => {
  const row = await repository.findSubjectById(id);

  if (!row) {
    throw AppError.notFound('Subject not found', 'SUBJECT_NOT_FOUND');
  }

  return toDto(row);
};

export const create = async (
  input: CreateSubjectInput,
  context: AuditContext,
): Promise<SubjectDto> => {
  const duplicate = await repository.findSubjectByCode(input.code);

  if (duplicate) {
    throw AppError.conflict('A subject with this code already exists', 'SUBJECT_CODE_TAKEN');
  }

  const created = await withTransaction(async (client) => {
    const row = await repository.insertSubject(input, client);

    if (input.gradeLevelIds) {
      await repository.replaceGradeLevels(row.id, input.gradeLevelIds, client);
    }

    await auditService.record(
      {
        userId: context.userId,
        action: 'CREATE',
        entityType: 'subject',
        entityId: row.id,
        description: `Created subject ${row.name_en}`,
        newValue: { code: row.code, nameEn: row.name_en, gradeLevelIds: input.gradeLevelIds ?? [] },
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
  input: UpdateSubjectInput,
  context: AuditContext,
): Promise<SubjectDto> => {
  const existing = await repository.findSubjectById(id);

  if (!existing) {
    throw AppError.notFound('Subject not found', 'SUBJECT_NOT_FOUND');
  }

  if (input.code) {
    const duplicate = await repository.findSubjectByCode(input.code, id);

    if (duplicate) {
      throw AppError.conflict('A subject with this code already exists', 'SUBJECT_CODE_TAKEN');
    }
  }

  const { oldValue, newValue } = auditService.diff(
    {
      code: existing.code,
      nameEn: existing.name_en,
      nameKh: existing.name_kh,
      description: existing.description,
      isActive: existing.is_active,
      gradeLevelIds: existing.grade_level_ids ?? [],
    },
    input,
  );

  await withTransaction(async (client) => {
    await repository.updateSubject(id, input, client);

    if (input.gradeLevelIds) {
      await repository.replaceGradeLevels(id, input.gradeLevelIds, client);
    }

    await auditService.record(
      {
        userId: context.userId,
        action: 'UPDATE',
        entityType: 'subject',
        entityId: id,
        description: `Updated subject ${existing.name_en}`,
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
 * Archives a subject. Assessments, grades and schedules that reference it stay
 * exactly as they are — only new use of the subject is prevented.
 */
export const archive = async (id: number, context: AuditContext): Promise<void> => {
  const existing = await repository.findSubjectById(id);

  if (!existing) {
    throw AppError.notFound('Subject not found', 'SUBJECT_NOT_FOUND');
  }

  const activeUsage = await repository.countActiveClassSubjects(id);

  if (activeUsage > 0) {
    throw AppError.conflict(
      'This subject is taught in classes of an open academic year and cannot be archived',
      'SUBJECT_IN_USE',
    );
  }

  await withTransaction(async (client) => {
    await repository.softDeleteSubject(id, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'ARCHIVE',
        entityType: 'subject',
        entityId: id,
        description: `Archived subject ${existing.name_en}`,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });
};

export const setActive = async (
  id: number,
  isActive: boolean,
  context: AuditContext,
): Promise<SubjectDto> => update(id, { isActive }, context);
