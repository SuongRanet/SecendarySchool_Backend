import { withTransaction } from '../../database/connection';
import type { AuditContext, PaginatedResult, PaginationParams } from '../../types';
import { AppError } from '../../utils/app-error';
import * as auditService from '../audit/audit.service';
import * as academicYearRepository from '../academic-years/academic-year.repository';
import * as notificationService from '../notifications/notification.service';
import * as repository from './announcement.repository';
import type {
  AnnouncementDto,
  AnnouncementFilters,
  AnnouncementRow,
  CreateAnnouncementInput,
  UpdateAnnouncementInput,
} from './announcement.types';

const toDto = (row: AnnouncementRow): AnnouncementDto => ({
  id: row.id,
  title: row.title,
  body: row.body,
  audience: row.audience,
  gradeLevelId: row.grade_level_id,
  gradeLevelName: row.grade_level_name ?? null,
  classId: row.class_id,
  className: row.class_name ?? null,
  status: row.status,
  isPinned: row.is_pinned,
  publishAt: row.publish_at,
  publishedAt: row.published_at,
  expiresAt: row.expires_at,
  attachmentUrl: row.attachment_url,
  createdByName: row.created_by_name ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const assertAudienceTarget = (input: {
  audience?: string;
  gradeLevelId?: number | null;
  classId?: number | null;
}): void => {
  if (input.audience === 'GRADE' && !input.gradeLevelId) {
    throw AppError.validation('Validation failed', [
      { field: 'gradeLevelId', message: 'Select a grade level for a grade announcement' },
    ]);
  }

  if (input.audience === 'CLASS' && !input.classId) {
    throw AppError.validation('Validation failed', [
      { field: 'classId', message: 'Select a class for a class announcement' },
    ]);
  }
};

/** Sends the notification that accompanies a published announcement. */
const notifyAudience = async (announcement: AnnouncementRow): Promise<void> => {
  await notificationService.dispatch({
    type: 'ANNOUNCEMENT',
    title: announcement.title,
    body: announcement.body.slice(0, 500),
    entityType: 'announcement',
    entityId: announcement.id,
    actionUrl: `/announcements/${announcement.id}`,
    createdBy: announcement.created_by,
    audience: {
      scope: announcement.audience,
      gradeLevelId: announcement.grade_level_id,
      classId: announcement.class_id,
    },
  });
};

export const list = async (
  filters: AnnouncementFilters,
  pagination: PaginationParams,
): Promise<PaginatedResult<AnnouncementDto>> => {
  const result = await repository.findAnnouncements(filters, pagination);

  return { rows: result.rows.map(toDto), total: result.total };
};

export const getById = async (id: number): Promise<AnnouncementDto> => {
  const row = await repository.findAnnouncementById(id);

  if (!row) {
    throw AppError.notFound('Announcement not found', 'ANNOUNCEMENT_NOT_FOUND');
  }

  return toDto(row);
};

export const create = async (
  input: CreateAnnouncementInput,
  context: AuditContext,
): Promise<AnnouncementDto> => {
  assertAudienceTarget(input);

  const activeYear = await academicYearRepository.findActiveAcademicYear();

  const created = await withTransaction(async (client) => {
    const row = await repository.insertAnnouncement(
      { ...input, academicYearId: activeYear?.id ?? null, createdBy: context.userId },
      client,
    );

    await auditService.record(
      {
        userId: context.userId,
        action: input.publishNow ? 'PUBLISH' : 'CREATE',
        entityType: 'announcement',
        entityId: row.id,
        description: `${input.publishNow ? 'Published' : 'Created'} announcement "${row.title}"`,
        newValue: { title: row.title, audience: row.audience, status: row.status },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );

    return row;
  });

  if (created.status === 'PUBLISHED') {
    await notifyAudience(created);
  }

  return toDto(created);
};

export const update = async (
  id: number,
  input: UpdateAnnouncementInput,
  context: AuditContext,
): Promise<AnnouncementDto> => {
  const existing = await repository.findAnnouncementById(id);

  if (!existing) {
    throw AppError.notFound('Announcement not found', 'ANNOUNCEMENT_NOT_FOUND');
  }

  assertAudienceTarget({
    audience: input.audience ?? existing.audience,
    gradeLevelId: input.gradeLevelId ?? existing.grade_level_id,
    classId: input.classId ?? existing.class_id,
  });

  const { oldValue, newValue } = auditService.diff(
    {
      title: existing.title,
      body: existing.body,
      audience: existing.audience,
      isPinned: existing.is_pinned,
    },
    input,
  );

  const updated = await withTransaction(async (client) => {
    const row = await repository.updateAnnouncement(id, input, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'UPDATE',
        entityType: 'announcement',
        entityId: id,
        description: `Updated announcement "${existing.title}"`,
        oldValue,
        newValue,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );

    return row;
  });

  if (!updated) {
    throw AppError.notFound('Announcement not found', 'ANNOUNCEMENT_NOT_FOUND');
  }

  return toDto(updated);
};

export const publish = async (id: number, context: AuditContext): Promise<AnnouncementDto> => {
  const existing = await repository.findAnnouncementById(id);

  if (!existing) {
    throw AppError.notFound('Announcement not found', 'ANNOUNCEMENT_NOT_FOUND');
  }

  if (existing.status === 'PUBLISHED') {
    return toDto(existing);
  }

  const published = await withTransaction(async (client) => {
    const row = await repository.setStatus(id, 'PUBLISHED', context.userId, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'PUBLISH',
        entityType: 'announcement',
        entityId: id,
        description: `Published announcement "${existing.title}"`,
        oldValue: { status: existing.status },
        newValue: { status: 'PUBLISHED' },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );

    return row;
  });

  if (published) {
    await notifyAudience(published);
    return toDto(published);
  }

  throw AppError.notFound('Announcement not found', 'ANNOUNCEMENT_NOT_FOUND');
};

export const archive = async (id: number, context: AuditContext): Promise<AnnouncementDto> => {
  const existing = await repository.findAnnouncementById(id);

  if (!existing) {
    throw AppError.notFound('Announcement not found', 'ANNOUNCEMENT_NOT_FOUND');
  }

  const archived = await withTransaction(async (client) => {
    const row = await repository.setStatus(id, 'ARCHIVED', context.userId, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'ARCHIVE',
        entityType: 'announcement',
        entityId: id,
        description: `Archived announcement "${existing.title}"`,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );

    return row;
  });

  if (!archived) {
    throw AppError.notFound('Announcement not found', 'ANNOUNCEMENT_NOT_FOUND');
  }

  return toDto(archived);
};

export const remove = async (id: number, context: AuditContext): Promise<void> => {
  const existing = await repository.findAnnouncementById(id);

  if (!existing) {
    throw AppError.notFound('Announcement not found', 'ANNOUNCEMENT_NOT_FOUND');
  }

  if (existing.status === 'PUBLISHED') {
    throw AppError.conflict(
      'A published announcement cannot be deleted. Archive it instead.',
      'ANNOUNCEMENT_PUBLISHED',
    );
  }

  await withTransaction(async (client) => {
    await repository.deleteAnnouncement(id, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'DELETE',
        entityType: 'announcement',
        entityId: id,
        description: `Deleted draft announcement "${existing.title}"`,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });
};

/**
 * Publishes any announcement whose scheduled time has passed and notifies its
 * audience. Called on demand so no background worker is required.
 */
export const releaseScheduled = async (): Promise<number> => {
  const published = await repository.publishDueAnnouncements();

  for (const announcement of published) {
    await notifyAudience(announcement);
  }

  return published.length;
};
