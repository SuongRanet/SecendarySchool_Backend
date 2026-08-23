-- +migrate Up

CREATE TYPE student_status AS ENUM ('ACTIVE', 'INACTIVE', 'TRANSFERRED', 'GRADUATED', 'WITHDRAWN');
CREATE TYPE enrollment_status AS ENUM ('ACTIVE', 'COMPLETED', 'TRANSFERRED', 'WITHDRAWN', 'PROMOTED');
CREATE TYPE guardian_relationship AS ENUM (
    'FATHER', 'MOTHER', 'GRANDFATHER', 'GRANDMOTHER',
    'UNCLE', 'AUNT', 'SIBLING', 'LEGAL_GUARDIAN', 'OTHER'
);

-- ---------------------------------------------------------------------------
-- students — domain profile, never carries a static class_id
-- ---------------------------------------------------------------------------
CREATE TABLE students (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT         UNIQUE REFERENCES users (id) ON DELETE SET NULL,
    student_code    VARCHAR(30)    NOT NULL UNIQUE,
    first_name_en   VARCHAR(100)   NOT NULL,
    last_name_en    VARCHAR(100)   NOT NULL,
    first_name_kh   VARCHAR(100),
    last_name_kh    VARCHAR(100),
    gender          gender,
    date_of_birth   DATE,
    place_of_birth  VARCHAR(150),
    national_id     VARCHAR(50),
    phone_number    VARCHAR(30),
    email           VARCHAR(255),
    current_address TEXT,
    province        VARCHAR(100),
    profile_photo   TEXT,
    enrolled_date   DATE,
    status          student_status NOT NULL DEFAULT 'ACTIVE',
    notes           TEXT,
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX students_status_idx ON students (status);
CREATE INDEX students_deleted_at_idx ON students (deleted_at);
CREATE INDEX students_name_en_idx ON students (LOWER(first_name_en), LOWER(last_name_en));
CREATE INDEX students_name_kh_idx ON students (first_name_kh, last_name_kh);

CREATE TRIGGER students_set_updated_at
    BEFORE UPDATE ON students
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- parents / guardians
-- ---------------------------------------------------------------------------
CREATE TABLE parents (
    id             BIGSERIAL PRIMARY KEY,
    user_id        BIGINT       UNIQUE REFERENCES users (id) ON DELETE SET NULL,
    parent_code    VARCHAR(30)  NOT NULL UNIQUE,
    first_name_en  VARCHAR(100) NOT NULL,
    last_name_en   VARCHAR(100) NOT NULL,
    first_name_kh  VARCHAR(100),
    last_name_kh   VARCHAR(100),
    gender         gender,
    date_of_birth  DATE,
    national_id    VARCHAR(50),
    phone_number   VARCHAR(30),
    alternate_phone VARCHAR(30),
    email          VARCHAR(255),
    occupation     VARCHAR(150),
    workplace      VARCHAR(150),
    address        TEXT,
    province       VARCHAR(100),
    profile_photo  TEXT,
    is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at     TIMESTAMPTZ
);

CREATE INDEX parents_deleted_at_idx ON parents (deleted_at);
CREATE INDEX parents_name_idx ON parents (LOWER(first_name_en), LOWER(last_name_en));
CREATE INDEX parents_phone_idx ON parents (phone_number);

CREATE TRIGGER parents_set_updated_at
    BEFORE UPDATE ON parents
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- student_parents — many-to-many; a student may have several guardians and a
-- guardian may be linked to several students
-- ---------------------------------------------------------------------------
CREATE TABLE student_parents (
    id                  BIGSERIAL PRIMARY KEY,
    student_id          BIGINT                NOT NULL REFERENCES students (id) ON DELETE CASCADE,
    parent_id           BIGINT                NOT NULL REFERENCES parents (id) ON DELETE CASCADE,
    relationship        guardian_relationship NOT NULL DEFAULT 'OTHER',
    is_primary_contact  BOOLEAN               NOT NULL DEFAULT FALSE,
    is_emergency_contact BOOLEAN              NOT NULL DEFAULT FALSE,
    can_pick_up         BOOLEAN               NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
    UNIQUE (student_id, parent_id)
);

CREATE INDEX student_parents_parent_id_idx ON student_parents (parent_id);
CREATE UNIQUE INDEX student_parents_primary_contact_idx
    ON student_parents (student_id)
    WHERE is_primary_contact;

CREATE TRIGGER student_parents_set_updated_at
    BEFORE UPDATE ON student_parents
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- enrollments — the historical bridge between a student, a year and a class
-- ---------------------------------------------------------------------------
CREATE TABLE enrollments (
    id               BIGSERIAL PRIMARY KEY,
    student_id       BIGINT            NOT NULL REFERENCES students (id) ON DELETE RESTRICT,
    academic_year_id BIGINT            NOT NULL REFERENCES academic_years (id) ON DELETE RESTRICT,
    class_id         BIGINT            NOT NULL REFERENCES classes (id) ON DELETE RESTRICT,
    roll_number      VARCHAR(20),
    enrolled_date    DATE              NOT NULL DEFAULT CURRENT_DATE,
    end_date         DATE,
    status           enrollment_status NOT NULL DEFAULT 'ACTIVE',
    transferred_from BIGINT            REFERENCES enrollments (id) ON DELETE SET NULL,
    remarks          TEXT,
    created_by       BIGINT            REFERENCES users (id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    CONSTRAINT enrollments_date_order_check CHECK (end_date IS NULL OR end_date >= enrolled_date)
);

-- A student may only hold one active enrollment per academic year. Historical
-- rows stay untouched because they are no longer ACTIVE.
CREATE UNIQUE INDEX enrollments_one_active_per_year_idx
    ON enrollments (student_id, academic_year_id)
    WHERE status = 'ACTIVE';

CREATE INDEX enrollments_student_id_idx ON enrollments (student_id);
CREATE INDEX enrollments_class_id_idx ON enrollments (class_id);
CREATE INDEX enrollments_academic_year_id_idx ON enrollments (academic_year_id);
CREATE INDEX enrollments_status_idx ON enrollments (status);

CREATE TRIGGER enrollments_set_updated_at
    BEFORE UPDATE ON enrollments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- +migrate Down

DROP TABLE IF EXISTS enrollments;
DROP TABLE IF EXISTS student_parents;
DROP TABLE IF EXISTS parents;
DROP TABLE IF EXISTS students;
DROP TYPE IF EXISTS guardian_relationship;
DROP TYPE IF EXISTS enrollment_status;
DROP TYPE IF EXISTS student_status;
