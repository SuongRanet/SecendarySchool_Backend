-- +migrate Up

CREATE TYPE gender AS ENUM ('MALE', 'FEMALE', 'OTHER');
CREATE TYPE staff_status AS ENUM ('ACTIVE', 'INACTIVE', 'ON_LEAVE', 'RESIGNED');

-- ---------------------------------------------------------------------------
-- teachers — domain profile, separate from the authentication identity
-- ---------------------------------------------------------------------------
CREATE TABLE teachers (
    id             BIGSERIAL PRIMARY KEY,
    user_id        BIGINT       UNIQUE REFERENCES users (id) ON DELETE SET NULL,
    teacher_code   VARCHAR(30)  NOT NULL UNIQUE,
    first_name_en  VARCHAR(100) NOT NULL,
    last_name_en   VARCHAR(100) NOT NULL,
    first_name_kh  VARCHAR(100),
    last_name_kh   VARCHAR(100),
    gender         gender,
    date_of_birth  DATE,
    national_id    VARCHAR(50),
    phone_number   VARCHAR(30),
    email          VARCHAR(255),
    address        TEXT,
    qualification  VARCHAR(150),
    specialization VARCHAR(150),
    hire_date      DATE,
    status         staff_status NOT NULL DEFAULT 'ACTIVE',
    profile_photo  TEXT,
    notes          TEXT,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at     TIMESTAMPTZ
);

CREATE INDEX teachers_status_idx ON teachers (status);
CREATE INDEX teachers_deleted_at_idx ON teachers (deleted_at);
CREATE INDEX teachers_name_idx ON teachers (LOWER(first_name_en), LOWER(last_name_en));

CREATE TRIGGER teachers_set_updated_at
    BEFORE UPDATE ON teachers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- teacher_subjects — subjects a teacher is qualified to teach
-- ---------------------------------------------------------------------------
CREATE TABLE teacher_subjects (
    id         BIGSERIAL PRIMARY KEY,
    teacher_id BIGINT      NOT NULL REFERENCES teachers (id) ON DELETE CASCADE,
    subject_id BIGINT      NOT NULL REFERENCES subjects (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (teacher_id, subject_id)
);

CREATE INDEX teacher_subjects_subject_id_idx ON teacher_subjects (subject_id);

-- +migrate Down

DROP TABLE IF EXISTS teacher_subjects;
DROP TABLE IF EXISTS teachers;
DROP TYPE IF EXISTS staff_status;
DROP TYPE IF EXISTS gender;
