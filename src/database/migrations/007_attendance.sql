-- +migrate Up

CREATE TYPE attendance_status AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED', 'LEAVE');

-- ---------------------------------------------------------------------------
-- attendance_reasons — reusable reason catalogue for absences and leave
-- ---------------------------------------------------------------------------
CREATE TABLE attendance_reasons (
    id          BIGSERIAL PRIMARY KEY,
    code        VARCHAR(40)  NOT NULL UNIQUE,
    name_en     VARCHAR(120) NOT NULL,
    name_kh     VARCHAR(120),
    applies_to  attendance_status,
    is_excused  BOOLEAN      NOT NULL DEFAULT FALSE,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TRIGGER attendance_reasons_set_updated_at
    BEFORE UPDATE ON attendance_reasons
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- attendance — one row per student, per class, per date (optionally per period)
-- ---------------------------------------------------------------------------
CREATE TABLE attendance (
    id               BIGSERIAL PRIMARY KEY,
    student_id       BIGINT            NOT NULL REFERENCES students (id) ON DELETE RESTRICT,
    class_id         BIGINT            NOT NULL REFERENCES classes (id) ON DELETE RESTRICT,
    enrollment_id    BIGINT            REFERENCES enrollments (id) ON DELETE SET NULL,
    academic_year_id BIGINT            NOT NULL REFERENCES academic_years (id) ON DELETE RESTRICT,
    schedule_id      BIGINT            REFERENCES schedules (id) ON DELETE SET NULL,
    subject_id       BIGINT            REFERENCES subjects (id) ON DELETE SET NULL,
    attendance_date  DATE              NOT NULL,
    period_number    INTEGER,
    status           attendance_status NOT NULL,
    reason_id        BIGINT            REFERENCES attendance_reasons (id) ON DELETE SET NULL,
    note             TEXT,
    minutes_late     INTEGER,
    recorded_by      BIGINT            REFERENCES users (id) ON DELETE SET NULL,
    updated_by       BIGINT            REFERENCES users (id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    CONSTRAINT attendance_minutes_late_check CHECK (minutes_late IS NULL OR minutes_late >= 0)
);

-- Daily attendance (no period) is unique per student and date.
CREATE UNIQUE INDEX attendance_daily_unique_idx
    ON attendance (student_id, attendance_date)
    WHERE period_number IS NULL;

-- Period attendance is unique per student, date and period.
CREATE UNIQUE INDEX attendance_period_unique_idx
    ON attendance (student_id, attendance_date, period_number)
    WHERE period_number IS NOT NULL;

CREATE INDEX attendance_class_date_idx ON attendance (class_id, attendance_date);
CREATE INDEX attendance_student_date_idx ON attendance (student_id, attendance_date);
CREATE INDEX attendance_status_idx ON attendance (status);
CREATE INDEX attendance_academic_year_id_idx ON attendance (academic_year_id);

CREATE TRIGGER attendance_set_updated_at
    BEFORE UPDATE ON attendance
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- +migrate Down

DROP TABLE IF EXISTS attendance;
DROP TABLE IF EXISTS attendance_reasons;
DROP TYPE IF EXISTS attendance_status;
