import { withTransaction } from '../../database/connection';
import type { AuditContext } from '../../types';
import { AppError } from '../../utils/app-error';
import * as auditService from '../audit/audit.service';
import * as repository from './grade-level.repository';
import type {
  CreateGradeLevelInput,
  GradeLevelDto,
  GradeLevelFilters,
  GradeLevelRow,
  UpdateGradeLevelInput,
} from './grade-level.types';

const toDto = (row: GradeLevelRow): GradeLevelDto => ({
  id: row.id,
  code: row.code,
  nameEn: row.name_en,
  nameKh: row.name_kh,
  levelOrder: row.level_order,
  description: row.description,
  isActive: row.is_active,
  classCount: row.class_count ?? 0,
  studentCount: row.student_count ?? 0,
});

export const list = async (filters: GradeLevelFilters): Promise<GradeLevelDto[]> => {
  const rows = await repository.findGradeLevels(filters);
  return rows.map(toDto);
};

export const getById = async (id: number): Promise<GradeLevelDto> => {
  const row = await repository.findGradeLevelById(id);

  if (!row) {
    throw AppError.notFound('Grade level not found', 'GRADE_LEVEL_NOT_FOUND');
  }

  return toDto(row);
};

const assertNoConflict = async (
  code: string | undefined,
  levelOrder: number | undefined,
  excludeId?: number,
): Promise<void> => {
  const conflict = await repository.findConflictingGradeLevel(code, levelOrder, excludeId);

  if (!conflict) {
    return;
  }

  if (code && conflict.code.toLowerCase() === code.toLowerCase()) {
    throw AppError.conflict('A grade level with this code already exists', 'GRADE_LEVEL_CODE_TAKEN');
  }

  throw AppError.conflict(
    `Display order ${levelOrder} is already used by ${conflict.name_en}`,
    'GRADE_LEVEL_ORDER_TAKEN',
  );
};

export const create = async (
  input: CreateGradeLevelInput,
  context: AuditContext,
): Promise<GradeLevelDto> => {
  await assertNoConflict(input.code, input.levelOrder);

  const created = await withTransaction(async (client) => {
    const row = await repository.insertGradeLevel(input, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'CREATE',
        entityType: 'grade_level',
        entityId: row.id,
        description: `Created grade level ${row.name_en}`,
        newValue: { code: row.code, nameEn: row.name_en, levelOrder: row.level_order },
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
  input: UpdateGradeLevelInput,
  context: AuditContext,
): Promise<GradeLevelDto> => {
  const existing = await repository.findGradeLevelById(id);

  if (!existing) {
    throw AppError.notFound('Grade level not found', 'GRADE_LEVEL_NOT_FOUND');
  }

  await assertNoConflict(input.code, input.levelOrder, id);

  const { oldValue, newValue } = auditService.diff(
    {
      code: existing.code,
      nameEn: existing.name_en,
      nameKh: existing.name_kh,
      levelOrder: existing.level_order,
      description: existing.description,
      isActive: existing.is_active,
    },
    input,
  );

  await withTransaction(async (client) => {
    await repository.updateGradeLevel(id, input, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'UPDATE',
        entityType: 'grade_level',
        entityId: id,
        description: `Updated grade level ${existing.name_en}`,
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
 * Archives a grade level. A grade that still has classes keeps its history, so
 * archiving is refused while classes reference it.
 */
export const archive = async (id: number, context: AuditContext): Promise<void> => {
  const existing = await repository.findGradeLevelById(id);

  if (!existing) {
    throw AppError.notFound('Grade level not found', 'GRADE_LEVEL_NOT_FOUND');
  }

  if ((existing.class_count ?? 0) > 0) {
    throw AppError.conflict(
      'This grade level still has classes and cannot be archived. Deactivate it instead.',
      'GRADE_LEVEL_IN_USE',
    );
  }

  await withTransaction(async (client) => {
    await repository.softDeleteGradeLevel(id, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'ARCHIVE',
        entityType: 'grade_level',
        entityId: id,
        description: `Archived grade level ${existing.name_en}`,
        oldValue: { isActive: existing.is_active },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });
};

export const reorder = async (
  order: { id: number; levelOrder: number }[],
  context: AuditContext,
): Promise<GradeLevelDto[]> => {
  const uniqueOrders = new Set(order.map((item) => item.levelOrder));

  if (uniqueOrders.size !== order.length) {
    throw AppError.badRequest('Each grade level needs a distinct display order', 'DUPLICATE_ORDER');
  }

  await withTransaction(async (client) => {
    await repository.reorderGradeLevels(order, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'UPDATE',
        entityType: 'grade_level',
        description: 'Reordered grade levels',
        newValue: { order },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });

  return list({});
};
