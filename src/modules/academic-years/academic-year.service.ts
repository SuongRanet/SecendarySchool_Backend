import { withTransaction } from '../../database/connection';
import type { Queryable } from '../../database/connection';
import type { AuditContext, PaginatedResult, PaginationParams, SortParams } from '../../types';
import { AppError } from '../../utils/app-error';
import * as auditService from '../audit/audit.service';
import * as repository from './academic-year.repository';
import type { AcademicYearSortColumn } from './academic-year.repository';
import type {
  AcademicTermDto,
  AcademicTermRow,
  AcademicYearDto,
  AcademicYearFilters,
  AcademicYearRow,
  CreateAcademicTermInput,
  CreateAcademicYearInput,
  UpdateAcademicYearInput,
} from './academic-year.types';

const toDto = (row: AcademicYearRow): AcademicYearDto => ({
  id: row.id,
  name: row.name,
  startDate: row.start_date,
  endDate: row.end_date,
  status: row.status,
  isActive: row.is_active,
  closedAt: row.closed_at,
  classCount: row.class_count ?? 0,
  enrollmentCount: row.enrollment_count ?? 0,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toTermDto = (row: AcademicTermRow): AcademicTermDto => ({
  id: row.id,
  academicYearId: row.academic_year_id,
  name: row.name,
  termOrder: row.term_order,
  startDate: row.start_date,
  endDate: row.end_date,
  isActive: row.is_active,
});

/**
 * Loads a year and refuses the operation when it is closed. Closed years are
 * historical records: they stay readable but can no longer be edited.
 */
export const requireEditableYear = async (
  id: number,
  executor?: Queryable,
): Promise<AcademicYearRow> => {
  const year = await repository.findAcademicYearById(id, executor);

  if (!year) {
    throw AppError.notFound('Academic year not found', 'ACADEMIC_YEAR_NOT_FOUND');
  }

  if (year.status === 'CLOSED') {
    throw AppError.conflict(
      `Academic year ${year.name} is closed and can no longer be modified`,
      'ACADEMIC_YEAR_CLOSED',
    );
  }

  return year;
};

/** Resolves the year to use when a request does not name one explicitly. */
export const requireActiveYear = async (executor?: Queryable): Promise<AcademicYearRow> => {
  const year = await repository.findActiveAcademicYear(executor);

  if (!year) {
    throw AppError.conflict(
      'No academic year is active. Set an active academic year first.',
      'NO_ACTIVE_ACADEMIC_YEAR',
    );
  }

  return year;
};

export const list = async (
  filters: AcademicYearFilters,
  pagination: PaginationParams,
  sort: SortParams<AcademicYearSortColumn>,
): Promise<PaginatedResult<AcademicYearDto>> => {
  const result = await repository.findAcademicYears(filters, pagination, sort);

  return { rows: result.rows.map(toDto), total: result.total };
};

export const listAll = async (): Promise<AcademicYearDto[]> => {
  const rows = await repository.findAllAcademicYears();
  return rows.map(toDto);
};

export const getById = async (id: number): Promise<AcademicYearDto> => {
  const row = await repository.findAcademicYearById(id);

  if (!row) {
    throw AppError.notFound('Academic year not found', 'ACADEMIC_YEAR_NOT_FOUND');
  }

  return toDto(row);
};

export const getActive = async (): Promise<AcademicYearDto | null> => {
  const row = await repository.findActiveAcademicYear();
  return row ? toDto(row) : null;
};

const assertValidRange = (startDate: string, endDate: string): void => {
  if (new Date(endDate).getTime() <= new Date(startDate).getTime()) {
    throw AppError.validation('Validation failed', [
      { field: 'endDate', message: 'The end date must be after the start date' },
    ]);
  }
};

export const create = async (
  input: CreateAcademicYearInput,
  context: AuditContext,
): Promise<AcademicYearDto> => {
  assertValidRange(input.startDate, input.endDate);

  const duplicate = await repository.findAcademicYearByName(input.name);

  if (duplicate) {
    throw AppError.conflict('An academic year with this name already exists', 'ACADEMIC_YEAR_EXISTS');
  }

  const overlapping = await repository.findOverlappingAcademicYear(input.startDate, input.endDate);

  if (overlapping) {
    throw AppError.conflict(
      `The date range overlaps academic year ${overlapping.name}`,
      'ACADEMIC_YEAR_OVERLAP',
    );
  }

  const created = await withTransaction(async (client) => {
    if (input.setActive) {
      await repository.deactivateAllAcademicYears(client);
    }

    const row = await repository.insertAcademicYear(input, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'CREATE',
        entityType: 'academic_year',
        entityId: row.id,
        description: `Created academic year ${row.name}`,
        newValue: { name: row.name, startDate: row.start_date, endDate: row.end_date },
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
  input: UpdateAcademicYearInput,
  context: AuditContext,
): Promise<AcademicYearDto> => {
  const existing = await requireEditableYear(id);

  const startDate = input.startDate ?? existing.start_date;
  const endDate = input.endDate ?? existing.end_date;
  assertValidRange(startDate, endDate);

  if (input.name) {
    const duplicate = await repository.findAcademicYearByName(input.name, id);

    if (duplicate) {
      throw AppError.conflict(
        'An academic year with this name already exists',
        'ACADEMIC_YEAR_EXISTS',
      );
    }
  }

  if (input.startDate || input.endDate) {
    const overlapping = await repository.findOverlappingAcademicYear(startDate, endDate, id);

    if (overlapping) {
      throw AppError.conflict(
        `The date range overlaps academic year ${overlapping.name}`,
        'ACADEMIC_YEAR_OVERLAP',
      );
    }
  }

  const { oldValue, newValue } = auditService.diff(
    { name: existing.name, startDate: existing.start_date, endDate: existing.end_date },
    input,
  );

  await withTransaction(async (client) => {
    await repository.updateAcademicYear(id, input, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'UPDATE',
        entityType: 'academic_year',
        entityId: id,
        description: `Updated academic year ${existing.name}`,
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

/** Makes one year the active one; only a single year may be active at a time. */
export const setActive = async (id: number, context: AuditContext): Promise<AcademicYearDto> => {
  const existing = await repository.findAcademicYearById(id);

  if (!existing) {
    throw AppError.notFound('Academic year not found', 'ACADEMIC_YEAR_NOT_FOUND');
  }

  if (existing.status === 'CLOSED') {
    throw AppError.conflict(
      'A closed academic year cannot be made active again',
      'ACADEMIC_YEAR_CLOSED',
    );
  }

  await withTransaction(async (client) => {
    await repository.deactivateAllAcademicYears(client);
    await repository.activateAcademicYear(id, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'UPDATE',
        entityType: 'academic_year',
        entityId: id,
        description: `Set ${existing.name} as the active academic year`,
        newValue: { isActive: true },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });

  return getById(id);
};

/**
 * Closes a year. Enrollments, grades and attendance are left exactly as they are —
 * closing only makes the year read-only.
 */
export const close = async (id: number, context: AuditContext): Promise<AcademicYearDto> => {
  const existing = await repository.findAcademicYearById(id);

  if (!existing) {
    throw AppError.notFound('Academic year not found', 'ACADEMIC_YEAR_NOT_FOUND');
  }

  if (existing.status === 'CLOSED') {
    return toDto(existing);
  }

  await withTransaction(async (client) => {
    await repository.closeAcademicYear(id, context.userId, client);

    await client.query(
      `UPDATE enrollments
          SET status = 'COMPLETED'::enrollment_status,
              end_date = COALESCE(end_date, (SELECT end_date FROM academic_years WHERE id = $1))
        WHERE academic_year_id = $1 AND status = 'ACTIVE'`,
      [id],
    );

    await auditService.record(
      {
        userId: context.userId,
        action: 'UPDATE',
        entityType: 'academic_year',
        entityId: id,
        description: `Closed academic year ${existing.name}`,
        oldValue: { status: existing.status },
        newValue: { status: 'CLOSED' },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });

  return getById(id);
};

/** A year may only be deleted while it holds no classes and no enrollments. */
export const remove = async (id: number, context: AuditContext): Promise<void> => {
  const existing = await repository.findAcademicYearById(id);

  if (!existing) {
    throw AppError.notFound('Academic year not found', 'ACADEMIC_YEAR_NOT_FOUND');
  }

  if ((existing.class_count ?? 0) > 0 || (existing.enrollment_count ?? 0) > 0) {
    throw AppError.conflict(
      'This academic year has classes or enrollments and cannot be deleted. Close it instead.',
      'ACADEMIC_YEAR_IN_USE',
    );
  }

  await withTransaction(async (client) => {
    await repository.deleteAcademicYear(id, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'DELETE',
        entityType: 'academic_year',
        entityId: id,
        description: `Deleted academic year ${existing.name}`,
        oldValue: { name: existing.name },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });
};

// ---------------------------------------------------------------------------
// Terms
// ---------------------------------------------------------------------------

export const listTerms = async (academicYearId: number): Promise<AcademicTermDto[]> => {
  const rows = await repository.findTermsByYear(academicYearId);
  return rows.map(toTermDto);
};

export const createTerm = async (
  academicYearId: number,
  input: CreateAcademicTermInput,
  context: AuditContext,
): Promise<AcademicTermDto> => {
  const year = await requireEditableYear(academicYearId);
  assertValidRange(input.startDate, input.endDate);

  if (
    new Date(input.startDate) < new Date(year.start_date) ||
    new Date(input.endDate) > new Date(year.end_date)
  ) {
    throw AppError.validation('Validation failed', [
      {
        field: 'startDate',
        message: `The term must fall inside ${year.start_date} – ${year.end_date}`,
      },
    ]);
  }

  const row = await withTransaction(async (client) => {
    const created = await repository.insertTerm(academicYearId, input, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'CREATE',
        entityType: 'academic_term',
        entityId: created.id,
        description: `Created term ${created.name} in ${year.name}`,
        newValue: { name: created.name, termOrder: created.term_order },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );

    return created;
  });

  return toTermDto(row);
};

export const updateTerm = async (
  termId: number,
  input: Partial<CreateAcademicTermInput>,
  context: AuditContext,
): Promise<AcademicTermDto> => {
  const term = await repository.findTermById(termId);

  if (!term) {
    throw AppError.notFound('Term not found', 'TERM_NOT_FOUND');
  }

  await requireEditableYear(term.academic_year_id);

  const startDate = input.startDate ?? term.start_date;
  const endDate = input.endDate ?? term.end_date;
  assertValidRange(startDate, endDate);

  const updated = await withTransaction(async (client) => {
    const row = await repository.updateTerm(termId, input, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'UPDATE',
        entityType: 'academic_term',
        entityId: termId,
        description: `Updated term ${term.name}`,
        oldValue: { name: term.name, startDate: term.start_date, endDate: term.end_date },
        newValue: input as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );

    return row;
  });

  if (!updated) {
    throw AppError.notFound('Term not found', 'TERM_NOT_FOUND');
  }

  return toTermDto(updated);
};

export const setActiveTerm = async (
  termId: number,
  context: AuditContext,
): Promise<AcademicTermDto> => {
  const term = await repository.findTermById(termId);

  if (!term) {
    throw AppError.notFound('Term not found', 'TERM_NOT_FOUND');
  }

  await withTransaction(async (client) => {
    await repository.activateTerm(termId, term.academic_year_id, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'UPDATE',
        entityType: 'academic_term',
        entityId: termId,
        description: `Set ${term.name} as the active term`,
        newValue: { isActive: true },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });

  const refreshed = await repository.findTermById(termId);
  return toTermDto(refreshed as AcademicTermRow);
};

export const removeTerm = async (termId: number, context: AuditContext): Promise<void> => {
  const term = await repository.findTermById(termId);

  if (!term) {
    throw AppError.notFound('Term not found', 'TERM_NOT_FOUND');
  }

  await requireEditableYear(term.academic_year_id);

  await withTransaction(async (client) => {
    await repository.deleteTerm(termId, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'DELETE',
        entityType: 'academic_term',
        entityId: termId,
        description: `Deleted term ${term.name}`,
        oldValue: { name: term.name },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });
};
