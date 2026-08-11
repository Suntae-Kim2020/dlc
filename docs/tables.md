# 데이터베이스 테이블 리스트

디지털도서관 시스템의 전체 테이블 목록이다.
도서관자동화(LAS), 전자자원, 연구데이터(DataCite), OAI-PMH 영역을 포함한다.

---

## 테이블 요약

| No | 테이블명 | 영역 | 설명 |
|----|----------|------|------|
| 1 | bib_records | LAS | 서지 레코드 (MARC 핵심 필드) |
| 2 | marc_fields | LAS | MARC 확장 필드 (EAV 구조) |
| 3 | authors | 공통 | 저자 / Creator |
| 4 | bib_authors | LAS | 서지-저자 연결 (M:N) |
| 5 | subjects | 공통 | 주제명 |
| 6 | bib_subjects | LAS | 서지-주제 연결 (M:N) |
| 7 | users | LAS | 이용자 |
| 8 | items | LAS | 소장 항목 |
| 9 | loans | LAS | 대출 |
| 10 | acquisitions | LAS | 수서 |
| 11 | e_resources | 전자자원 | 전자자원 (e-journal, e-book, DB) |
| 12 | datasets | 연구데이터 | 연구데이터 (DataCite 기반) |
| 13 | dataset_authors | 연구데이터 | 연구데이터-저자 연결 (M:N) |
| 14 | dataset_subjects | 연구데이터 | 연구데이터-주제 연결 (M:N) |
| 15 | funding_references | 연구데이터 | 연구비 정보 (DataCite FundingReference) |
| 16 | dataset_bib_relations | 연구데이터 | 연구데이터-서지 연관 (RelatedIdentifier) |
| 17 | dataset_eresource_relations | 연구데이터 | 연구데이터-전자자원 연관 (RelatedIdentifier) |
| 18 | metadata | 공통 | 자원별 메타데이터 필드 (DC, DataCite 등) |
| 19 | oai_harvest_logs | OAI-PMH | OAI-PMH 수확 이력 |
| 20 | oai_records | OAI-PMH | OAI-PMH 수확 레코드 |

---

## 테이블 상세

### 1. bib_records (서지 레코드)

MARC 핵심 필드를 컬럼으로 관리하는 서지 레코드 테이블이다.

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|----------|------|
| id | SERIAL | PK | 서지 레코드 ID |
| control_number | VARCHAR(50) | NOT NULL, UNIQUE | MARC 001 제어번호 |
| isbn | VARCHAR(20) | | MARC 020 ISBN |
| call_number | VARCHAR(100) | | MARC 090/050 청구기호 |
| title | TEXT | NOT NULL | MARC 245$a 본표제 |
| statement_of_resp | VARCHAR(500) | | MARC 245$c 책임표시 |
| main_entry | VARCHAR(300) | | MARC 100/110 기본표목 |
| publisher | VARCHAR(300) | | MARC 260/264$b 발행처 |
| pub_year | SMALLINT | | MARC 260/264$c 발행년 |
| extent | VARCHAR(200) | | MARC 300$a 형태사항 |
| abstract | TEXT | | MARC 520 초록 |
| ddc_number | VARCHAR(30) | | MARC 082 DDC 분류번호 |
| electronic_url | TEXT | | MARC 856$u 전자자원 URL |
| record_status | VARCHAR(20) | NOT NULL, DEFAULT 'active' | 상태 (active, deleted, draft) |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | 생성일시 |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | 수정일시 |

### 2. marc_fields (MARC 확장 필드)

서지 레코드의 나머지 MARC 필드를 EAV(Entity-Attribute-Value) 구조로 저장한다.

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|----------|------|
| id | SERIAL | PK | MARC 필드 ID |
| bib_id | INTEGER | FK → bib_records(id), NOT NULL | 서지 레코드 ID |
| tag | CHAR(3) | NOT NULL | MARC 태그 (예: 650, 700) |
| ind1 | CHAR(1) | DEFAULT ' ' | 지시기호 1 |
| ind2 | CHAR(1) | DEFAULT ' ' | 지시기호 2 |
| subfield_code | CHAR(1) | NOT NULL | 식별기호 (예: a, b, c) |
| subfield_value | TEXT | NOT NULL | 식별기호 값 |
| field_order | SMALLINT | NOT NULL, DEFAULT 0 | 필드 순서 |

