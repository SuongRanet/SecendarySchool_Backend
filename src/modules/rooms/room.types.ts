export interface RoomRow {
  id: number;
  code: string;
  name: string;
  building: string | null;
  floor: string | null;
  capacity: number | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  schedule_count?: number;
}

export interface RoomDto {
  id: number;
  code: string;
  name: string;
  building: string | null;
  floor: string | null;
  capacity: number | null;
  isActive: boolean;
  scheduleCount: number;
}

export interface CreateRoomInput {
  code: string;
  name: string;
  building?: string | null;
  floor?: string | null;
  capacity?: number | null;
  isActive?: boolean;
}

export type UpdateRoomInput = Partial<CreateRoomInput>;

export interface RoomFilters {
  search?: string;
  isActive?: boolean;
  building?: string;
}
