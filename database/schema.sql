-- ===========================================
-- 대학도서관 자동화시스템(LAS) + LSP 데이터베이스 스키마
-- PostgreSQL 16
-- ===========================================
--
-- 본 스키마는 두 영역의 테이블을 하나의 데이터베이스에 통합한다.
--
--   ① LAS (도서관 자동화시스템) — 1~10번 테이블
--      bib_records, marc_fields, authors, bib_authors,
--      subjects, bib_subjects, users, items, loans, acquisitions
--
--   ② LSP (도서관 서비스 플랫폼) — 11~14번 테이블
--      e_resources, licenses, usage_stats,
--      link_resolver_knowledge_base
--
-- LSP 관련 4개 테이블은 5장 실습에서 본격적으로 활용한다.
-- 3장 시점에서는 테이블 구조만 익혀두면 된다.
-- ===========================================

BEGIN;

-- ===========================================
-- 기존 테이블 삭제 (의존성 역순)
-- ===========================================
-- LSP 테이블 (의존성 역순)
DROP TABLE IF EXISTS link_resolver_knowledge_base CASCADE;
DROP TABLE IF EXISTS usage_stats CASCADE;
DROP TABLE IF EXISTS licenses CASCADE;
DROP TABLE IF EXISTS e_resources CASCADE;

-- LAS 테이블 (의존성 역순)
DROP TABLE IF EXISTS acquisitions CASCADE;
DROP TABLE IF EXISTS loans CASCADE;
DROP TABLE IF EXISTS items CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS bib_subjects CASCADE;
DROP TABLE IF EXISTS subjects CASCADE;
DROP TABLE IF EXISTS bib_authors CASCADE;
DROP TABLE IF EXISTS authors CASCADE;
DROP TABLE IF EXISTS marc_fields CASCADE;
DROP TABLE IF EXISTS bib_records CASCADE;
DROP FUNCTION IF EXISTS update_updated_at CASCADE;

