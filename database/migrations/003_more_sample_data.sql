-- 모든 관리자 메뉴에서 5건 이상의 레코드가 보이도록 정합성 있는 샘플 데이터 추가
-- 단일 트랜잭션 — 실패 시 전체 롤백
BEGIN;

-- ===========================================
-- 1. 추가 서지 (KMO202300003 ~ KMO202300010)
-- ===========================================
INSERT INTO bib_records
  (control_number, isbn,            call_number, title,                                   statement_of_resp,           main_entry,        publisher,        pub_year, extent,           abstract,                                                                                            ddc_number)
VALUES
  ('KMO202300003','9788956748503','004.6 김24',  '데이터베이스 시스템',                    '김지훈 지음',                '김지훈',         '한빛아카데미',     2023, 'xx, 480 p.; 25 cm','관계형 데이터베이스 이론과 SQL 실무를 동시에 다루는 학부 교재. 정규화·트랜잭션·인덱스 설계까지 폭넓게 설명한다.',                     '004.6'),
  ('KMO202300004','9788931467890','005.43 이15', '운영체제: 개념과 사례',                  '이승철 지음',                '이승철',         '생능출판사',       2024, '600 p.; 25 cm',    '프로세스·메모리·파일시스템·동시성 등 운영체제 핵심 개념을 Linux/Windows 사례와 함께 학습한다.',                                       '005.43'),
  ('KMO202300005','9791158391234','005.7 박07',  'AI 시대의 정보검색',                     '박서연 지음',                '박서연',         '문화과학사',       2025, 'viii, 320 p.',     '검색 엔진 구조부터 RAG 응용까지 — 대규모 언어모델과 결합한 정보검색 패턴을 정리한 입문서.',                                          '005.7'),
  ('KMO202300006','9788932317762','020 정09',    '도서관 경영의 이해',                     '정태영 지음',                '정태영',         '한국도서관협회',   2022, 'xii, 410 p.',      '도서관의 인적·물적 자원 관리, 예산 편성, 이용자 서비스 평가까지 — 현장 사례 중심.',                                                  '020'),
  ('KMO202300007','9791155662100','410.7 송18',  '머신러닝 수학적 기초',                   '송하영, 임소진 공저',        '송하영',         '교보문고',         2024, '500 p.',           '선형대수·확률·최적화를 머신러닝 알고리즘과 함께 배운다.',                                                                            '410.7'),
  ('KMO202300008','9788963722007','005.13 한35', '함수형 프로그래밍 입문',                 '한도현 지음',                '한도현',         '인사이트',         2023, '350 p.',           'Haskell·Scala·Clojure 사례로 배우는 함수형 사고. 불변성·고차 함수·모나드 패턴을 다룬다.',                                            '005.13'),
  ('KMO202300009','9791165214005','658.4 윤22',  '디지털 트랜스포메이션 전략',            '윤재석 지음',                '윤재석',         '매일경제신문사',   2024, '288 p.',           '제조·금융·공공 부문의 DX 전략 패턴과 실패 사례를 분석한다.',                                                                          '658.4'),
  ('KMO202300010','9788972918806','410 강11',    '통계학의 이해',                          '강혜진 지음',                '강혜진',         '자유아카데미',     2022, 'xii, 600 p.',      '기초 통계부터 추론·회귀까지 — 사회과학·자연과학에 모두 활용 가능한 통계학 개론.',                                                    '410');

-- ===========================================
-- 2. 추가 이용자 (5명) — 다양한 신분/상태
-- ===========================================
INSERT INTO users
  (user_number, name,    email,                      phone,             affiliation,            user_type, status,    join_date)
VALUES
  ('2024010023', '이서윤', 'seoyoon.lee@univ.ac.kr',   '010-2233-1100',  '컴퓨터공학과',          'student', 'active',  '2024-03-02'),
  ('2024010099', '정현우', 'hyunwoo.jung@univ.ac.kr',  '010-3344-5566',  '문헌정보학과',          'student', 'active',  '2024-03-02'),
  ('2017030007', '한지민', 'jimin.han@univ.ac.kr',     '010-7788-9900',  '경영학과 교수',         'faculty', 'active',  '2017-09-01'),
  ('STAFF-101',  '오태수', 'taesu.oh@univ.ac.kr',      '02-1234-5678',   '도서관 수서팀',         'staff',   'active',  '2018-04-15'),
  ('2022020013', '윤서아', 'seoa.yoon@univ.ac.kr',     '010-1212-3434',  '국문학과',              'student', 'suspended','2022-03-02');

