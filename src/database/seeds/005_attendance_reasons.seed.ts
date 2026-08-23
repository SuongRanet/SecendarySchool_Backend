import type { PoolClient } from 'pg';
import { logger } from '../../utils/logger';

const REASONS = [
  { code: 'SICK', nameEn: 'Sick', nameKh: 'ឈឺ', appliesTo: 'EXCUSED', excused: true },
  { code: 'FAMILY', nameEn: 'Family matter', nameKh: 'កិច្ចការគ្រួសារ', appliesTo: 'EXCUSED', excused: true },
  { code: 'MEDICAL', nameEn: 'Medical appointment', nameKh: 'ណាត់ជួបគ្រូពេទ្យ', appliesTo: 'EXCUSED', excused: true },
  { code: 'TRAFFIC', nameEn: 'Traffic or transport delay', nameKh: 'ការកកស្ទះចរាចរណ៍', appliesTo: 'LATE', excused: true },
  { code: 'WEATHER', nameEn: 'Weather', nameKh: 'អាកាសធាតុ', appliesTo: 'LATE', excused: true },
  { code: 'SCHOOL_EVENT', nameEn: 'School event', nameKh: 'កម្មវិធីសាលា', appliesTo: 'LEAVE', excused: true },
  { code: 'APPROVED_LEAVE', nameEn: 'Approved leave', nameKh: 'ការឈប់សម្រាកដែលបានអនុញ្ញាត', appliesTo: 'LEAVE', excused: true },
  { code: 'UNEXCUSED', nameEn: 'No reason given', nameKh: 'គ្មានហេតុផល', appliesTo: 'ABSENT', excused: false },
];

/** Seeds the reusable catalogue of attendance reasons. */
export const seedAttendanceReasons = async (client: PoolClient): Promise<void> => {
  for (const reason of REASONS) {
    await client.query(
      `INSERT INTO attendance_reasons (code, name_en, name_kh, applies_to, is_excused)
       VALUES ($1, $2, $3, $4::attendance_status, $5)
       ON CONFLICT (code) DO UPDATE
         SET name_en = EXCLUDED.name_en,
             name_kh = EXCLUDED.name_kh,
             applies_to = EXCLUDED.applies_to,
             is_excused = EXCLUDED.is_excused`,
      [reason.code, reason.nameEn, reason.nameKh, reason.appliesTo, reason.excused],
    );
  }

  logger.info(`Seeded ${REASONS.length} attendance reasons`);
};
