export interface GradeLevelRow {
  id: number;
  code: string;
  name_en: string;
  name_kh: string | null;
  level_order: number;
  description: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  class_count?: number;
  student_count?: number;
}

export interface GradeLevelDto {
  id: number;
  code: string;
  nameEn: string;
  nameKh: string | null;
  levelOrder: number;
  description: string | null;
  isActive: boolean;
  classCount: number;
  studentCount: number;
}

export interface CreateGradeLevelInput {
  code: string;
  nameEn: string;
  nameKh?: string | null;
  levelOrder: number;
  description?: string | null;
  isActive?: boolean;
}

export type UpdateGradeLevelInput = Partial<CreateGradeLevelInput>;

export interface GradeLevelFilters {
  search?: string;
  isActive?: boolean;
}
