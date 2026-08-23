export interface SubjectRow {
  id: number;
  code: string;
  name_en: string;
  name_kh: string | null;
  description: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  grade_level_ids?: number[] | null;
  class_count?: number;
  teacher_count?: number;
}

export interface SubjectDto {
  id: number;
  code: string;
  nameEn: string;
  nameKh: string | null;
  description: string | null;
  isActive: boolean;
  gradeLevelIds: number[];
  classCount: number;
  teacherCount: number;
}

export interface CreateSubjectInput {
  code: string;
  nameEn: string;
  nameKh?: string | null;
  description?: string | null;
  isActive?: boolean;
  gradeLevelIds?: number[];
}

export type UpdateSubjectInput = Partial<CreateSubjectInput>;

export interface SubjectFilters {
  search?: string;
  isActive?: boolean;
  gradeLevelId?: number;
}
