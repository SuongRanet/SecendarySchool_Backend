-- +migrate Up

CREATE TYPE behavior_type AS ENUM (
    'ACHIEVEMENT', 'POSITIVE', 'PARTICIPATION', 'TEAMWORK',
    'RESPONSIBILITY', 'COMMUNICATION', 'WARNING', 'DISCIPLINARY'
);

-- ---------------------------------------------------------------------------
-- student_behaviors — positive records, warnings and development tracking
-- ---------------------------------------------------------------------------
CREATE TABLE student_behaviors (
    id                BIGSERIAL PRIMARY KEY,
    student_id        BIGINT        NOT NULL REFERENCES students (id) ON DELETE CASCADE,
    academic_year_id  BIGINT        NOT NULL REFERENCES academic_years (id) ON DELETE RESTRICT,
    class_id          BIGINT        REFERENCES classes (id) ON DELETE SET NULL,
    teacher_id        BIGINT        REFERENCES teachers (id) ON DELETE SET NULL,
    type              behavior_type NOT NULL,
    title             VARCHAR(200)  NOT NULL,
    description       TEXT,
    occurred_on       DATE          NOT NULL DEFAULT CURRENT_DATE,
    points            INTEGER       NOT NULL DEFAULT 0,
    action_taken      TEXT,
    visible_to_parent BOOLEAN       NOT NULL DEFAULT TRUE,
    recorded_by       BIGINT        REFERENCES users (id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    deleted_at        TIMESTAMPTZ
);

CREATE INDEX student_behaviors_student_id_idx ON student_behaviors (student_id);
CREATE INDEX student_behaviors_type_idx ON student_behaviors (type);
CREATE INDEX student_behaviors_occurred_on_idx ON student_behaviors (occurred_on);

CREATE TRIGGER student_behaviors_set_updated_at
    BEFORE UPDATE ON student_behaviors
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- student_comments — teacher and homeroom commentary over time
-- ---------------------------------------------------------------------------
CREATE TABLE student_comments (
    id                BIGSERIAL PRIMARY KEY,
    student_id        BIGINT      NOT NULL REFERENCES students (id) ON DELETE CASCADE,
    academic_year_id  BIGINT      NOT NULL REFERENCES academic_years (id) ON DELETE RESTRICT,
    term_id           BIGINT      REFERENCES academic_terms (id) ON DELETE SET NULL,
    class_id          BIGINT      REFERENCES classes (id) ON DELETE SET NULL,
    subject_id        BIGINT      REFERENCES subjects (id) ON DELETE SET NULL,
    teacher_id        BIGINT      REFERENCES teachers (id) ON DELETE SET NULL,
    is_homeroom       BOOLEAN     NOT NULL DEFAULT FALSE,
    comment           TEXT        NOT NULL,
    visible_to_parent BOOLEAN     NOT NULL DEFAULT TRUE,
    created_by        BIGINT      REFERENCES users (id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at        TIMESTAMPTZ
);

CREATE INDEX student_comments_student_id_idx ON student_comments (student_id);
CREATE INDEX student_comments_term_id_idx ON student_comments (term_id);

CREATE TRIGGER student_comments_set_updated_at
    BEFORE UPDATE ON student_comments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- +migrate Down

DROP TABLE IF EXISTS student_comments;
DROP TABLE IF EXISTS student_behaviors;
DROP TYPE IF EXISTS behavior_type;
