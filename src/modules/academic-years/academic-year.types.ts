import type { AcademicYearStatus } from '../../types';

export interface AcademicYearRow {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  status: AcademicYearStatus;
  is_active: boolean;
  closed_at: Date | null;
  closed_by: number | null;
  created_at: Date;
  updated_at: Date;
  class_count?: number;
  enrollment_count?: number;
}

export interface AcademicYearDto {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  status: AcademicYearStatus;
  isActive: boolean;
  closedAt: Date | null;
  classCount: number;
  enrollmentCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAcademicYearInput {
  name: string;
  startDate: string;
  endDate: string;
  setActive?: boolean;
}

export interface UpdateAcademicYearInput {
  name?: string;
  startDate?: string;
  endDate?: string;
}

export interface AcademicYearFilters {
  search?: string;
  status?: AcademicYearStatus;
}

export interface AcademicTermRow {
  id: number;
  academic_year_id: number;
  name: string;
  term_order: number;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface AcademicTermDto {
  id: number;
  academicYearId: number;
  name: string;
  termOrder: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export interface CreateAcademicTermInput {
  name: string;
  termOrder: number;
  startDate: string;
  endDate: string;
}
