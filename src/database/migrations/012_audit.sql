-- +migrate Up

CREATE TYPE audit_action AS ENUM (
    'CREATE', 'UPDATE', 'DELETE', 'ARCHIVE', 'RESTORE',
    'LOGIN', 'LOGOUT', 'PASSWORD_RESET', 'PUBLISH', 'ASSIGN', 'UNASSIGN'
);

-- ---------------------------------------------------------------------------
-- audit_logs — sensitive mutations only, never plain reads
-- ---------------------------------------------------------------------------
CREATE TABLE audit_logs (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT       REFERENCES users (id) ON DELETE SET NULL,
    action      audit_action NOT NULL,
    entity_type VARCHAR(60)  NOT NULL,
    entity_id   BIGINT,
    description VARCHAR(255),
    old_value   JSONB,
    new_value   JSONB,
    ip_address  VARCHAR(64),
    user_agent  TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX audit_logs_user_id_idx ON audit_logs (user_id);
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id);
CREATE INDEX audit_logs_action_idx ON audit_logs (action);
CREATE INDEX audit_logs_created_at_idx ON audit_logs (created_at DESC);

-- +migrate Down

DROP TABLE IF EXISTS audit_logs;
DROP TYPE IF EXISTS audit_action;