-- ===========================================
-- 3. 추가 소장 항목 (items) — 새로 만든 도서들에 1~2 권씩
--    총 ~10건 추가되어 5건 보장 + 대출/연체 시연 가능
-- ===========================================
-- 위에서 추가한 8개 bib 의 ID를 control_number로 조회해서 items 생성
INSERT INTO items (bib_id, barcode, location, item_status, acquisition_date)
SELECT b.id, v.barcode, v.location, v.item_status, v.acquisition_date::date
FROM (VALUES
  ('KMO202300003', 'LIB-2024-000010', '중앙도서관 3층 자료실', 'available', '2024-01-15'),
  ('KMO202300003', 'LIB-2024-000011', '분관 2층 열람실',       'on_loan',   '2024-01-15'),
  ('KMO202300004', 'LIB-2024-000020', '중앙도서관 3층 자료실', 'on_loan',   '2024-02-20'),
  ('KMO202300005', 'LIB-2025-000030', '중앙도서관 4층 자료실', 'available', '2025-01-10'),
  ('KMO202300006', 'LIB-2024-000040', '분관 1층 열람실',       'on_loan',   '2024-04-05'),
  ('KMO202300007', 'LIB-2024-000050', '중앙도서관 4층 자료실', 'available', '2024-06-12'),
  ('KMO202300008', 'LIB-2024-000060', '중앙도서관 3층 자료실', 'on_loan',   '2024-08-22'),
  ('KMO202300009', 'LIB-2024-000070', '분관 2층 열람실',       'available', '2024-11-30'),
  ('KMO202300010', 'LIB-2024-000080', '중앙도서관 4층 자료실', 'available', '2024-09-18'),
  ('KMO202300010', 'LIB-2024-000081', '분관 1층 열람실',       'on_loan',   '2024-09-18')
) AS v(cn, barcode, location, item_status, acquisition_date)
JOIN bib_records b ON b.control_number = v.cn;

-- ===========================================
-- 4. 추가 대출 — active / overdue / returned 골고루 (총 8건)
--    오늘(2026-05-03) 기준 due_date 계산
-- ===========================================
-- on_loan 상태인 신규 items 와 매칭된 active / overdue 대출
INSERT INTO loans (item_id, user_id, loan_date, due_date, return_date, status)
SELECT it.id, u.id, v.loan_date::date, v.due_date::date, v.return_date::date, v.status
FROM (VALUES
  -- active (반납 기한 안 지남)
  ('LIB-2024-000011', '2024010023', '2026-04-25', '2026-05-09', NULL,         'active'),
  ('LIB-2024-000020', '2024010099', '2026-04-28', '2026-05-12', NULL,         'active'),
  ('LIB-2024-000040', '2017030007', '2026-04-30', '2026-05-14', NULL,         'active'),

  -- overdue (반납 기한 지나고 미반납)
  ('LIB-2024-000060', '2024010023', '2026-04-01', '2026-04-15', NULL,         'overdue'),
  ('LIB-2024-000081', '2022020013', '2026-04-05', '2026-04-19', NULL,         'overdue'),

  -- returned (정상 반납)
  ('LIB-2023-000001', '2023010001', '2026-03-15', '2026-03-29', '2026-03-27', 'returned'),
  ('LIB-2023-000003', '2019030010', '2026-03-20', '2026-04-03', '2026-04-02', 'returned'),
  ('LIB-2024-000010', '2021020005', '2026-04-10', '2026-04-24', '2026-04-22', 'returned')
) AS v(barcode, user_number, loan_date, due_date, return_date, status)
JOIN items it ON it.barcode = v.barcode
JOIN users u  ON u.user_number = v.user_number;

-- ===========================================
-- 5. 수서 (acquisitions) — 8건 / 발주·수령·편목 mix
-- ===========================================
INSERT INTO acquisitions
  (title,                                     author,             isbn,            publisher,        quantity, unit_price, order_date,   receive_date, status,      fund_code)