### 3. authors (저자)

도서·연구데이터 공통으로 사용하는 저자 테이블이다.

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|----------|------|
| id | SERIAL | PK | 저자 ID |
| name | VARCHAR(300) | NOT NULL | 저자명 |
| name_type | VARCHAR(20) | NOT NULL, DEFAULT 'personal' | 유형 (personal, corporate) |
| orcid | VARCHAR(30) | UNIQUE (WHERE NOT NULL) | ORCID 식별자 |
| affiliation | VARCHAR(300) | | 소속기관 |

### 4. bib_authors (서지-저자 연결)

서지 레코드와 저자의 M:N 관계를 관리한다.

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|----------|------|
| bib_id | INTEGER | PK, FK → bib_records(id) | 서지 레코드 ID |
| author_id | INTEGER | PK, FK → authors(id) | 저자 ID |
| role | VARCHAR(10) | NOT NULL, DEFAULT 'main' | 역할 (main, added) |
| author_order | SMALLINT | NOT NULL, DEFAULT 0 | 저자 표시 순서 |

### 5. subjects (주제명)

DDC, LCSH, KDC 등 다양한 분류체계의 주제명을 관리한다.

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|----------|------|
| id | SERIAL | PK | 주제 ID |
| term | VARCHAR(500) | NOT NULL | 주제명 |
| scheme | VARCHAR(20) | NOT NULL, DEFAULT 'LCSH' | 분류체계 (LCSH, DDC, KDC, MESH, OTHER) |
| lang | CHAR(3) | NOT NULL, DEFAULT 'kor' | ISO 639-3 언어코드 |

### 6. bib_subjects (서지-주제 연결)

서지 레코드와 주제명의 M:N 관계를 관리한다.

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|----------|------|
| bib_id | INTEGER | PK, FK → bib_records(id) | 서지 레코드 ID |
| subject_id | INTEGER | PK, FK → subjects(id) | 주제 ID |

### 7. users (이용자)

도서관 이용자(학생, 교직원, 직원) 정보를 관리한다.

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|----------|------|
| id | SERIAL | PK | 이용자 ID |
| user_number | VARCHAR(30) | NOT NULL, UNIQUE | 학번/교번/직원번호 |
| name | VARCHAR(100) | NOT NULL | 이름 |
| email | VARCHAR(200) | UNIQUE | 이메일 |
| phone | VARCHAR(20) | | 전화번호 |
| affiliation | VARCHAR(200) | | 소속 (학과, 부서) |
| user_type | VARCHAR(20) | NOT NULL, DEFAULT 'student' | 유형 (student, faculty, staff) |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'active' | 상태 (active, suspended) |
| join_date | DATE | NOT NULL, DEFAULT CURRENT_DATE | 가입일 |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | 생성일시 |

### 8. items (소장 항목)

같은 서지 레코드라도 권호별로 개별 관리되는 소장 항목이다.

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|----------|------|
| id | SERIAL | PK | 소장 항목 ID |
| bib_id | INTEGER | FK → bib_records(id), NOT NULL | 서지 레코드 ID |
| barcode | VARCHAR(50) | NOT NULL, UNIQUE | 바코드 번호 |
| location | VARCHAR(100) | | 소장 위치 |
| item_status | VARCHAR(20) | NOT NULL, DEFAULT 'available' | 상태 (available, on_loan, lost) |
| acquisition_date | DATE | | 입수일 |

### 9. loans (대출)

이용자의 도서 대출 이력을 관리한다.

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|----------|------|
| id | SERIAL | PK | 대출 ID |
| item_id | INTEGER | FK → items(id), NOT NULL | 소장 항목 ID |
| user_id | INTEGER | FK → users(id), NOT NULL | 이용자 ID |
| loan_date | DATE | NOT NULL, DEFAULT CURRENT_DATE | 대출일 |
| due_date | DATE | NOT NULL | 반납 예정일 |
| return_date | DATE | | 실제 반납일 |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'active' | 상태 (active, returned, overdue) |

### 10. acquisitions (수서)

