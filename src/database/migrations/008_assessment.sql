-- +migrate Up

CREATE TYPE assessment_type AS ENUM (
    'HOMEWORK', 'QUIZ', 'ASSIGNMENT', 'PROJECT', 'MIDTERM', 'FINAL', 'PARTICIPATION'
);
CREATE TYPE exam_type AS ENUM ('QUIZ', 'MONTHLY_TEST', 'MIDTERM', 'FINAL');
CREATE TYPE performance_level AS ENUM ('EXCELLENT', 'GOOD', 'FAIR', 'NEEDS_IMPROVEMENT');
CREATE TYPE report_card_status AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- ---------------------------------------------------------------------------
-- academic_terms — the grading periods inside an academic year
-- ---------------------------------------------------------------------------
CREATE TABLE academic_terms (
    id               BIGSERIAL PRIMARY KEY,
    academic_year_id BIGINT      NOT NULL REFERENCES academic_years (id) ON DELETE CASCADE,
    name             VARCHAR(80) NOT NULL,
    term_order       INTEGER     NOT NULL,
    start_date       DATE        NOT NULL,
    end_date         DATE        NOT NULL,
    is_active        BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (academic_year_id, term_order),
    CONSTRAINT academic_terms_date_order_check CHECK (end_date > start_date)
);

