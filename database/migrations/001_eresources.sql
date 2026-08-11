-- 5장(LSP) 전자자원 관련 테이블 마이그레이션
-- 단일 트랜잭션으로 실행 — 실패 시 전체 롤백
--
-- 주의: 이 4개 테이블은 이후 schema.sql 에 흡수됐다. 신규 구축은 schema.sql
-- 하나만 실행하면 되고, 이 파일은 그 이전에 만들어진 DB를 위해 남겨둔다.
-- schema.sql 을 먼저 실행한 DB에서도 그냥 통과하도록 IF NOT EXISTS 를 붙였다.
BEGIN;

-- ===========================================
-- 11. e_resources
-- ===========================================
CREATE TABLE IF NOT EXISTS e_resources (
    id              SERIAL PRIMARY KEY,
    title           VARCHAR(500) NOT NULL,
    resource_type   VARCHAR(20) NOT NULL
                    CHECK (resource_type IN ('journal', 'ebook', 'database')),
    provider        VARCHAR(200),
    platform_url    TEXT,
    issn            VARCHAR(20),
    isbn            VARCHAR(20),
    subject         VARCHAR(200),
    status          VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'trial', 'cancelled')),
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eres_type     ON e_resources (resource_type);
CREATE INDEX IF NOT EXISTS idx_eres_provider ON e_resources (provider);
CREATE INDEX IF NOT EXISTS idx_eres_status   ON e_resources (status);
CREATE INDEX IF NOT EXISTS idx_eres_issn     ON e_resources (issn);
CREATE INDEX IF NOT EXISTS idx_eres_isbn     ON e_resources (isbn);
CREATE INDEX IF NOT EXISTS idx_eres_title    ON e_resources USING gin (to_tsvector('simple', title));

-- ===========================================
-- 12. licenses
-- ===========================================
CREATE TABLE IF NOT EXISTS licenses (
    id                  SERIAL PRIMARY KEY,
    e_resource_id       INTEGER NOT NULL REFERENCES e_resources(id) ON DELETE CASCADE,
    license_type        VARCHAR(20) NOT NULL
                        CHECK (license_type IN ('perpetual', 'subscription')),
    start_date          DATE,
    end_date            DATE,
    concurrent_users    INTEGER,
    ill_allowed         BOOLEAN NOT NULL DEFAULT FALSE,
    remote_access       BOOLEAN NOT NULL DEFAULT TRUE,
    tdm_allowed         BOOLEAN NOT NULL DEFAULT FALSE,
    perpetual_access    BOOLEAN NOT NULL DEFAULT FALSE,
    annual_cost         NUMERIC(14, 2),
    currency            CHAR(3) NOT NULL DEFAULT 'KRW',
    vendor_contact      VARCHAR(300),
    notes               TEXT
);

CREATE INDEX IF NOT EXISTS idx_lic_eres     ON licenses (e_resource_id);
CREATE INDEX IF NOT EXISTS idx_lic_type     ON licenses (license_type);
CREATE INDEX IF NOT EXISTS idx_lic_end_date ON licenses (end_date);

-- ===========================================
-- 13. usage_stats
-- ===========================================
CREATE TABLE IF NOT EXISTS usage_stats (
    id                      SERIAL PRIMARY KEY,
    e_resource_id           INTEGER NOT NULL REFERENCES e_resources(id) ON DELETE CASCADE,
    report_type             CHAR(2) NOT NULL
                            CHECK (report_type IN ('TR', 'PR', 'DR', 'IR')),
    period_year             SMALLINT NOT NULL,
    period_month            SMALLINT NOT NULL
                            CHECK (period_month BETWEEN 1 AND 12),
    total_item_requests     INTEGER NOT NULL DEFAULT 0,
    unique_title_requests   INTEGER NOT NULL DEFAULT 0,
    collected_at            TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stats_eres        ON usage_stats (e_resource_id);
CREATE INDEX IF NOT EXISTS idx_stats_period      ON usage_stats (period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_stats_report_type ON usage_stats (report_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_stats_unique
    ON usage_stats (e_resource_id, report_type, period_year, period_month);

-- ===========================================
-- 14. link_resolver_knowledge_base
-- ===========================================
CREATE TABLE IF NOT EXISTS link_resolver_knowledge_base (
    id              SERIAL PRIMARY KEY,
    e_resource_id   INTEGER NOT NULL REFERENCES e_resources(id) ON DELETE CASCADE,
    coverage_start  DATE,
    coverage_end    DATE,
    embargo_months  SMALLINT DEFAULT 0,
    open_url_base   TEXT
);

CREATE INDEX IF NOT EXISTS idx_kb_eres     ON link_resolver_knowledge_base (e_resource_id);
CREATE INDEX IF NOT EXISTS idx_kb_coverage ON link_resolver_knowledge_base (coverage_start, coverage_end);

-- ===========================================
-- updated_at 자동 갱신 트리거 (재실행 안전)
-- ===========================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bib_records_updated_at ON bib_records;
CREATE TRIGGER trg_bib_records_updated_at
    BEFORE UPDATE ON bib_records
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

COMMIT;
