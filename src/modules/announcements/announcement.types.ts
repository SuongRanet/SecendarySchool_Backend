import type { AnnouncementAudience, AnnouncementStatus } from '../../types';

export interface AnnouncementRow {
  id: number;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  grade_level_id: number | null;
  class_id: number | null;
  academic_year_id: number | null;
  status: AnnouncementStatus;
  is_pinned: boolean;
  publish_at: Date | null;
  published_at: Date | null;
  expires_at: Date | null;
  archived_at: Date | null;
  attachment_url: string | null;
  created_by: number | null;
  published_by: number | null;
  created_at: Date;
  updated_at: Date;
  grade_level_name?: string | null;
  class_name?: string | null;
  created_by_name?: string | null;
}

export interface AnnouncementDto {
  id: number;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  gradeLevelId: number | null;
  gradeLevelName: string | null;
  classId: number | null;
  className: string | null;
  status: AnnouncementStatus;
  isPinned: boolean;
  publishAt: Date | null;
  publishedAt: Date | null;
  expiresAt: Date | null;
  attachmentUrl: string | null;
  createdByName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAnnouncementInput {
  title: string;
  body: string;
  audience: AnnouncementAudience;
  gradeLevelId?: number | null;
  classId?: number | null;
  isPinned?: boolean;
  publishAt?: string | null;
  expiresAt?: string | null;
  attachmentUrl?: string | null;
  /** Publish immediately instead of saving as a draft. */
  publishNow?: boolean;
}

export type UpdateAnnouncementInput = Partial<Omit<CreateAnnouncementInput, 'publishNow'>>;

export interface AnnouncementFilters {
  search?: string;
  status?: AnnouncementStatus;
  audience?: AnnouncementAudience;
  classId?: number;
  gradeLevelId?: number;
  /** Restrict to announcements the given user is an audience of. */
  forUserId?: number;
}
