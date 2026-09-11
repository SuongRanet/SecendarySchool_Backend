-- +migrate Up

-- ---------------------------------------------------------------------------
-- Two notification types for the homework conversation
--
-- Publishing an assignment already reached the class through NEW_ASSIGNMENT,
-- but the two replies had nowhere to live:
--
--   HOMEWORK_SUBMITTED — a pupil has handed work in, addressed to the teacher
--                        who set it. Without this the teacher had to open each
--                        assignment and count what had arrived.
--   HOMEWORK_GRADED    — that work has been marked, addressed to the pupil.
--                        NEW_GRADE is close but means a subject grade on a
--                        report card, and the two would be indistinguishable
--                        once the notification list filters by type.
--
-- Adding a label to an enum is additive: existing rows keep their type and
-- nothing that reads the column needs to change. The values are only added
-- here, never used in this transaction, which is what PostgreSQL requires of
-- ALTER TYPE ... ADD VALUE inside a transaction block.
-- ---------------------------------------------------------------------------

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'HOMEWORK_SUBMITTED';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'HOMEWORK_GRADED';

-- +migrate Down

-- PostgreSQL cannot remove a value from an enum without rewriting the type and
-- every column that uses it. The labels are left in place: an unused label costs
-- nothing, and the same decision was taken for MOCK_NATIONAL in migration 015.
-- Rolling back this migration therefore removes the notifications, not the type.

DELETE FROM notification_recipients
 WHERE notification_id IN (
   SELECT id FROM notifications
    WHERE type IN ('HOMEWORK_SUBMITTED', 'HOMEWORK_GRADED')
 );

DELETE FROM notifications
 WHERE type IN ('HOMEWORK_SUBMITTED', 'HOMEWORK_GRADED');