-- ===========================================
-- 1. bib_records (서지 레코드 - MARC 핵심 필드)
-- ===========================================
CREATE TABLE bib_records (
    id              SERIAL PRIMARY KEY,
    control_number  VARCHAR(50) NOT NULL UNIQUE,   -- MARC 001 제어번호
    isbn            VARCHAR(20),                    -- MARC 020 ISBN
    call_number     VARCHAR(100),                   -- MARC 090/050 청구기호
    title           TEXT NOT NULL,                  -- MARC 245$a 본표제
    statement_of_resp VARCHAR(500),                 -- MARC 245$c 책임표시
    main_entry      VARCHAR(300),                   -- MARC 100/110 기본표목
    publisher       VARCHAR(300),                   -- MARC 260/264$b 발행처
    pub_year        SMALLINT,                       -- MARC 260/264$c 발행년
    extent          VARCHAR(200),                   -- MARC 300$a 형태사항
    abstract        TEXT,                           -- MARC 520 초록
    ddc_number      VARCHAR(30),                    -- MARC 082 DDC 분류번호
    electronic_url  TEXT,                           -- MARC 856$u 전자자원 URL
    record_status   VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK (record_status IN ('active', 'deleted', 'draft')),
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 서지 레코드 인덱스
CREATE INDEX idx_bib_isbn ON bib_records (isbn);
CREATE INDEX idx_bib_call_number ON bib_records (call_number);
CREATE INDEX idx_bib_title ON bib_records USING gin (to_tsvector('simple', title));
CREATE INDEX idx_bib_pub_year ON bib_records (pub_year);
CREATE INDEX idx_bib_ddc_number ON bib_records (ddc_number);
CREATE INDEX idx_bib_record_status ON bib_records (record_status);

-- ===========================================
-- 2. marc_fields (MARC EAV 테이블 - 나머지 MARC 필드)
-- ===========================================
CREATE TABLE marc_fields (
    id              SERIAL PRIMARY KEY,
    bib_id          INTEGER NOT NULL REFERENCES bib_records(id) ON DELETE CASCADE,
    tag             CHAR(3) NOT NULL,               -- MARC 태그 (예: 650, 700)
    ind1            CHAR(1) DEFAULT ' ',            -- 지시기호 1
    ind2            CHAR(1) DEFAULT ' ',            -- 지시기호 2
    subfield_code   CHAR(1) NOT NULL,               -- 식별기호 (예: a, b, c)
    subfield_value  TEXT NOT NULL,                   -- 식별기호 값
    field_order     SMALLINT NOT NULL DEFAULT 0      -- 필드 순서 (반복 필드 정렬용)
);

-- MARC 필드 인덱스
CREATE INDEX idx_marc_bib_id ON marc_fields (bib_id);
CREATE INDEX idx_marc_tag ON marc_fields (tag);
CREATE INDEX idx_marc_bib_tag ON marc_fields (bib_id, tag);

-- ===========================================
-- 3. authors (저자)
-- ===========================================
CREATE TABLE authors (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(300) NOT NULL,           -- 저자명
    name_type       VARCHAR(20) NOT NULL DEFAULT 'personal'
                    CHECK (name_type IN ('personal', 'corporate')),
    orcid           VARCHAR(30),                     -- ORCID 식별자
    affiliation     VARCHAR(300)                     -- 소속기관
);

-- 저자 인덱스
CREATE INDEX idx_authors_name ON authors (name);
CREATE UNIQUE INDEX idx_authors_orcid ON authors (orcid) WHERE orcid IS NOT NULL;

-- ===========================================
-- 4. bib_authors (서지-저자 연결 M:N)
-- ===========================================
CREATE TABLE bib_authors (
    bib_id          INTEGER NOT NULL REFERENCES bib_records(id) ON DELETE CASCADE,
    author_id       INTEGER NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
    role            VARCHAR(10) NOT NULL DEFAULT 'main'
                    CHECK (role IN ('main', 'added')),  -- 기본저자/부출저자
    author_order    SMALLINT NOT NULL DEFAULT 0,         -- 저자 표시 순서
    PRIMARY KEY (bib_id, author_id)
);

CREATE INDEX idx_bib_authors_author ON bib_authors (author_id);

-- ===========================================
-- 5. subjects (주제명)
-- ===========================================
CREATE TABLE subjects (
    id              SERIAL PRIMARY KEY,
    term            VARCHAR(500) NOT NULL,           -- 주제명
    scheme          VARCHAR(20) NOT NULL DEFAULT 'LCSH'
                    CHECK (scheme IN ('LCSH', 'DDC', 'KDC', 'MESH', 'OTHER')),
    lang            CHAR(3) NOT NULL DEFAULT 'kor'   -- ISO 639-3 언어코드
);

-- 주제명 인덱스
CREATE UNIQUE INDEX idx_subjects_term_scheme ON subjects (term, scheme);
CREATE INDEX idx_subjects_scheme ON subjects (scheme);

-- ===========================================
-- 6. bib_subjects (서지-주제 연결 M:N)
-- ===========================================
CREATE TABLE bib_subjects (
    bib_id          INTEGER NOT NULL REFERENCES bib_records(id) ON DELETE CASCADE,
    subject_id      INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    PRIMARY KEY (bib_id, subject_id)
);

CREATE INDEX idx_bib_subjects_subject ON bib_subjects (subject_id);

-- ===========================================
-- 7. users (이용자)
-- ===========================================
CREATE TABLE users (
    id              SERIAL PRIMARY KEY,
    user_number     VARCHAR(30) NOT NULL UNIQUE,     -- 학번/교번/직원번호
    name            VARCHAR(100) NOT NULL,
    email           VARCHAR(200) UNIQUE,
    phone           VARCHAR(20),
    affiliation     VARCHAR(200),                    -- 소속 (학과, 부서)
    user_type       VARCHAR(20) NOT NULL DEFAULT 'student'
                    CHECK (user_type IN ('student', 'faculty', 'staff')),
    status          VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'suspended')),
    join_date       DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 이용자 인덱스
CREATE INDEX idx_users_name ON users (name);
CREATE INDEX idx_users_type ON users (user_type);
CREATE INDEX idx_users_status ON users (status);

-- ===========================================
-- 8. items (소장 항목 - 같은 책이라도 권호별로 관리)
-- ===========================================
CREATE TABLE items (
    id              SERIAL PRIMARY KEY,
    bib_id          INTEGER NOT NULL REFERENCES bib_records(id) ON DELETE CASCADE,
    barcode         VARCHAR(50) NOT NULL UNIQUE,     -- 바코드 번호
    location        VARCHAR(100),                    -- 소장 위치 (예: 중앙도서관 3층)
    item_status     VARCHAR(20) NOT NULL DEFAULT 'available'
                    CHECK (item_status IN ('available', 'on_loan', 'lost')),
    acquisition_date DATE                            -- 입수일
);

