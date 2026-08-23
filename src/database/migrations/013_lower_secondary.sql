-- +migrate Up

-- ---------------------------------------------------------------------------
-- Hun Sen Turi Secondary School — lower secondary (Grade 7-9) adjustments
--
-- Three changes, all additive:
--   1. Grade levels gain an exit-grade flag. Grade 9 ends in the national
--      examination rather than a promotion, and eligibility keys off this flag
--      instead of a hard-coded grade code.
--   2. Subjects gain a group, and the grade-subject link gains a coefficient.
--      A lower secondary school teaches twelve subjects that carry different
--      weight when averaging, and report cards present them grouped.
--   3. The Grade 9 national examination (Diplôme) gets its own tables. It is
--      externally set and externally marked, so it is deliberately kept apart
--      from `exams` and `exam_results`.
-- ---------------------------------------------------------------------------

ALTER TABLE grade_levels
    ADD COLUMN is_exit_grade BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN grade_levels.is_exit_grade IS
    'The final grade of the school cycle; its students sit the national examination.';

CREATE TYPE subject_group AS ENUM ('CORE', 'SCIENCE', 'SOCIAL', 'APPLIED');

ALTER TABLE subjects
    ADD COLUMN subject_group subject_group NOT NULL DEFAULT 'CORE';

-- The coefficient a subject carries when averaging results for a grade. Khmer
-- and Mathematics normally weigh more than Physical Education.
ALTER TABLE grade_subjects
    ADD COLUMN coefficient NUMERIC(4, 2) NOT NULL DEFAULT 1,
    ADD CONSTRAINT grade_subjects_coefficient_check CHECK (coefficient > 0);

-- The school's own exams gain a Grade 9 rehearsal type.
ALTER TYPE exam_type ADD VALUE IF NOT EXISTS 'MOCK_NATIONAL';

-- ---------------------------------------------------------------------------
-- national_exam_sessions — one Ministry sitting
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- national_exam_registrations — a candidate in a sitting
--
-- `attempt` separates a resit from the first sitting: a second attempt is a new
-- row, never an edit of the first.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- national_exam_results — the published outcome
--
-- One live result per registration. A correction supersedes the previous row
-- (`superseded_at`) instead of overwriting it, so the original stays readable.
-- ---------------------------------------------------------------------------
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

-- Only one live result per registration; superseded rows are kept for history.
CREATE UNIQUE INDEX national_exam_results_live_idx
    ON national_exam_results (registration_id)
    WHERE superseded_at IS NULL;

CREATE INDEX national_exam_results_registration_idx
    ON national_exam_results (registration_id);

-- ---------------------------------------------------------------------------
-- national_exam_subject_scores — per-subject scores, where the Ministry
-- publishes them
-- ---------------------------------------------------------------------------
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

-- +migrate Down

DROP TABLE IF EXISTS national_exam_subject_scores;
DROP TABLE IF EXISTS national_exam_results;
DROP TABLE IF EXISTS national_exam_registrations;
DROP TABLE IF EXISTS national_exam_sessions;
DROP TYPE IF EXISTS national_exam_grade;
DROP TYPE IF EXISTS national_exam_reg_status;

ALTER TABLE grade_subjects
    DROP CONSTRAINT IF EXISTS grade_subjects_coefficient_check,
    DROP COLUMN IF EXISTS coefficient;

ALTER TABLE subjects DROP COLUMN IF EXISTS subject_group;
DROP TYPE IF EXISTS subject_group;

ALTER TABLE grade_levels DROP COLUMN IF EXISTS is_exit_grade;
