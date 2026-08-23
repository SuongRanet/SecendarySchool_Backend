-- +migrate Up

-- ---------------------------------------------------------------------------
-- classes — a homeroom for one grade level within one academic year
-- ---------------------------------------------------------------------------
CREATE TABLE classes (
    id                  BIGSERIAL PRIMARY KEY,
    academic_year_id    BIGINT       NOT NULL REFERENCES academic_years (id) ON DELETE RESTRICT,
    grade_level_id      BIGINT       NOT NULL REFERENCES grade_levels (id) ON DELETE RESTRICT,
    homeroom_teacher_id BIGINT       REFERENCES teachers (id) ON DELETE SET NULL,
    room_id             BIGINT       REFERENCES rooms (id) ON DELETE SET NULL,
    code                VARCHAR(40)  NOT NULL,
    name                VARCHAR(100) NOT NULL,
    capacity            INTEGER      NOT NULL DEFAULT 40,
    description         TEXT,
    is_active           BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    CONSTRAINT classes_capacity_check CHECK (capacity > 0)
);

CREATE UNIQUE INDEX classes_year_code_unique_idx
    ON classes (academic_year_id, LOWER(code))
    WHERE deleted_at IS NULL;

CREATE INDEX classes_academic_year_id_idx ON classes (academic_year_id);
CREATE INDEX classes_grade_level_id_idx ON classes (grade_level_id);
CREATE INDEX classes_homeroom_teacher_id_idx ON classes (homeroom_teacher_id);
CREATE INDEX classes_deleted_at_idx ON classes (deleted_at);

CREATE TRIGGER classes_set_updated_at
    BEFORE UPDATE ON classes
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- class_subjects — the subject offering of one class, taught by one teacher
-- ---------------------------------------------------------------------------
CREATE TABLE class_subjects (
    id          BIGSERIAL PRIMARY KEY,
    class_id    BIGINT        NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
    subject_id  BIGINT        NOT NULL REFERENCES subjects (id) ON DELETE RESTRICT,
    teacher_id  BIGINT        REFERENCES teachers (id) ON DELETE SET NULL,
    weight      NUMERIC(5, 2) NOT NULL DEFAULT 1,
    is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (class_id, subject_id),
    CONSTRAINT class_subjects_weight_check CHECK (weight > 0)
);

CREATE INDEX class_subjects_teacher_id_idx ON class_subjects (teacher_id);
CREATE INDEX class_subjects_subject_id_idx ON class_subjects (subject_id);

CREATE TRIGGER class_subjects_set_updated_at
    BEFORE UPDATE ON class_subjects
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- teacher_classes — non-homeroom class assignments (assistant, support, co-teacher)
-- ---------------------------------------------------------------------------
CREATE TABLE teacher_classes (
    id          BIGSERIAL PRIMARY KEY,
    teacher_id  BIGINT      NOT NULL REFERENCES teachers (id) ON DELETE CASCADE,
    class_id    BIGINT      NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
    is_homeroom BOOLEAN     NOT NULL DEFAULT FALSE,
    role_note   VARCHAR(150),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (teacher_id, class_id)
);

CREATE INDEX teacher_classes_class_id_idx ON teacher_classes (class_id);

-- +migrate Down

DROP TABLE IF EXISTS teacher_classes;
DROP TABLE IF EXISTS class_subjects;
DROP TABLE IF EXISTS classes;
