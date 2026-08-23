-- +migrate Up

CREATE TYPE academic_year_status AS ENUM ('UPCOMING', 'ACTIVE', 'CLOSED');

-- ---------------------------------------------------------------------------
-- academic_years — every academic operation is scoped to one of these
-- ---------------------------------------------------------------------------
CREATE TABLE academic_years (
    id         BIGSERIAL PRIMARY KEY,
    name       VARCHAR(50)          NOT NULL UNIQUE,
    start_date DATE                 NOT NULL,
    end_date   DATE                 NOT NULL,
    status     academic_year_status NOT NULL DEFAULT 'UPCOMING',
    is_active  BOOLEAN              NOT NULL DEFAULT FALSE,
    closed_at  TIMESTAMPTZ,
    closed_by  BIGINT               REFERENCES users (id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
    CONSTRAINT academic_years_date_order_check CHECK (end_date > start_date)
);

-- At most one academic year may be the active one at any time.
CREATE UNIQUE INDEX academic_years_single_active_idx ON academic_years ((is_active)) WHERE is_active;
CREATE INDEX academic_years_status_idx ON academic_years (status);

CREATE TRIGGER academic_years_set_updated_at
    BEFORE UPDATE ON academic_years
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- grade_levels — Grade 1 .. Grade 6
-- ---------------------------------------------------------------------------
CREATE TABLE grade_levels (
    id          BIGSERIAL PRIMARY KEY,
    code        VARCHAR(20)  NOT NULL UNIQUE,
    name_en     VARCHAR(100) NOT NULL,
    name_kh     VARCHAR(100),
    level_order INTEGER      NOT NULL UNIQUE,
    description TEXT,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ,
    CONSTRAINT grade_levels_order_check CHECK (level_order > 0)
);

CREATE INDEX grade_levels_is_active_idx ON grade_levels (is_active);

CREATE TRIGGER grade_levels_set_updated_at
    BEFORE UPDATE ON grade_levels
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- rooms — classrooms and other bookable spaces
-- ---------------------------------------------------------------------------
CREATE TABLE rooms (
    id         BIGSERIAL PRIMARY KEY,
    code       VARCHAR(30)  NOT NULL UNIQUE,
    name       VARCHAR(100) NOT NULL,
    building   VARCHAR(100),
    floor      VARCHAR(30),
    capacity   INTEGER,
    is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT rooms_capacity_check CHECK (capacity IS NULL OR capacity > 0)
);

CREATE INDEX rooms_is_active_idx ON rooms (is_active);

CREATE TRIGGER rooms_set_updated_at
    BEFORE UPDATE ON rooms
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- subjects
-- ---------------------------------------------------------------------------
CREATE TABLE subjects (
    id          BIGSERIAL PRIMARY KEY,
    code        VARCHAR(30)  NOT NULL UNIQUE,
    name_en     VARCHAR(120) NOT NULL,
    name_kh     VARCHAR(120),
    description TEXT,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ
);

CREATE INDEX subjects_is_active_idx ON subjects (is_active);

CREATE TRIGGER subjects_set_updated_at
    BEFORE UPDATE ON subjects
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- grade_subjects — which subjects are taught at which grade level
-- ---------------------------------------------------------------------------
CREATE TABLE grade_subjects (
    id             BIGSERIAL PRIMARY KEY,
    grade_level_id BIGINT      NOT NULL REFERENCES grade_levels (id) ON DELETE CASCADE,
    subject_id     BIGINT      NOT NULL REFERENCES subjects (id) ON DELETE CASCADE,
    is_required    BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (grade_level_id, subject_id)
);

-- +migrate Down

DROP TABLE IF EXISTS grade_subjects;
DROP TABLE IF EXISTS subjects;
DROP TABLE IF EXISTS rooms;
DROP TABLE IF EXISTS grade_levels;
DROP TABLE IF EXISTS academic_years;
DROP TYPE IF EXISTS academic_year_status;
