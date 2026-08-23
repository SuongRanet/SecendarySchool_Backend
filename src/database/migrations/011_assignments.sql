-- +migrate Up

CREATE TYPE assignment_status AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED');
CREATE TYPE submission_status AS ENUM ('PENDING', 'SUBMITTED', 'LATE', 'GRADED', 'MISSING');

-- ---------------------------------------------------------------------------
-- assignments — homework issued to a class subject
-- ---------------------------------------------------------------------------
CREATE TABLE assignments (
    id               BIGSERIAL PRIMARY KEY,
    academic_year_id BIGINT            NOT NULL REFERENCES academic_years (id) ON DELETE RESTRICT,
    term_id          BIGINT            REFERENCES academic_terms (id) ON DELETE SET NULL,
    class_id         BIGINT            NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
    subject_id       BIGINT            NOT NULL REFERENCES subjects (id) ON DELETE RESTRICT,
    teacher_id       BIGINT            REFERENCES teachers (id) ON DELETE SET NULL,
    assessment_id    BIGINT            REFERENCES assessments (id) ON DELETE SET NULL,
    title            VARCHAR(200)      NOT NULL,
    description      TEXT,
    instructions     TEXT,
    attachment_url   TEXT,
    assigned_date    DATE              NOT NULL DEFAULT CURRENT_DATE,
    due_date         DATE              NOT NULL,
    max_score        NUMERIC(6, 2),
    status           assignment_status NOT NULL DEFAULT 'DRAFT',
    published_at     TIMESTAMPTZ,
    created_by       BIGINT            REFERENCES users (id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    deleted_at       TIMESTAMPTZ,
    CONSTRAINT assignments_due_date_check CHECK (due_date >= assigned_date),
    CONSTRAINT assignments_max_score_check CHECK (max_score IS NULL OR max_score > 0)
);

CREATE INDEX assignments_class_id_idx ON assignments (class_id);
CREATE INDEX assignments_due_date_idx ON assignments (due_date);
CREATE INDEX assignments_status_idx ON assignments (status);

CREATE TRIGGER assignments_set_updated_at
    BEFORE UPDATE ON assignments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- submissions — one row per student per assignment
-- ---------------------------------------------------------------------------
CREATE TABLE submissions (
    id            BIGSERIAL PRIMARY KEY,
    assignment_id BIGINT            NOT NULL REFERENCES assignments (id) ON DELETE CASCADE,
    student_id    BIGINT            NOT NULL REFERENCES students (id) ON DELETE CASCADE,
    status        submission_status NOT NULL DEFAULT 'PENDING',
    content       TEXT,
    attachment_url TEXT,
    submitted_at  TIMESTAMPTZ,
    score         NUMERIC(6, 2),
    feedback      TEXT,
    graded_by     BIGINT            REFERENCES users (id) ON DELETE SET NULL,
    graded_at     TIMESTAMPTZ,
    created_at    TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    UNIQUE (assignment_id, student_id),
    CONSTRAINT submissions_score_check CHECK (score IS NULL OR score >= 0)
);

CREATE INDEX submissions_student_id_idx ON submissions (student_id);
CREATE INDEX submissions_status_idx ON submissions (status);

CREATE TRIGGER submissions_set_updated_at
    BEFORE UPDATE ON submissions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- +migrate Down

DROP TABLE IF EXISTS submissions;
DROP TABLE IF EXISTS assignments;
DROP TYPE IF EXISTS submission_status;
DROP TYPE IF EXISTS assignment_status;
