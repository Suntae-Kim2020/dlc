-- ===========================================
-- 대학도서관 LAS 샘플 데이터
-- schema.sql 실행 후 적용
-- ===========================================

BEGIN;

-- ===========================================
-- 1. 서지 레코드 (bib_records)
-- ===========================================
INSERT INTO bib_records (id, control_number, isbn, call_number, title, statement_of_resp, main_entry, publisher, pub_year, extent, abstract, ddc_number, record_status)
VALUES
(1, 'KMO202300001', '9788900000001', '020.5-홍12ㄷ',
 '디지털도서관 구축론', '홍길동 지음', '홍길동',
 '한국도서관협회', 2023, '450 p. ; 26 cm',
 '디지털도서관의 설계부터 구축, 운영까지 전 과정을 다룬 교재',
 '020.5', 'active'),

(2, 'KMO202300002', '9788900000002', '006.3-이34ㄷ',
 '데이터 사이언스 입문', '이순신, 강감찬 공저', '이순신',
 '정보문화사', 2023, '380 p. ; 24 cm',
 '파이썬을 활용한 데이터 분석의 기초',
 '006.3', 'active');

-- 시퀀스 동기화
SELECT setval('bib_records_id_seq', (SELECT MAX(id) FROM bib_records));

-- ===========================================
-- 2. MARC 필드 (marc_fields) - 추가 MARC 태그
-- ===========================================
INSERT INTO marc_fields (bib_id, tag, ind1, ind2, subfield_code, subfield_value, field_order)
VALUES
-- 도서 1: 264 (발행사항)
(1, '264', ' ', '1', 'a', '서울', 1),
(1, '264', ' ', '1', 'b', '한국도서관협회', 2),
(1, '264', ' ', '1', 'c', '2023', 3),

-- 도서 2: 264 (발행사항)
(2, '264', ' ', '1', 'a', '서울', 1),
(2, '264', ' ', '1', 'b', '정보문화사', 2),
(2, '264', ' ', '1', 'c', '2023', 3),

-- 도서 2: 700 (부출저자)
(2, '700', '1', ' ', 'a', '강감찬', 1);

-- ===========================================
-- 3. 저자 (authors)
-- ===========================================
INSERT INTO authors (id, name, name_type, affiliation)
VALUES
(1, '홍길동',  'personal', NULL),
(2, '이순신',  'personal', NULL),
(3, '강감찬',  'personal', NULL);

SELECT setval('authors_id_seq', (SELECT MAX(id) FROM authors));

-- ===========================================
-- 4. 서지-저자 연결 (bib_authors)
-- ===========================================
INSERT INTO bib_authors (bib_id, author_id, role, author_order)
VALUES
(1, 1, 'main',  1),   -- 디지털도서관 구축론 ← 홍길동 (기본저자)
(2, 2, 'main',  1),   -- 데이터 사이언스 입문 ← 이순신 (기본저자)
(2, 3, 'added', 2);   -- 데이터 사이언스 입문 ← 강감찬 (부출저자)

-- ===========================================
-- 5. 주제명 (subjects)
-- ===========================================
INSERT INTO subjects (id, term, scheme, lang)
VALUES
(1, '디지털도서관',  'KDC', 'kor'),
(2, '도서관정보학',  'KDC', 'kor'),
(3, '데이터 과학',   'KDC', 'kor'),
(4, '파이썬',       'KDC', 'kor'),
(5, '기계학습',     'KDC', 'kor');

SELECT setval('subjects_id_seq', (SELECT MAX(id) FROM subjects));

-- ===========================================
-- 6. 서지-주제 연결 (bib_subjects)
-- ===========================================
INSERT INTO bib_subjects (bib_id, subject_id)
VALUES
(1, 1),   -- 디지털도서관 구축론 ← 디지털도서관
(1, 2),   -- 디지털도서관 구축론 ← 도서관정보학
(2, 3),   -- 데이터 사이언스 입문 ← 데이터 과학
(2, 4),   -- 데이터 사이언스 입문 ← 파이썬
(2, 5);   -- 데이터 사이언스 입문 ← 기계학습

-- ===========================================
-- 7. 이용자 (users)
-- ===========================================
INSERT INTO users (id, user_number, name, email, phone, affiliation, user_type, status, join_date)
VALUES
(1, '2023010001', '김민수', 'minsu.kim@univ.ac.kr',   '010-1234-5678',
 '문헌정보학과', 'student', 'active', '2023-03-02'),

(2, '2019030010', '박지영', 'jiyoung.park@univ.ac.kr', '010-2345-6789',
 '컴퓨터공학과', 'faculty', 'active', '2019-09-01'),

(3, '2021020005', '최유진', 'yujin.choi@univ.ac.kr',   '010-3456-7890',
 '데이터사이언스학과', 'student', 'active', '2021-03-02');

SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));

-- ===========================================
-- 8. 소장 항목 (items)
-- ===========================================
INSERT INTO items (id, bib_id, barcode, location, item_status, acquisition_date)
VALUES
(1, 1, 'LIB-2023-000001', '중앙도서관 3층 자료실', 'available',   '2023-06-15'),
(2, 1, 'LIB-2023-000002', '분관 1층 열람실',       'available',   '2023-06-15'),
(3, 2, 'LIB-2023-000003', '중앙도서관 4층 자료실', 'available',   '2023-07-20'),
(4, 2, 'LIB-2023-000004', '중앙도서관 4층 자료실', 'on_loan',     '2023-07-20');

SELECT setval('items_id_seq', (SELECT MAX(id) FROM items));

-- ===========================================
-- 9. 대출 (loans) - 소장 항목 4번이 대출 중
-- ===========================================
INSERT INTO loans (id, item_id, user_id, loan_date, due_date, return_date, status)
VALUES
(1, 4, 3, '2026-03-10', '2026-03-24', NULL, 'active');

SELECT setval('loans_id_seq', (SELECT MAX(id) FROM loans));

COMMIT;