-- 소장 항목 인덱스
CREATE INDEX idx_items_bib_id ON items (bib_id);
CREATE INDEX idx_items_status ON items (item_status);
CREATE INDEX idx_items_location ON items (location);

-- ===========================================
-- 9. loans (대출)
-- ===========================================
CREATE TABLE loans (
    id              SERIAL PRIMARY KEY,
    item_id         INTEGER NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    loan_date       DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date        DATE NOT NULL,
    return_date     DATE,
    status          VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'returned', 'overdue'))
);

-- 대출 인덱스
CREATE INDEX idx_loans_item_id ON loans (item_id);
CREATE INDEX idx_loans_user_id ON loans (user_id);
CREATE INDEX idx_loans_status ON loans (status);
CREATE INDEX idx_loans_due_date ON loans (due_date) WHERE status = 'active';

-- ===========================================
-- 10. acquisitions (수서)
-- ===========================================
CREATE TABLE acquisitions (
    id              SERIAL PRIMARY KEY,
    title           TEXT NOT NULL,                   -- 주문 도서명
    author          VARCHAR(300),
    isbn            VARCHAR(20),
    publisher       VARCHAR(300),
    quantity        SMALLINT NOT NULL DEFAULT 1,     -- 주문 수량
    unit_price      NUMERIC(12, 2),                  -- 단가
    order_date      DATE,                            -- 주문일
    receive_date    DATE,                            -- 입수일
    status          VARCHAR(20) NOT NULL DEFAULT 'ordered'
                    CHECK (status IN ('ordered', 'received', 'cataloged')),
    fund_code       VARCHAR(30)                      -- 예산 코드
);

-- 수서 인덱스
CREATE INDEX idx_acq_isbn ON acquisitions (isbn);
CREATE INDEX idx_acq_status ON acquisitions (status);
CREATE INDEX idx_acq_order_date ON acquisitions (order_date);
CREATE INDEX idx_acq_fund_code ON acquisitions (fund_code);

-- ===========================================
-- 11. e_resources (전자자원 - 저널/이북/DB)
-- ===========================================
-- 도서관이 구독·구매·평가판으로 보유한 전자자원의 본체 정보를 관리한다.
-- 5장(LSP)에서 본격적으로 활용한다.
CREATE TABLE e_resources (
    id              SERIAL PRIMARY KEY,
    title           VARCHAR(500) NOT NULL,           -- 자원명 (예: Nature, Science)
    resource_type   VARCHAR(20) NOT NULL
                    CHECK (resource_type IN ('journal', 'ebook', 'database')),
    provider        VARCHAR(200),                    -- 제공처 (예: Springer Nature)
    platform_url    TEXT,                            -- 플랫폼 접속 URL
    issn            VARCHAR(20),                     -- 전자저널 ISSN
    isbn            VARCHAR(20),                     -- 전자책 ISBN
    subject         VARCHAR(200),                    -- 주제 분야
    status          VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'trial', 'cancelled')),
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 전자자원 인덱스
CREATE INDEX idx_eres_type ON e_resources (resource_type);
CREATE INDEX idx_eres_provider ON e_resources (provider);
CREATE INDEX idx_eres_status ON e_resources (status);
CREATE INDEX idx_eres_issn ON e_resources (issn);
CREATE INDEX idx_eres_isbn ON e_resources (isbn);
CREATE INDEX idx_eres_title ON e_resources USING gin (to_tsvector('simple', title));

