import { closePool, withTransaction } from '../connection';
import { logger } from '../../utils/logger';
import { seedRolesAndPermissions } from './001_roles_permissions.seed';
import { seedSuperAdmin } from './002_super_admin.seed';
import { seedAcademicStructure } from './003_academic_structure.seed';
import { seedGradingSchemes } from './004_grading.seed';
import { seedAttendanceReasons } from './005_attendance_reasons.seed';

/**
 * Idempotent seed. Every step upserts, so running the seed again after adding a
 * permission or a subject updates the database without duplicating rows.
 */
const run = async (): Promise<void> => {
  await withTransaction(async (client) => {
    await seedRolesAndPermissions(client);
    await seedSuperAdmin(client);
    await seedAcademicStructure(client);
    await seedGradingSchemes(client);
    await seedAttendanceReasons(client);
  });

  logger.info('Seed completed successfully');
};

run()
  .then(async () => {
    await closePool();
    process.exit(0);
  })
  .catch(async (error) => {
    logger.error('Seed failed', error);
    await closePool();
    process.exit(1);
  });