CREATE TRIGGER academic_terms_set_updated_at
    BEFORE UPDATE ON academic_terms
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- grading_schemes — weighting of assessment types, e.g. Homework 10% .. Final 40%
-- ---------------------------------------------------------------------------
CREATE TABLE grading_schemes (
    id          BIGSERIAL PRIMARY KEY,
    code        VARCHAR(40)  NOT NULL UNIQUE,
    name        VARCHAR(120) NOT NULL,
    description TEXT,
    is_default  BOOLEAN      NOT NULL DEFAULT FALSE,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX grading_schemes_single_default_idx
    ON grading_schemes ((is_default)) WHERE is_default;

CREATE TRIGGER grading_schemes_set_updated_at
    BEFORE UPDATE ON grading_schemes
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE grading_scheme_components (
    id                BIGSERIAL PRIMARY KEY,
    grading_scheme_id BIGINT          NOT NULL REFERENCES grading_schemes (id) ON DELETE CASCADE,
    assessment_type   assessment_type NOT NULL,
    weight_percent    NUMERIC(5, 2)   NOT NULL,
    created_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    UNIQUE (grading_scheme_id, assessment_type),
    CONSTRAINT grading_scheme_components_weight_check
        CHECK (weight_percent > 0 AND weight_percent <= 100)
);

-- ---------------------------------------------------------------------------
-- grade_scales — numeric score to letter grade and performance level
-- ---------------------------------------------------------------------------
CREATE TABLE grade_scales (
    id                BIGSERIAL PRIMARY KEY,
    grading_scheme_id BIGINT            NOT NULL REFERENCES grading_schemes (id) ON DELETE CASCADE,
    letter_grade      VARCHAR(2)        NOT NULL,
    min_score         NUMERIC(6, 2)     NOT NULL,
    max_score         NUMERIC(6, 2)     NOT NULL,
    gpa_point         NUMERIC(4, 2),
    performance       performance_level NOT NULL,
    remark_en         VARCHAR(120),
    remark_kh         VARCHAR(120),
    created_at        TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    UNIQUE (grading_scheme_id, letter_grade),
    CONSTRAINT grade_scales_range_check CHECK (max_score >= min_score)
);

-- ---------------------------------------------------------------------------
-- assessments — a graded activity for one class subject
-- ---------------------------------------------------------------------------
CREATE TABLE assessments (
    id               BIGSERIAL PRIMARY KEY,
    academic_year_id BIGINT          NOT NULL REFERENCES academic_years (id) ON DELETE RESTRICT,
    term_id          BIGINT          REFERENCES academic_terms (id) ON DELETE SET NULL,
    class_id         BIGINT          NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
    subject_id       BIGINT          NOT NULL REFERENCES subjects (id) ON DELETE RESTRICT,
    class_subject_id BIGINT          REFERENCES class_subjects (id) ON DELETE SET NULL,
    teacher_id       BIGINT          REFERENCES teachers (id) ON DELETE SET NULL,
    title            VARCHAR(200)    NOT NULL,
    description      TEXT,
    type             assessment_type NOT NULL,
    max_score        NUMERIC(6, 2)   NOT NULL,
    weight_percent   NUMERIC(5, 2),
    assessment_date  DATE,
    is_published     BOOLEAN         NOT NULL DEFAULT FALSE,
    created_by       BIGINT          REFERENCES users (id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    deleted_at       TIMESTAMPTZ,
    CONSTRAINT assessments_max_score_check CHECK (max_score > 0),
    CONSTRAINT assessments_weight_check
        CHECK (weight_percent IS NULL OR (weight_percent > 0 AND weight_percent <= 100))
);

CREATE INDEX assessments_class_subject_idx ON assessments (class_id, subject_id);
CREATE INDEX assessments_teacher_id_idx ON assessments (teacher_id);
CREATE INDEX assessments_term_id_idx ON assessments (term_id);
CREATE INDEX assessments_deleted_at_idx ON assessments (deleted_at);

CREATE TRIGGER assessments_set_updated_at
    BEFORE UPDATE ON assessments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- assessment_results — one score per student per assessment
-- ---------------------------------------------------------------------------
CREATE TABLE assessment_results (
    id            BIGSERIAL PRIMARY KEY,
    assessment_id BIGINT        NOT NULL REFERENCES assessments (id) ON DELETE CASCADE,
    student_id    BIGINT        NOT NULL REFERENCES students (id) ON DELETE CASCADE,
    enrollment_id BIGINT        REFERENCES enrollments (id) ON DELETE SET NULL,
    score         NUMERIC(6, 2),
    is_absent     BOOLEAN       NOT NULL DEFAULT FALSE,
    feedback      TEXT,
    graded_by     BIGINT        REFERENCES users (id) ON DELETE SET NULL,
    graded_at     TIMESTAMPTZ,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (assessment_id, student_id),
    CONSTRAINT assessment_results_score_check CHECK (score IS NULL OR score >= 0)
);

CREATE INDEX assessment_results_student_id_idx ON assessment_results (student_id);

CREATE TRIGGER assessment_results_set_updated_at
    BEFORE UPDATE ON assessment_results
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- exams / exam_results
-- ---------------------------------------------------------------------------
CREATE TABLE exams (
    id               BIGSERIAL PRIMARY KEY,
    academic_year_id BIGINT        NOT NULL REFERENCES academic_years (id) ON DELETE RESTRICT,
    term_id          BIGINT        REFERENCES academic_terms (id) ON DELETE SET NULL,
    class_id         BIGINT        NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
    subject_id       BIGINT        NOT NULL REFERENCES subjects (id) ON DELETE RESTRICT,
    room_id          BIGINT        REFERENCES rooms (id) ON DELETE SET NULL,
    title            VARCHAR(200)  NOT NULL,
    type             exam_type     NOT NULL,
    exam_date        DATE          NOT NULL,
    start_time       TIME,
    duration_minutes INTEGER,
    max_score        NUMERIC(6, 2) NOT NULL,
    instructions     TEXT,
    created_by       BIGINT        REFERENCES users (id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    deleted_at       TIMESTAMPTZ,
    CONSTRAINT exams_max_score_check CHECK (max_score > 0),
    CONSTRAINT exams_duration_check CHECK (duration_minutes IS NULL OR duration_minutes > 0)
);

CREATE INDEX exams_class_id_idx ON exams (class_id);
CREATE INDEX exams_exam_date_idx ON exams (exam_date);

CREATE TRIGGER exams_set_updated_at
    BEFORE UPDATE ON exams
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE exam_results (
    id         BIGSERIAL PRIMARY KEY,
    exam_id    BIGINT        NOT NULL REFERENCES exams (id) ON DELETE CASCADE,
    student_id BIGINT        NOT NULL REFERENCES students (id) ON DELETE CASCADE,
    score      NUMERIC(6, 2),
    is_absent  BOOLEAN       NOT NULL DEFAULT FALSE,
    remark     TEXT,
    graded_by  BIGINT        REFERENCES users (id) ON DELETE SET NULL,
    graded_at  TIMESTAMPTZ,
    created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (exam_id, student_id),
    CONSTRAINT exam_results_score_check CHECK (score IS NULL OR score >= 0)
);

CREATE INDEX exam_results_student_id_idx ON exam_results (student_id);

CREATE TRIGGER exam_results_set_updated_at
    BEFORE UPDATE ON exam_results
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- grades — the consolidated per-subject result for a student in a term
-- ---------------------------------------------------------------------------
CREATE TABLE grades (
    id                BIGSERIAL PRIMARY KEY,
    student_id        BIGINT            NOT NULL REFERENCES students (id) ON DELETE CASCADE,
    enrollment_id     BIGINT            REFERENCES enrollments (id) ON DELETE SET NULL,
    academic_year_id  BIGINT            NOT NULL REFERENCES academic_years (id) ON DELETE RESTRICT,
    term_id           BIGINT            REFERENCES academic_terms (id) ON DELETE SET NULL,
    class_id          BIGINT            NOT NULL REFERENCES classes (id) ON DELETE RESTRICT,
    subject_id        BIGINT            NOT NULL REFERENCES subjects (id) ON DELETE RESTRICT,
    grading_scheme_id BIGINT            REFERENCES grading_schemes (id) ON DELETE SET NULL,
    score             NUMERIC(6, 2),
    max_score         NUMERIC(6, 2)     NOT NULL DEFAULT 100,
    percentage        NUMERIC(6, 2),
    letter_grade      VARCHAR(2),
    performance       performance_level,
    gpa_point         NUMERIC(4, 2),
    rank_in_class     INTEGER,
    teacher_comment   TEXT,
    is_final          BOOLEAN           NOT NULL DEFAULT FALSE,
    calculated_at     TIMESTAMPTZ,
    recorded_by       BIGINT            REFERENCES users (id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    CONSTRAINT grades_score_check CHECK (score IS NULL OR score >= 0)
);

CREATE UNIQUE INDEX grades_unique_term_subject_idx
    ON grades (student_id, academic_year_id, COALESCE(term_id, 0), subject_id);

CREATE INDEX grades_class_subject_idx ON grades (class_id, subject_id);
CREATE INDEX grades_student_year_idx ON grades (student_id, academic_year_id);

CREATE TRIGGER grades_set_updated_at
    BEFORE UPDATE ON grades
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- grade_history — an append-only trail of every grade change
-- ---------------------------------------------------------------------------
CREATE TABLE grade_history (
    id          BIGSERIAL PRIMARY KEY,
    grade_id    BIGINT        NOT NULL REFERENCES grades (id) ON DELETE CASCADE,
    old_score   NUMERIC(6, 2),
    new_score   NUMERIC(6, 2),
    old_letter  VARCHAR(2),
    new_letter  VARCHAR(2),
    reason      TEXT,
    changed_by  BIGINT        REFERENCES users (id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX grade_history_grade_id_idx ON grade_history (grade_id);

-- ---------------------------------------------------------------------------
-- report_cards
-- ---------------------------------------------------------------------------
CREATE TABLE report_cards (
    id                 BIGSERIAL PRIMARY KEY,
    student_id         BIGINT             NOT NULL REFERENCES students (id) ON DELETE CASCADE,
    enrollment_id      BIGINT             REFERENCES enrollments (id) ON DELETE SET NULL,
    academic_year_id   BIGINT             NOT NULL REFERENCES academic_years (id) ON DELETE RESTRICT,
    term_id            BIGINT             REFERENCES academic_terms (id) ON DELETE SET NULL,
    class_id           BIGINT             NOT NULL REFERENCES classes (id) ON DELETE RESTRICT,
    total_score        NUMERIC(8, 2),
    average_score      NUMERIC(6, 2),
    gpa                NUMERIC(4, 2),
    letter_grade       VARCHAR(2),
    performance        performance_level,
    rank_in_class      INTEGER,
    class_size         INTEGER,
    days_present       INTEGER            NOT NULL DEFAULT 0,
    days_absent        INTEGER            NOT NULL DEFAULT 0,
    days_late          INTEGER            NOT NULL DEFAULT 0,
    days_excused       INTEGER            NOT NULL DEFAULT 0,
    attendance_percent NUMERIC(5, 2),
    teacher_comment    TEXT,
    homeroom_comment   TEXT,
    principal_comment  TEXT,
    status             report_card_status NOT NULL DEFAULT 'DRAFT',
    generated_by       BIGINT             REFERENCES users (id) ON DELETE SET NULL,
    generated_at       TIMESTAMPTZ,
    published_at       TIMESTAMPTZ,
    created_at         TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX report_cards_unique_idx
    ON report_cards (student_id, academic_year_id, COALESCE(term_id, 0));

CREATE INDEX report_cards_class_id_idx ON report_cards (class_id);
CREATE INDEX report_cards_status_idx ON report_cards (status);

CREATE TRIGGER report_cards_set_updated_at
    BEFORE UPDATE ON report_cards
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE report_card_subjects (
    id             BIGSERIAL PRIMARY KEY,
    report_card_id BIGINT            NOT NULL REFERENCES report_cards (id) ON DELETE CASCADE,
    subject_id     BIGINT            NOT NULL REFERENCES subjects (id) ON DELETE RESTRICT,
    grade_id       BIGINT            REFERENCES grades (id) ON DELETE SET NULL,
    score          NUMERIC(6, 2),
    max_score      NUMERIC(6, 2)     NOT NULL DEFAULT 100,
    percentage     NUMERIC(6, 2),
    letter_grade   VARCHAR(2),
    performance    performance_level,
    rank_in_class  INTEGER,
    comment        TEXT,
    display_order  INTEGER           NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    UNIQUE (report_card_id, subject_id)
);

-- +migrate Down

DROP TABLE IF EXISTS report_card_subjects;
DROP TABLE IF EXISTS report_cards;
DROP TABLE IF EXISTS grade_history;
DROP TABLE IF EXISTS grades;
DROP TABLE IF EXISTS exam_results;
DROP TABLE IF EXISTS exams;
DROP TABLE IF EXISTS assessment_results;
DROP TABLE IF EXISTS assessments;
DROP TABLE IF EXISTS grade_scales;
DROP TABLE IF EXISTS grading_scheme_components;
DROP TABLE IF EXISTS grading_schemes;
DROP TABLE IF EXISTS academic_terms;
DROP TYPE IF EXISTS report_card_status;
DROP TYPE IF EXISTS performance_level;
DROP TYPE IF EXISTS exam_type;
DROP TYPE IF EXISTS assessment_type;
