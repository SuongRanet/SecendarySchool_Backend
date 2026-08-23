import type { NotificationType } from '../../types';

export interface NotificationRow {
  id: number;
  recipient_id: number;
  type: NotificationType;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: number | null;
  action_url: string | null;
  read_at: Date | null;
  archived_at: Date | null;
  created_at: Date;
}

export interface NotificationDto {
  id: number;
  recipientId: number;
  type: NotificationType;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: number | null;
  actionUrl: string | null;
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
}

export interface CreateNotificationInput {
  type: NotificationType;
  title: string;
  body?: string | null;
  entityType?: string | null;
  entityId?: number | null;
  actionUrl?: string | null;
  createdBy?: number | null;
  /** Explicit recipients. */
  userIds?: number[];
  /** Or resolve recipients from an audience. */
  audience?: {
    scope: 'ALL' | 'TEACHERS' | 'PARENTS' | 'STUDENTS' | 'GRADE' | 'CLASS';
    gradeLevelId?: number | null;
    classId?: number | null;
  };
}

export interface NotificationFilters {
  isRead?: boolean;
  type?: NotificationType;
}
