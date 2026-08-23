-- +migrate Up

CREATE TYPE announcement_audience AS ENUM ('ALL', 'TEACHERS', 'PARENTS', 'STUDENTS', 'GRADE', 'CLASS');
CREATE TYPE announcement_status AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE notification_type AS ENUM (
    'ANNOUNCEMENT', 'ATTENDANCE_ALERT', 'NEW_ASSIGNMENT',
    'NEW_GRADE', 'UPCOMING_EXAM', 'PAYMENT_REMINDER', 'SYSTEM'
);

-- ---------------------------------------------------------------------------
-- announcements
-- ---------------------------------------------------------------------------
CREATE TABLE announcements (
    id               BIGSERIAL PRIMARY KEY,
    title            VARCHAR(200)          NOT NULL,
    body             TEXT                  NOT NULL,
    audience         announcement_audience NOT NULL DEFAULT 'ALL',
    grade_level_id   BIGINT                REFERENCES grade_levels (id) ON DELETE CASCADE,
    class_id         BIGINT                REFERENCES classes (id) ON DELETE CASCADE,
    academic_year_id BIGINT                REFERENCES academic_years (id) ON DELETE SET NULL,
    status           announcement_status   NOT NULL DEFAULT 'DRAFT',
    is_pinned        BOOLEAN               NOT NULL DEFAULT FALSE,
    publish_at       TIMESTAMPTZ,
    published_at     TIMESTAMPTZ,
    expires_at       TIMESTAMPTZ,
    archived_at      TIMESTAMPTZ,
    attachment_url   TEXT,
    created_by       BIGINT                REFERENCES users (id) ON DELETE SET NULL,
    published_by     BIGINT                REFERENCES users (id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
    CONSTRAINT announcements_grade_target_check
        CHECK (audience <> 'GRADE' OR grade_level_id IS NOT NULL),
    CONSTRAINT announcements_class_target_check
        CHECK (audience <> 'CLASS' OR class_id IS NOT NULL)
);

CREATE INDEX announcements_status_idx ON announcements (status);
CREATE INDEX announcements_audience_idx ON announcements (audience);
CREATE INDEX announcements_published_at_idx ON announcements (published_at DESC);

CREATE TRIGGER announcements_set_updated_at
    BEFORE UPDATE ON announcements
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- notifications — the event, and one recipient row per user
-- ---------------------------------------------------------------------------
CREATE TABLE notifications (
    id              BIGSERIAL PRIMARY KEY,
    type            notification_type NOT NULL,
    title           VARCHAR(200)      NOT NULL,
    body            TEXT,
    entity_type     VARCHAR(60),
    entity_id       BIGINT,
    action_url      VARCHAR(255),
    created_by      BIGINT            REFERENCES users (id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

CREATE INDEX notifications_type_idx ON notifications (type);
CREATE INDEX notifications_created_at_idx ON notifications (created_at DESC);

CREATE TABLE notification_recipients (
    id              BIGSERIAL PRIMARY KEY,
    notification_id BIGINT      NOT NULL REFERENCES notifications (id) ON DELETE CASCADE,
    user_id         BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    read_at         TIMESTAMPTZ,
    archived_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (notification_id, user_id)
);

CREATE INDEX notification_recipients_user_unread_idx
    ON notification_recipients (user_id)
    WHERE read_at IS NULL;

CREATE INDEX notification_recipients_user_id_idx ON notification_recipients (user_id);

-- +migrate Down

DROP TABLE IF EXISTS notification_recipients;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS announcements;
DROP TYPE IF EXISTS notification_type;
DROP TYPE IF EXISTS announcement_status;
DROP TYPE IF EXISTS announcement_audience;
