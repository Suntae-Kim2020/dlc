-- LSP(5장) 전자자원 샘플 데이터
-- 전자저널 2건 + 전자책 1건 + 각 라이선스 + 2024년 1~3월 COUNTER TR 통계

BEGIN;

-- ===========================================
-- e_resources
-- ===========================================
INSERT INTO e_resources (title, resource_type, provider, platform_url, issn, isbn, subject, status) VALUES
  ('Nature',
   'journal',
   'Springer Nature',
   'https://www.nature.com/',
   '0028-0836',
   NULL,
   'Multidisciplinary science',
   'active'),
  ('Science',
   'journal',
   'American Association for the Advancement of Science',
   'https://www.science.org/',
   '0036-8075',
   NULL,
   'Multidisciplinary science',
   'active'),
  ('O''Reilly Learning Platform',
   'ebook',
   'O''Reilly Media',
   'https://learning.oreilly.com/',
   NULL,
   NULL,
   'Technology / Computer Science',
   'active');

-- ===========================================
-- licenses
-- ===========================================
INSERT INTO licenses (
    e_resource_id, license_type, start_date, end_date,
    concurrent_users, ill_allowed, remote_access, tdm_allowed, perpetual_access,
    annual_cost, currency
) VALUES
  ((SELECT id FROM e_resources WHERE title = 'Nature'),
   'subscription', '2024-01-01', '2024-12-31',
   NULL, FALSE, TRUE, FALSE, FALSE,
   5000000, 'KRW'),
  ((SELECT id FROM e_resources WHERE title = 'Science'),
   'subscription', '2024-01-01', '2024-12-31',
   5, TRUE, TRUE, FALSE, FALSE,
   3000000, 'KRW'),
  ((SELECT id FROM e_resources WHERE title = 'O''Reilly Learning Platform'),
   'subscription', '2024-01-01', '2024-12-31',
   NULL, FALSE, TRUE, FALSE, FALSE,
   8000000, 'KRW');

-- ===========================================
-- usage_stats  (COUNTER TR, 2024-01 ~ 2024-03)
-- ===========================================
INSERT INTO usage_stats (
    e_resource_id, report_type, period_year, period_month,
    total_item_requests, unique_title_requests
) VALUES
  -- Nature: 상위 저널 기준 월 9,000~12,000 다운로드
  ((SELECT id FROM e_resources WHERE title = 'Nature'), 'TR', 2024, 1,  9500, 3200),
  ((SELECT id FROM e_resources WHERE title = 'Nature'), 'TR', 2024, 2, 10200, 3500),
  ((SELECT id FROM e_resources WHERE title = 'Nature'), 'TR', 2024, 3, 11800, 3900),

  -- Science: Nature보다 약간 낮은 수준
  ((SELECT id FROM e_resources WHERE title = 'Science'), 'TR', 2024, 1,  7200, 2400),
  ((SELECT id FROM e_resources WHERE title = 'Science'), 'TR', 2024, 2,  7800, 2600),
  ((SELECT id FROM e_resources WHERE title = 'Science'), 'TR', 2024, 3,  8500, 2850),

  -- O'Reilly: 기술 전자책, 학기 초 증가 패턴
  ((SELECT id FROM e_resources WHERE title = 'O''Reilly Learning Platform'), 'TR', 2024, 1, 2800,  950),
  ((SELECT id FROM e_resources WHERE title = 'O''Reilly Learning Platform'), 'TR', 2024, 2, 3200, 1100),
  ((SELECT id FROM e_resources WHERE title = 'O''Reilly Learning Platform'), 'TR', 2024, 3, 3600, 1250);

COMMIT;
