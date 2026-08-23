-- +migrate Up

CREATE TYPE weekday AS ENUM (
    'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'
);

-- ---------------------------------------------------------------------------
-- schedules — one recurring weekly period for a class
-- ---------------------------------------------------------------------------
CREATE TABLE schedules (
    id               BIGSERIAL PRIMARY KEY,
    academic_year_id BIGINT      NOT NULL REFERENCES academic_years (id) ON DELETE RESTRICT,
    class_id         BIGINT      NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
    subject_id       BIGINT      NOT NULL REFERENCES subjects (id) ON DELETE RESTRICT,
    teacher_id       BIGINT      REFERENCES teachers (id) ON DELETE SET NULL,
    room_id          BIGINT      REFERENCES rooms (id) ON DELETE SET NULL,
    day_of_week      weekday     NOT NULL,
    period_number    INTEGER,
    start_time       TIME        NOT NULL,
    end_time         TIME        NOT NULL,
    effective_from   DATE,
    effective_to     DATE,
    notes            TEXT,
    is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT schedules_time_order_check CHECK (end_time > start_time),
    CONSTRAINT schedules_effective_range_check
        CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
);

CREATE INDEX schedules_class_day_idx ON schedules (class_id, day_of_week);
CREATE INDEX schedules_teacher_day_idx ON schedules (teacher_id, day_of_week);
CREATE INDEX schedules_room_day_idx ON schedules (room_id, day_of_week);
CREATE INDEX schedules_academic_year_id_idx ON schedules (academic_year_id);

CREATE TRIGGER schedules_set_updated_at
    BEFORE UPDATE ON schedules
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- +migrate Down

DROP TABLE IF EXISTS schedules;
DROP TYPE IF EXISTS weekday;