VALUES
  ('현대 인공지능: 심층학습과 강화학습',      '구본권',           '9791165902001', '책읽는수요일',    2,       38000.00,   '2026-04-10', NULL,         'ordered',    'BOOK-2026'),
  ('클라우드 네이티브 아키텍처 패턴',         'Cornelia Davis',   '9788931467899', '에이콘출판사',    1,       45000.00,   '2026-04-15', NULL,         'ordered',    'BOOK-2026'),
  ('정보 시각화의 원칙',                       '김민철',           '9788956748999', '한빛아카데미',    3,       32000.00,   '2026-04-18', '2026-04-29', 'received',   'BOOK-2026'),
  ('도서관 데이터 분석 입문',                  '문서정',           '9791158391888', '문화과학사',      2,       28000.00,   '2026-04-20', '2026-05-01', 'received',   'LSP-2026'),
  ('학술 출판과 오픈 액세스',                 '박지윤',           '9788972918888', '인사이트',        1,       42000.00,   '2026-04-25', '2026-05-02', 'received',   'JOURNAL-2026'),
  ('Python으로 배우는 데이터 엔지니어링',     'David Beazley',    '9788966263332', 'Insight',         1,       55000.00,   '2026-03-15', '2026-03-28', 'cataloged',  'BOOK-2026'),
  ('서비스 디자인의 이해',                     '이지선',           '9791165214900', '매일경제신문사',  2,       33000.00,   '2026-03-22', '2026-04-05', 'cataloged',  'GENERAL-2026'),
  ('현대 통계학의 응용',                       '강혜진, 송하영',   '9788972918222', '자유아카데미',    1,       48000.00,   '2026-04-01', NULL,         'ordered',    'BOOK-2026');

-- ===========================================
-- 6. 전자자원 (e_resources) — 저널 2 / 이북 2 / DB 2
-- ===========================================
INSERT INTO e_resources
  (title,                                     resource_type, provider,                   platform_url,                              issn,         isbn,            subject,                  status)
VALUES
  ('Nature',                                   'journal',     'Springer Nature',          'https://www.nature.com/',                 '0028-0836',  NULL,            '종합과학',               'active'),
  ('Journal of the ACM',                       'journal',     'ACM',                      'https://dl.acm.org/journal/jacm',         '0004-5411',  NULL,            '컴퓨터과학',             'active'),
  ('Cambridge Companion to Library Science',   'ebook',       'Cambridge University Press','https://www.cambridge.org/core/books',    NULL,         '9781108456789', '도서관학',               'active'),
  ('Handbook of Big Data Analytics',           'ebook',       'Elsevier',                 'https://www.sciencedirect.com/',          NULL,         '9780128045855', '데이터과학',             'trial'),
  ('Web of Science',                           'database',    'Clarivate',                'https://www.webofscience.com/',           NULL,         NULL,            '인용 색인 데이터베이스',  'active'),
  ('KISS (한국학술정보)',                       'database',    '한국학술정보',              'https://kiss.kstudy.com/',                NULL,         NULL,            '국내 학술논문',          'active');

-- ===========================================
-- 7. 라이선스 (licenses) — 각 전자자원에 1건씩
-- ===========================================
INSERT INTO licenses
  (e_resource_id, license_type,   start_date,   end_date,     concurrent_users, ill_allowed, remote_access, tdm_allowed, perpetual_access, annual_cost,    currency, vendor_contact,                  notes)
SELECT er.id, v.license_type, v.start_date::date, v.end_date::date, v.concurrent_users, v.ill_allowed, v.remote_access, v.tdm_allowed, v.perpetual_access, v.annual_cost, v.currency, v.vendor_contact, v.notes
FROM (VALUES
  ('Nature',                                   'subscription', '2026-01-01', '2026-12-31', NULL, true,  true,  false, false, 12500000.00, 'KRW', 'springer.korea@springer.com',  '2026년 단가 인상(전년 대비 +4%)'),
  ('Journal of the ACM',                       'subscription', '2026-01-01', '2026-12-31', 50,   true,  true,  true,  false,  3800000.00, 'KRW', 'sales-asia@acm.org',           'TDM 허용 — 텍스트 마이닝 가능'),
  ('Cambridge Companion to Library Science',   'perpetual',    '2025-09-15', NULL,         NULL, false, true,  false, true,    900000.00, 'KRW', 'cup-asia@cambridge.org',       '영구 접근권 — 일회성 구매'),
  ('Handbook of Big Data Analytics',           'subscription', '2026-04-01', '2026-09-30', 10,   false, true,  false, false,   650000.00, 'KRW', 'evaluation@elsevier.com',      '평가판 — 6개월'),
  ('Web of Science',                           'subscription', '2026-01-01', '2026-12-31', NULL, true,  true,  true,  false, 22000000.00, 'KRW', 'asia.support@clarivate.com',   'TDM API 별도 신청 필요'),
  ('KISS (한국학술정보)',                       'subscription', '2026-01-01', '2026-12-31', NULL, false, true,  false, false,  4500000.00, 'KRW', 'support@kstudy.com',           '국내 학술논문 본문 무제한')
) AS v(title, license_type, start_date, end_date, concurrent_users, ill_allowed, remote_access, tdm_allowed, perpetual_access, annual_cost, currency, vendor_contact, notes)
JOIN e_resources er ON er.title = v.title;

COMMIT;
