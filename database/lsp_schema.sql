-- ============================================================
-- 도서관 서비스 플랫폼(LSP) 확장 스키마
-- 전자자원 관리 · 라이선스 · 이용통계 · 링크리졸버
-- PostgreSQL 16+
--
-- 주의: 여기 정의된 4개 테이블은 schema.sql 에도 들어 있고, schema.sql 쪽이
-- 최신이다(usage_stats 중복 방지 UNIQUE 인덱스가 그쪽에만 있다).
-- 신규 구축은 schema.sql 하나로 끝난다. 이 파일은 LSP 확장분만 따로 보고 싶을 때
-- 참고용이며, 이미 만들어진 DB에 다시 돌려도 통과하도록 IF NOT EXISTS 를 붙였다.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. e_resources (전자자원)
-- ------------------------------------------------------------
-- 전자저널, 전자책, 데이터베이스 등 전자자원을 관리한다.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS e_resources (
    id             BIGSERIAL    PRIMARY KEY,
    title          TEXT         NOT NULL,                          -- 전자자원명
    resource_type  VARCHAR(20)  NOT NULL                           -- 자원 유형
                   CHECK (resource_type IN ('journal', 'ebook', 'database')),
    provider       VARCHAR(200),                                   -- 제공기관 (예: Elsevier, Springer)
    platform_url   TEXT,                                           -- 플랫폼 접속 URL
    issn           VARCHAR(9),                                     -- ISSN (전자저널용)
    isbn           VARCHAR(20),                                    -- ISBN (전자책용)
    subject        VARCHAR(200),                                   -- 주제 분야
    status         VARCHAR(20)  NOT NULL DEFAULT 'active'          -- 구독 상태
                   CHECK (status IN ('active', 'trial', 'cancelled')),
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE  e_resources               IS '전자자원 — 전자저널·전자책·데이터베이스 관리';
COMMENT ON COLUMN e_resources.resource_type  IS '자원 유형: journal(전자저널), ebook(전자책), database(데이터베이스)';
COMMENT ON COLUMN e_resources.provider       IS '콘텐츠 제공기관 (출판사 또는 애그리게이터)';
COMMENT ON COLUMN e_resources.status         IS '구독 상태: active(구독중), trial(시범운영), cancelled(해지)';

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_eres_type     ON e_resources (resource_type);
CREATE INDEX IF NOT EXISTS idx_eres_provider ON e_resources (provider);
CREATE INDEX IF NOT EXISTS idx_eres_issn     ON e_resources (issn) WHERE issn IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_eres_isbn     ON e_resources (isbn) WHERE isbn IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_eres_status   ON e_resources (status);
CREATE INDEX IF NOT EXISTS idx_eres_title    ON e_resources USING gin (to_tsvector('simple', title));


-- ------------------------------------------------------------
-- 2. licenses (라이선스)
-- ------------------------------------------------------------
-- 전자자원별 라이선스 조건을 관리한다.
-- 구독형/영구구매, 동시이용자수, ILL 허용 여부 등을 포함한다.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS licenses (
    id               BIGSERIAL      PRIMARY KEY,
    e_resource_id    BIGINT         NOT NULL REFERENCES e_resources(id) ON DELETE CASCADE,
    license_type     VARCHAR(20)    NOT NULL                           -- 라이선스 유형
                     CHECK (license_type IN ('perpetual', 'subscription')),
    start_date       DATE           NOT NULL,                          -- 계약 시작일
    end_date         DATE,                                             -- 계약 종료일 (영구구매 시 NULL)
    concurrent_users INTEGER,                                          -- 동시이용자 수 (NULL = 무제한)
    ill_allowed      BOOLEAN        NOT NULL DEFAULT FALSE,            -- 상호대차(ILL) 허용 여부
    remote_access    BOOLEAN        NOT NULL DEFAULT TRUE,             -- 원격접속 허용 여부
    tdm_allowed      BOOLEAN        NOT NULL DEFAULT FALSE,            -- 텍스트·데이터마이닝(TDM) 허용 여부
    perpetual_access BOOLEAN        NOT NULL DEFAULT FALSE,            -- 영구접근권 보장 여부
    annual_cost      NUMERIC(14,2),                                    -- 연간 비용
    currency         CHAR(3)        NOT NULL DEFAULT 'KRW',            -- 통화 코드 (ISO 4217)
    vendor_contact   VARCHAR(300),                                     -- 벤더 담당자 연락처
    notes            TEXT                                               -- 특이사항
);

COMMENT ON TABLE  licenses                  IS '라이선스 — 전자자원 계약 조건 관리';
COMMENT ON COLUMN licenses.license_type     IS '라이선스 유형: perpetual(영구구매), subscription(구독)';
COMMENT ON COLUMN licenses.concurrent_users IS '동시이용자 수 (NULL이면 무제한)';
COMMENT ON COLUMN licenses.ill_allowed      IS '상호대차(ILL) 허용 여부';
COMMENT ON COLUMN licenses.tdm_allowed      IS '텍스트·데이터마이닝(TDM) 허용 여부';
COMMENT ON COLUMN licenses.perpetual_access IS '구독 해지 후 영구접근권 보장 여부';

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_lic_eres       ON licenses (e_resource_id);
CREATE INDEX IF NOT EXISTS idx_lic_type       ON licenses (license_type);
CREATE INDEX IF NOT EXISTS idx_lic_dates      ON licenses (start_date, end_date);


-- ------------------------------------------------------------
-- 3. usage_stats (COUNTER 이용통계)
-- ------------------------------------------------------------
-- COUNTER R5 표준 기반 전자자원 이용통계를 저장한다.
-- report_type은 COUNTER 보고서 유형(TR/DR/PR/IR)을 따른다.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usage_stats (
    id                    BIGSERIAL   PRIMARY KEY,
    e_resource_id         BIGINT      NOT NULL REFERENCES e_resources(id) ON DELETE CASCADE,
    report_type           VARCHAR(2)  NOT NULL                           -- COUNTER 보고서 유형
                          CHECK (report_type IN ('TR', 'DR', 'PR', 'IR')),
    period_year           SMALLINT    NOT NULL,                          -- 통계 연도
    period_month          SMALLINT    NOT NULL                           -- 통계 월 (1~12)
                          CHECK (period_month BETWEEN 1 AND 12),
    total_item_requests   INTEGER     NOT NULL DEFAULT 0,                -- 총 아이템 요청 수
    unique_title_requests INTEGER     NOT NULL DEFAULT 0,                -- 고유 타이틀 요청 수
    collected_at          TIMESTAMPTZ NOT NULL DEFAULT now(),            -- 통계 수집 일시
    UNIQUE (e_resource_id, report_type, period_year, period_month)       -- 중복 방지
);

COMMENT ON TABLE  usage_stats                       IS 'COUNTER R5 이용통계 — 전자자원 월별 이용 데이터';
COMMENT ON COLUMN usage_stats.report_type           IS 'COUNTER 보고서 유형: TR(Title), DR(Database), PR(Platform), IR(Item)';
COMMENT ON COLUMN usage_stats.total_item_requests   IS '총 아이템 요청 수 (Total_Item_Requests)';
COMMENT ON COLUMN usage_stats.unique_title_requests IS '고유 타이틀 요청 수 (Unique_Title_Requests)';

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_usage_eres     ON usage_stats (e_resource_id);
CREATE INDEX IF NOT EXISTS idx_usage_period   ON usage_stats (period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_usage_report   ON usage_stats (report_type);


-- ------------------------------------------------------------
-- 4. link_resolver_knowledge_base (링크리졸버 지식베이스)
-- ------------------------------------------------------------
-- OpenURL 링크리졸버가 참조하는 커버리지 정보를 관리한다.
-- 전자자원별 수록 범위, 엠바고, OpenURL 베이스를 저장한다.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS link_resolver_knowledge_base (
    id              BIGSERIAL   PRIMARY KEY,
    e_resource_id   BIGINT      NOT NULL REFERENCES e_resources(id) ON DELETE CASCADE,
    coverage_start  DATE,                                              -- 수록 시작일
    coverage_end    DATE,                                              -- 수록 종료일 (NULL = 현재까지)
    embargo_months  SMALLINT    DEFAULT 0,                             -- 엠바고 기간 (월)
    open_url_base   TEXT                                               -- OpenURL 베이스 URL
);

COMMENT ON TABLE  link_resolver_knowledge_base                IS '링크리졸버 지식베이스 — OpenURL 커버리지 관리';
COMMENT ON COLUMN link_resolver_knowledge_base.coverage_start IS '수록 시작일 (이용 가능한 가장 오래된 호)';
COMMENT ON COLUMN link_resolver_knowledge_base.coverage_end   IS '수록 종료일 (NULL이면 현재까지 수록)';
COMMENT ON COLUMN link_resolver_knowledge_base.embargo_months IS '엠바고 기간 (월 단위, 0이면 엠바고 없음)';
COMMENT ON COLUMN link_resolver_knowledge_base.open_url_base  IS 'OpenURL base URL (예: https://resolver.example.com/openurl)';

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_lrkb_eres      ON link_resolver_knowledge_base (e_resource_id);
CREATE INDEX IF NOT EXISTS idx_lrkb_coverage  ON link_resolver_knowledge_base (coverage_start, coverage_end);

COMMIT;