-- ===========================================
-- 12. licenses (라이선스)
-- ===========================================
-- 전자자원의 계약 조건을 관리한다.
-- 동시접속 인원, ILL 허용 여부, 원격접속, TDM 허용 등
-- 라이선스 조항을 구조화해 의사결정에 활용한다.
CREATE TABLE licenses (
    id                  SERIAL PRIMARY KEY,
    e_resource_id       INTEGER NOT NULL REFERENCES e_resources(id) ON DELETE CASCADE,
    license_type        VARCHAR(20) NOT NULL
                        CHECK (license_type IN ('perpetual', 'subscription')),
    start_date          DATE,                        -- 계약 시작일
    end_date            DATE,                        -- 계약 종료일
    concurrent_users    INTEGER,                     -- 동시접속 인원 (NULL = 무제한)
    ill_allowed         BOOLEAN NOT NULL DEFAULT FALSE,   -- 상호대차 허용 여부
    remote_access       BOOLEAN NOT NULL DEFAULT TRUE,    -- 원격접속 허용 여부
    tdm_allowed         BOOLEAN NOT NULL DEFAULT FALSE,   -- 텍스트·데이터 마이닝 허용
    perpetual_access    BOOLEAN NOT NULL DEFAULT FALSE,   -- 영구접근권 보유 여부
    annual_cost         NUMERIC(14, 2),              -- 연간 구독료 (원)
    currency            CHAR(3) NOT NULL DEFAULT 'KRW',   -- ISO 4217 통화코드
    vendor_contact      VARCHAR(300),                -- 벤더 담당자 연락처
    notes               TEXT                         -- 비고
);

-- 라이선스 인덱스
CREATE INDEX idx_lic_eres ON licenses (e_resource_id);
CREATE INDEX idx_lic_type ON licenses (license_type);
CREATE INDEX idx_lic_end_date ON licenses (end_date);  -- 만료 임박 자원 조회용

-- ===========================================
-- 13. usage_stats (COUNTER 이용통계)
-- ===========================================
-- SUSHI 프로토콜로 출판사로부터 자동 수집한 COUNTER 보고서를 저장한다.
-- 보고서 유형: TR(Title Report), PR(Platform Report),
--             DR(Database Report), IR(Item Report)
CREATE TABLE usage_stats (
    id                      SERIAL PRIMARY KEY,
    e_resource_id           INTEGER NOT NULL REFERENCES e_resources(id) ON DELETE CASCADE,
    report_type             CHAR(2) NOT NULL
                            CHECK (report_type IN ('TR', 'PR', 'DR', 'IR')),
    period_year             SMALLINT NOT NULL,       -- 통계 연도 (예: 2024)
    period_month            SMALLINT NOT NULL
                            CHECK (period_month BETWEEN 1 AND 12),
    total_item_requests     INTEGER NOT NULL DEFAULT 0,   -- 전체 다운로드 횟수
    unique_title_requests   INTEGER NOT NULL DEFAULT 0,   -- 고유 제목 다운로드 수
    collected_at            TIMESTAMP NOT NULL DEFAULT NOW()  -- 수집 시각
);

-- 이용통계 인덱스
CREATE INDEX idx_stats_eres ON usage_stats (e_resource_id);
CREATE INDEX idx_stats_period ON usage_stats (period_year, period_month);
CREATE INDEX idx_stats_report_type ON usage_stats (report_type);
-- 같은 자원·같은 기간·같은 보고서 유형은 한 건만 존재하도록 제약
CREATE UNIQUE INDEX idx_stats_unique
    ON usage_stats (e_resource_id, report_type, period_year, period_month);

-- ===========================================
-- 14. link_resolver_knowledge_base (링크리졸버 지식베이스)
-- ===========================================
-- OpenURL 요청이 들어왔을 때 어느 자원이 어느 기간을 커버하는지
-- 판단하기 위한 지식베이스(Knowledge Base)다.
-- 같은 전자자원이라도 출판사·플랫폼별로 커버리지가 다를 수 있어
-- 별도 행으로 관리한다.
CREATE TABLE link_resolver_knowledge_base (
    id              SERIAL PRIMARY KEY,
    e_resource_id   INTEGER NOT NULL REFERENCES e_resources(id) ON DELETE CASCADE,
    coverage_start  DATE,                            -- 본문 접근 시작 시점
    coverage_end    DATE,                            -- 본문 접근 종료 시점 (NULL=현재까지)
    embargo_months  SMALLINT DEFAULT 0,              -- 엠바고 기간 (개월 수)
    open_url_base   TEXT                             -- OpenURL 베이스 URL
);

-- 지식베이스 인덱스
CREATE INDEX idx_kb_eres ON link_resolver_knowledge_base (e_resource_id);
CREATE INDEX idx_kb_coverage ON link_resolver_knowledge_base (coverage_start, coverage_end);

-- ===========================================
-- updated_at 자동 갱신 트리거
-- ===========================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bib_records_updated_at
    BEFORE UPDATE ON bib_records
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

COMMIT;