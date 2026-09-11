-- +migrate Up

-- ---------------------------------------------------------------------------
-- Remove the Grade 9 national examination module
--
-- The school does not want this feature. All four tables were empty and nothing
-- outside the module referenced them, so the drop is clean.
--
-- Two things are deliberately kept:
--   * `grade_levels.is_exit_grade` — Grade 9 pupils leave the school at the end
--     of the year rather than being promoted within it. That is a fact about the
--     curriculum, not about any examination, and promotion logic still needs it.
--   * The `MOCK_NATIONAL` value on `exam_type` — PostgreSQL cannot remove a
--     value from an enum in use without rewriting the type, and an unused label
--     costs nothing. No exam of that type exists.
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS national_exam_subject_scores;
DROP TABLE IF EXISTS national_exam_results;
DROP TABLE IF EXISTS national_exam_registrations;
DROP TABLE IF EXISTS national_exam_sessions;

DROP TYPE IF EXISTS national_exam_grade;
DROP TYPE IF EXISTS national_exam_reg_status;

DELETE FROM role_permissions
 WHERE permission_id IN (SELECT id FROM permissions WHERE code LIKE 'national_exams.%');

DELETE FROM permissions WHERE code LIKE 'national_exams.%';

-- +migrate Down

CREATE TYPE national_exam_reg_status AS ENUM (
    'NOT_REGISTERED', 'REGISTERED', 'ADMITTED', 'SAT', 'ABSENT', 'RESULT_PUBLISHED'
);

CREATE TYPE national_exam_grade AS ENUM ('A', 'B', 'C', 'D', 'E', 'F');

CREATE TABLE national_exam_sessions (
    id               BIGSERIAL PRIMARY KEY,
    academic_year_id BIGINT       NOT NULL REFERENCES academic_years (id) ON DELETE RESTRICT,
    name             VARCHAR(120) NOT NULL,
    centre_name      VARCHAR(150),
    centre_code      VARCHAR(50),
    starts_on        DATE         NOT NULL,
    ends_on          DATE         NOT NULL,
    registration_deadline DATE,
    is_open          BOOLEAN      NOT NULL DEFAULT TRUE,
    notes            TEXT,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT national_exam_sessions_date_order_check CHECK (ends_on >= starts_on)
);

CREATE UNIQUE INDEX national_exam_sessions_year_name_idx
    ON national_exam_sessions (academic_year_id, LOWER(name));

CREATE TRIGGER national_exam_sessions_set_updated_at
    BEFORE UPDATE ON national_exam_sessions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE national_exam_registrations (
    id            BIGSERIAL PRIMARY KEY,
    session_id    BIGINT                   NOT NULL REFERENCES national_exam_sessions (id) ON DELETE CASCADE,
    student_id    BIGINT                   NOT NULL REFERENCES students (id) ON DELETE RESTRICT,
    enrollment_id BIGINT                   NOT NULL REFERENCES enrollments (id) ON DELETE RESTRICT,
    seat_number   VARCHAR(50),
    attempt       INTEGER                  NOT NULL DEFAULT 1,
    status        national_exam_reg_status NOT NULL DEFAULT 'REGISTERED',
    remarks       TEXT,
    registered_by BIGINT                   REFERENCES users (id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ              NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ              NOT NULL DEFAULT NOW(),
    UNIQUE (session_id, student_id, attempt),
    CONSTRAINT national_exam_registrations_attempt_check CHECK (attempt > 0)
);

CREATE UNIQUE INDEX national_exam_registrations_seat_idx
    ON national_exam_registrations (session_id, LOWER(seat_number))
    WHERE seat_number IS NOT NULL;

CREATE INDEX national_exam_registrations_student_idx ON national_exam_registrations (student_id);
CREATE INDEX national_exam_registrations_status_idx ON national_exam_registrations (status);

CREATE TRIGGER national_exam_registrations_set_updated_at
    BEFORE UPDATE ON national_exam_registrations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE national_exam_results (
    id              BIGSERIAL PRIMARY KEY,
    registration_id BIGINT             NOT NULL REFERENCES national_exam_registrations (id) ON DELETE CASCADE,
    result_grade    national_exam_grade NOT NULL,
    total_score     NUMERIC(6, 2),
    is_pass         BOOLEAN            NOT NULL,
    published_on    DATE               NOT NULL DEFAULT CURRENT_DATE,
    published_by    BIGINT             REFERENCES users (id) ON DELETE SET NULL,
    amendment_reason TEXT,
    superseded_at   TIMESTAMPTZ,
    superseded_by   BIGINT             REFERENCES users (id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
    CONSTRAINT national_exam_results_score_check
        CHECK (total_score IS NULL OR (total_score >= 0 AND total_score <= 1000))
);

CREATE UNIQUE INDEX national_exam_results_live_idx
    ON national_exam_results (registration_id)
    WHERE superseded_at IS NULL;

CREATE INDEX national_exam_results_registration_idx
    ON national_exam_results (registration_id);

CREATE TABLE national_exam_subject_scores (
    id         BIGSERIAL PRIMARY KEY,
    result_id  BIGINT        NOT NULL REFERENCES national_exam_results (id) ON DELETE CASCADE,
    subject_id BIGINT        NOT NULL REFERENCES subjects (id) ON DELETE RESTRICT,
    score      NUMERIC(6, 2) NOT NULL,
    max_score  NUMERIC(6, 2) NOT NULL DEFAULT 100,
    created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (result_id, subject_id),
    CONSTRAINT national_exam_subject_scores_range_check
        CHECK (score >= 0 AND max_score > 0 AND score <= max_score)
);

CREATE INDEX national_exam_subject_scores_result_idx
    ON national_exam_subject_scores (result_id);
