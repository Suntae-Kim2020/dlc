-- OAI-PMH 수확 이력 테이블
-- 단일 트랜잭션 — 실패 시 전체 롤백
BEGIN;

CREATE TABLE IF NOT EXISTS oai_harvests (
    id              SERIAL PRIMARY KEY,
    started_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    finished_at     TIMESTAMP,
    source          VARCHAR(50) NOT NULL DEFAULT 'arxiv',
    triggered_by    VARCHAR(20) NOT NULL DEFAULT 'manual'
                    CHECK (triggered_by IN ('manual', 'cron', 'dev_migration')),
    status          VARCHAR(20) NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running', 'success', 'failed', 'partial')),
    from_date       DATE,
    until_date      DATE,
    total           INTEGER NOT NULL DEFAULT 0,
    harvested       INTEGER NOT NULL DEFAULT 0,
    pg_ok           INTEGER NOT NULL DEFAULT 0,
    es_ok           INTEGER NOT NULL DEFAULT 0,
    basex_ok        INTEGER NOT NULL DEFAULT 0,
    errors          INTEGER NOT NULL DEFAULT 0,
    error_message   TEXT
);

CREATE INDEX IF NOT EXISTS idx_oai_started     ON oai_harvests (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_oai_status      ON oai_harvests (status);
CREATE INDEX IF NOT EXISTS idx_oai_triggered   ON oai_harvests (triggered_by);

COMMIT;