도서 주문·입수·정리 업무를 관리한다.

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|----------|------|
| id | SERIAL | PK | 수서 ID |
| title | TEXT | NOT NULL | 주문 도서명 |
| author | VARCHAR(300) | | 저자 |
| isbn | VARCHAR(20) | | ISBN |
| publisher | VARCHAR(300) | | 발행처 |
| quantity | SMALLINT | NOT NULL, DEFAULT 1 | 주문 수량 |
| unit_price | NUMERIC(12,2) | | 단가 |
| order_date | DATE | | 주문일 |
| receive_date | DATE | | 입수일 |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'ordered' | 상태 (ordered, received, cataloged) |
| fund_code | VARCHAR(30) | | 예산 코드 |

### 11. e_resources (전자자원)

전자저널, 전자책, 데이터베이스 등 구독 전자자원을 관리한다.

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|----------|------|
| id | SERIAL | PK | 전자자원 ID |
| title | VARCHAR(500) | NOT NULL | 자원명 |
| resource_type | VARCHAR(20) | NOT NULL, CHECK (journal, ebook, database) | 유형 |
| provider | VARCHAR(200) | | 제공 기관 |
| platform_url | TEXT | | 접속 URL |
| issn | VARCHAR(20) | | ISSN (전자저널) |
| isbn | VARCHAR(20) | | ISBN (전자책) |
| subject | VARCHAR(200) | | 주제 분야 |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'active', CHECK (active, trial, cancelled) | 상태 |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | 생성일시 |

라이선스 조건과 구독 기간(`start_date`/`end_date`)은 `database/lsp_schema.sql` 의 별도 `licenses` 테이블이 담당한다. 구독 기간을 e_resources 자체에 두지 않는 이유는, 한 자원이 기간이 다른 여러 계약으로 갱신되며 그 이력이 남아야 하기 때문이다.

### 12. datasets (연구데이터)

DataCite Metadata Schema 4.x 기반의 연구데이터를 관리한다.

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|----------|------|
| id | SERIAL | PK | 데이터셋 ID |
| title | TEXT | NOT NULL | 제목 (DataCite: Title) |
| doi | VARCHAR(100) | UNIQUE | DOI (DataCite: Identifier) |
| version | VARCHAR(30) | | 버전 |
| license | VARCHAR(100) | | 라이선스 (CC BY 등) |
| format | VARCHAR(50) | | 데이터 형식 (CSV, JSON 등) |
| size | BIGINT | | 파일 크기 (bytes) |
| access_rights | VARCHAR(30) | NOT NULL, DEFAULT 'open' | 접근 권한 (open, restricted, embargoed, closed) |
| publication_year | SMALLINT | | 발행년 |
| description | TEXT | | 설명 |
| publisher | VARCHAR(300) | | 발행 기관 |
| language | CHAR(3) | DEFAULT 'kor' | 언어 (ISO 639-3) |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | 생성일시 |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | 수정일시 |

### 13. dataset_authors (연구데이터-저자 연결)

연구데이터와 저자(Creator/Contributor)의 M:N 관계를 관리한다.

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|----------|------|
| dataset_id | INTEGER | PK, FK → datasets(id) | 데이터셋 ID |
| author_id | INTEGER | PK, FK → authors(id) | 저자 ID |
| role | VARCHAR(20) | NOT NULL, DEFAULT 'creator' | 역할 (creator, contributor) |
| contributor_type | VARCHAR(30) | | DataCite contributorType |
| author_order | SMALLINT | NOT NULL, DEFAULT 0 | 표시 순서 |

### 14. dataset_subjects (연구데이터-주제 연결)

연구데이터와 주제명의 M:N 관계를 관리한다.

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|----------|------|
| dataset_id | INTEGER | PK, FK → datasets(id) | 데이터셋 ID |
| subject_id | INTEGER | PK, FK → subjects(id) | 주제 ID |

### 15. funding_references (연구비 정보)

DataCite FundingReference 항목을 관리한다.

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|----------|------|
| id | SERIAL | PK | 연구비 ID |
| dataset_id | INTEGER | FK → datasets(id), NOT NULL | 데이터셋 ID |
| funder_name | VARCHAR(300) | NOT NULL | 연구비 지원 기관 |
| award_number | VARCHAR(100) | | 과제 번호 |
| award_title | VARCHAR(500) | | 과제명 |
| funder_identifier | VARCHAR(200) | | 기관 식별자 (ROR, ISNI 등) |

### 16. dataset_bib_relations (연구데이터-서지 연관)

