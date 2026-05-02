-- ===========================================
-- 디지털도서관 시스템 추가 인덱스
-- schema.sql 실행 후 적용
-- 기존 인덱스와 중복되지 않는 항목만 포함
-- ===========================================

BEGIN;

-- ===========================================
-- 1. bib_records (서지 레코드)
-- ===========================================

-- 저자명(기본표목) 검색용: OPAC에서 저자 검색 시 사용
-- (schema.sql에 isbn, call_number, pub_year 인덱스는 이미 존재)
CREATE INDEX IF NOT EXISTS idx_bib_main_entry
    ON bib_records (main_entry);

-- 저자명 부분 일치 검색용: ILIKE '%홍길동%' 패턴 검색 가속
CREATE INDEX IF NOT EXISTS idx_bib_main_entry_trgm
    ON bib_records USING gin (main_entry gin_trgm_ops);

-- ISBN 부분 일치 검색용: ISBN 일부만 입력해도 검색 가능
CREATE INDEX IF NOT EXISTS idx_bib_isbn_trgm
    ON bib_records USING gin (isbn gin_trgm_ops);

-- 발행년 + 상태 복합 인덱스: 연도별 활성 레코드 필터링
CREATE INDEX IF NOT EXISTS idx_bib_pub_year_status
    ON bib_records (pub_year, record_status);

-- ===========================================
-- 2. loans (대출)
-- ===========================================

-- 이용자별 활성 대출 조회용: 대출 현황 화면에서 사용
-- (schema.sql에 user_id, item_id, status, due_date 개별 인덱스는 이미 존재)
CREATE INDEX IF NOT EXISTS idx_loans_user_status
    ON loans (user_id, status);

-- 연체 도서 조회용: 활성 대출 중 반납 예정일이 지난 건 검색
CREATE INDEX IF NOT EXISTS idx_loans_overdue
    ON loans (due_date, user_id)
    WHERE status = 'active' AND return_date IS NULL;

-- 대출 이력 날짜순 정렬용: 이용자별 대출 이력 조회 시 사용
CREATE INDEX IF NOT EXISTS idx_loans_user_loan_date
    ON loans (user_id, loan_date DESC);

-- ===========================================
-- 3. items (소장 항목)
-- ===========================================

-- 바코드 검색용: 대출/반납 시 바코드 스캔으로 조회
-- (schema.sql에 bib_id, item_status 인덱스는 이미 존재)
CREATE INDEX IF NOT EXISTS idx_items_barcode
    ON items (barcode);

-- 서지별 대출 가능 항목 조회용: 특정 도서의 대출 가능 권수 확인
CREATE INDEX IF NOT EXISTS idx_items_bib_status
    ON items (bib_id, item_status);

-- ===========================================
-- 4. e_resources (전자자원)
--    tables.md에 정의된 테이블 (schema.sql 확장 시 적용)
-- ===========================================

-- 자원 유형별 조회용: 전자저널/전자책/DB 유형별 필터링
CREATE INDEX IF NOT EXISTS idx_eres_resource_type
    ON e_resources (resource_type);

-- 상태별 조회용: 활성/만료/시범 구독 필터링
CREATE INDEX IF NOT EXISTS idx_eres_status
    ON e_resources (status);

-- 유형 + 상태 복합 인덱스: 유형과 상태를 동시에 필터링
CREATE INDEX IF NOT EXISTS idx_eres_type_status
    ON e_resources (resource_type, status);

-- 구독 기간 조회용: 구독 만료 예정 자원 검색
CREATE INDEX IF NOT EXISTS idx_eres_sub_end
    ON e_resources (sub_end)
    WHERE status = 'active';

-- ===========================================
-- 5. subjects (주제명)
-- ===========================================

-- 주제명 단독 검색용: 주제 브라우징 시 사용
-- (schema.sql에 term+scheme 복합 UNIQUE, scheme 단독 인덱스는 이미 존재)
CREATE INDEX IF NOT EXISTS idx_subjects_term
    ON subjects (term);

-- 주제명 부분 일치 검색용: 주제어 자동완성
CREATE INDEX IF NOT EXISTS idx_subjects_term_trgm
    ON subjects USING gin (term gin_trgm_ops);

COMMIT;

-- ===========================================
-- pg_trgm 확장 활성화 (trigram 인덱스에 필요)
-- 위 인덱스 생성 전에 한 번 실행해야 함
-- 별도 실행: CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- ===========================================


-- ===========================================
-- EXPLAIN ANALYZE 샘플 쿼리
-- 아래 쿼리로 인덱스 적용 여부를 확인할 수 있다.
-- ===========================================

-- [1] 저자명으로 서지 검색 → idx_bib_main_entry 사용 확인
EXPLAIN ANALYZE
SELECT id, title, main_entry, pub_year
FROM bib_records
WHERE main_entry = '홍길동';

-- [2] ISBN 부분 검색 → idx_bib_isbn_trgm 사용 확인
EXPLAIN ANALYZE
SELECT id, title, isbn
FROM bib_records
WHERE isbn LIKE '%9788900%';

-- [3] 연도별 활성 레코드 → idx_bib_pub_year_status 사용 확인
EXPLAIN ANALYZE
SELECT id, title, pub_year
FROM bib_records
WHERE pub_year = 2023 AND record_status = 'active';

-- [4] 이용자별 활성 대출 → idx_loans_user_status 사용 확인
EXPLAIN ANALYZE
SELECT l.id, l.loan_date, l.due_date, b.title
FROM loans l
JOIN items i ON i.id = l.item_id
JOIN bib_records b ON b.id = i.bib_id
WHERE l.user_id = 3 AND l.status = 'active';

-- [5] 연체 도서 조회 → idx_loans_overdue 사용 확인
EXPLAIN ANALYZE
SELECT l.id, l.due_date, u.name, b.title
FROM loans l
JOIN users u ON u.id = l.user_id
JOIN items i ON i.id = l.item_id
JOIN bib_records b ON b.id = i.bib_id
WHERE l.status = 'active' AND l.return_date IS NULL
  AND l.due_date < CURRENT_DATE
ORDER BY l.due_date;

-- [6] 바코드로 소장 항목 조회 → idx_items_barcode 사용 확인
EXPLAIN ANALYZE
SELECT i.id, i.barcode, i.item_status, b.title
FROM items i
JOIN bib_records b ON b.id = i.bib_id
WHERE i.barcode = 'LIB-2023-000001';

-- [7] 서지별 대출 가능 권수 → idx_items_bib_status 사용 확인
EXPLAIN ANALYZE
SELECT count(*)
FROM items
WHERE bib_id = 1 AND item_status = 'available';

-- [8] 주제명 부분 검색 (자동완성) → idx_subjects_term_trgm 사용 확인
EXPLAIN ANALYZE
SELECT id, term, scheme
FROM subjects
WHERE term LIKE '%도서관%';