DataCite RelatedIdentifier로 연구데이터와 서지 레코드의 연관 관계를 관리한다.

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|----------|------|
| id | SERIAL | PK | 관계 ID |
| dataset_id | INTEGER | FK → datasets(id), NOT NULL | 데이터셋 ID |
| bib_id | INTEGER | FK → bib_records(id), NOT NULL | 서지 레코드 ID |
| relation_type | VARCHAR(30) | NOT NULL | 관계 유형 (IsSupplementTo, IsCitedBy 등) |

### 17. dataset_eresource_relations (연구데이터-전자자원 연관)

DataCite RelatedIdentifier로 연구데이터와 전자자원의 연관 관계를 관리한다.

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|----------|------|
| id | SERIAL | PK | 관계 ID |
| dataset_id | INTEGER | FK → datasets(id), NOT NULL | 데이터셋 ID |
| eresource_id | INTEGER | FK → e_resources(id), NOT NULL | 전자자원 ID |
| relation_type | VARCHAR(30) | NOT NULL | 관계 유형 (IsSupplementTo, IsCitedBy 등) |

### 18. metadata (메타데이터)

도서·전자자원·연구데이터에 대한 다중 스키마 메타데이터 필드를 EAV 구조로 관리한다.

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|----------|------|
| id | SERIAL | PK | 메타데이터 ID |
| resource_type | VARCHAR(20) | NOT NULL | 대상 유형 (bib, e_resource, dataset) |
| resource_id | INTEGER | NOT NULL | 대상 레코드 ID |
| schema_type | VARCHAR(30) | NOT NULL | 스키마 (marc, dublin_core, datacite) |
| field_name | VARCHAR(100) | NOT NULL | 필드명 |
| field_value | TEXT | NOT NULL | 필드값 |
| language | CHAR(3) | DEFAULT 'kor' | 언어 (ISO 639-3) |

### 19. oai_harvest_logs (OAI-PMH 수확 이력)

OAI-PMH 수확기의 실행 이력을 기록한다.

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|----------|------|
| id | SERIAL | PK | 수확 로그 ID |
| source_url | TEXT | NOT NULL | 수확 대상 OAI-PMH URL |
| metadata_prefix | VARCHAR(30) | NOT NULL | 메타데이터 포맷 (oai_dc, datacite 등) |
| from_date | TIMESTAMP | | 수확 시작 기준일 |
| until_date | TIMESTAMP | | 수확 종료 기준일 |
| records_harvested | INTEGER | DEFAULT 0 | 수확된 레코드 수 |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'running' | 상태 (running, completed, failed) |
| error_message | TEXT | | 오류 메시지 |
| started_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | 시작 시각 |
| finished_at | TIMESTAMP | | 완료 시각 |

### 20. oai_records (OAI-PMH 수확 레코드)

외부 OAI-PMH 저장소에서 수확한 개별 메타데이터 레코드를 저장한다.

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|----------|------|
| id | SERIAL | PK | 레코드 ID |
| harvest_log_id | INTEGER | FK → oai_harvest_logs(id), NOT NULL | 수확 로그 ID |
| oai_identifier | VARCHAR(200) | NOT NULL | OAI 레코드 식별자 |
| metadata_prefix | VARCHAR(30) | NOT NULL | 메타데이터 포맷 |
| raw_xml | TEXT | NOT NULL | 원본 XML |
| datestamp | TIMESTAMP | | OAI datestamp |
| is_deleted | BOOLEAN | NOT NULL, DEFAULT FALSE | 삭제 여부 |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | 저장 시각 |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | 갱신 시각 |

---

## 영역별 분류

### LAS (도서관자동화) — 10개

`bib_records`, `marc_fields`, `authors`*, `bib_authors`, `subjects`*, `bib_subjects`, `users`, `items`, `loans`, `acquisitions`

### 전자자원 — 1개

`e_resources`

### 연구데이터 (DataCite) — 6개

`datasets`, `dataset_authors`, `dataset_subjects`, `funding_references`, `dataset_bib_relations`, `dataset_eresource_relations`

### 메타데이터 — 1개

`metadata`

### OAI-PMH — 2개

`oai_harvest_logs`, `oai_records`

> \* `authors`, `subjects`는 LAS와 연구데이터 영역에서 공통으로 사용한다.
