# LAS 데이터베이스 스키마 설계 문서

## 1. 설계 원칙

- **MARC21 호환**: 빈번히 조회되는 MARC 핵심 필드는 `bib_records` 컬럼으로 직접 매핑하고, 나머지는 `marc_fields` EAV 테이블에 저장하여 유연성과 성능을 동시에 확보한다.
- **참조 무결성**: 모든 외래 키에 적절한 `ON DELETE` 정책을 적용하여 데이터 정합성을 보장한다.
- **정규화**: M:N 관계는 연결 테이블(`bib_authors`, `bib_subjects`)로 분리하여 3NF를 유지한다.
- **확장성**: CHECK 제약조건과 ENUM 대신 VARCHAR + CHECK 패턴을 사용하여 상태값 추가 시 `ALTER TYPE` 없이 CHECK만 수정하면 된다.

---

## 2. 테이블별 설계 포인트

### 2.1 bib_records (서지 레코드)

| 설계 결정 | 이유 |
|----------|------|
| MARC 핵심 필드를 컬럼으로 분리 | title, ISBN, 청구기호 등은 검색·정렬·필터에 빈번히 사용되므로 컬럼 직접 접근이 EAV 조인보다 효율적 |
| `title`에 GIN 인덱스 (`to_tsvector`) | PostgreSQL 내장 전문검색으로 LIKE 패턴 대비 한국어·영어 혼합 검색 성능 향상 |
| `record_status` CHECK 제약 | `active` / `deleted` / `suppressed` 3가지 상태로 논리 삭제 지원 — 물리 삭제 대신 상태 변경으로 이력 보존 |
| `updated_at` 자동 갱신 트리거 | 애플리케이션에서 누락해도 DB 레벨에서 수정 시각을 보장 |

### 2.2 marc_fields (MARC EAV)

| 설계 결정 | 이유 |
|----------|------|
| EAV(Entity-Attribute-Value) 구조 채택 | MARC21은 수백 개 태그를 가지므로 모두 컬럼화하면 스키마가 비대해짐. EAV로 태그·서브필드를 행 단위 저장 |
| `field_order` 컬럼 | 동일 태그가 반복될 수 있는 MARC 특성상 원본 레코드의 필드 순서를 보존해야 정확한 MARC 재구성 가능 |
| `(bib_id, tag)` 복합 인덱스 | 특정 서지의 특정 태그 조회 (예: 650 주제명)가 가장 빈번한 패턴 |
| `ON DELETE CASCADE` | 서지 레코드 삭제 시 관련 MARC 필드도 함께 제거 |

### 2.3 authors (저자)

| 설계 결정 | 이유 |
|----------|------|
| `name_type` 구분 (personal/corporate) | MARC 100(개인)과 110(단체)을 하나의 테이블로 통합 관리하되 유형 구분 |
| ORCID 부분 유니크 인덱스 (`WHERE orcid IS NOT NULL`) | ORCID가 있는 저자는 중복 방지, 없는 저자는 제약 없이 허용 |

### 2.4 bib_authors (서지-저자 연결)

| 설계 결정 | 이유 |
|----------|------|
| `role` 컬럼 (main/added) | MARC 100(기본표목)과 700(부출표목)의 역할 차이를 반영 |
| `author_order` 컬럼 | 공저자 표시 순서 보존 — 목록 표시 및 인용 시 순서가 중요 |
| `(bib_id, author_id)` 복합 PK | 동일 서지-저자 조합 중복 방지 |
| 역방향 인덱스 (`author_id`) | "이 저자의 모든 저작" 조회를 위한 역방향 탐색 최적화 |

### 2.5 subjects (주제명)

| 설계 결정 | 이유 |
|----------|------|
| `scheme` 컬럼 (LCSH/DDC/KDC/MESH) | 복수의 주제명 체계를 하나의 테이블에서 관리 |
| `lang` 컬럼 (ISO 639-3) | 동일 개념의 다국어 주제명 지원 (예: 한국어 KDC + 영어 LCSH) |
| `(term, scheme, lang)` 유니크 인덱스 | 같은 체계·언어 내 동일 용어 중복 방지 |

### 2.6 bib_subjects (서지-주제 연결)

| 설계 결정 | 이유 |
|----------|------|
| 복합 PK `(bib_id, subject_id)` | 동일 조합 중복 방지 + 조인 성능 확보 |
| 역방향 인덱스 (`subject_id`) | "이 주제의 모든 서지" 조회 최적화 |

### 2.7 users (이용자)

| 설계 결정 | 이유 |
|----------|------|
| `user_number` UNIQUE | 학번/교직원번호는 시스템 PK와 별도로 업무 식별자로 사용 |
| `email` UNIQUE | 이메일 기반 인증을 위한 유일성 보장 |
| `status` (active/suspended) | 휴학·퇴직 등 일시 정지 상태 관리 — 계정 삭제 대신 정지 처리 |
| `user_type` CHECK | student/faculty/staff 유형별 대출 권수·기간 차등 적용의 기준 |

### 2.8 items (소장 항목)

| 설계 결정 | 이유 |
|----------|------|
| `bib_records`와 1:N 분리 | 동일 서지(ISBN)에 대해 복본(copy)이 여러 권 존재할 수 있으므로 서지와 소장을 분리 |
| `barcode` UNIQUE | 바코드는 실물 자료의 물리적 식별자 — 대출/반납 스캔 시 유일성 필수 |
| `item_status` CHECK | available/on_loan/lost 3가지 상태로 실시간 가용 현황 관리 |
| `ON DELETE CASCADE` (bib_id FK) | 서지 삭제 시 소장 항목도 함께 제거 |

### 2.9 loans (대출)

| 설계 결정 | 이유 |
|----------|------|
| FK가 `bib_records`가 아닌 `items` 참조 | 대출 대상은 서지가 아닌 개별 소장 항목(실물) |
| `ON DELETE RESTRICT` (item_id, user_id) | 대출 기록이 있는 자료나 이용자는 삭제 불가 — 대출 이력 보존 |
| `due_date` 부분 인덱스 (`WHERE status = 'active'`) | 연체 확인 배치 작업이 활성 대출만 조회하므로, 전체 이력 대신 활성 건만 인덱싱하여 크기와 성능 최적화 |
| `return_date` NULLABLE | 미반납 상태에서는 NULL, 반납 시 날짜 기록 |

### 2.10 acquisitions (수서)

| 설계 결정 | 이유 |
|----------|------|
| `bib_records`와 FK 없음 | 수서 단계에서는 아직 서지 레코드가 생성되지 않았을 수 있으므로 독립 테이블로 운영 |
| `status` 워크플로 (ordered → received → cataloged) | 수서 프로세스의 3단계를 상태값으로 추적 |
| `unit_price` NUMERIC(12,2) | 원화 단위 정확한 금액 계산 (부동소수점 오차 방지) |
| `fund_code` 컬럼 | 예산 코드별 지출 집계 및 잔액 관리에 활용 |

---

## 3. 인덱스 전략

### 3.1 인덱스 유형별 사용

| 유형 | 적용 대상 | 이유 |
|------|----------|------|
| B-tree (기본) | PK, FK, 상태값, 날짜 | 등호·범위 검색에 최적 |
| GIN | `bib_records.title` (`to_tsvector`) | 전문검색(Full-Text Search) 지원 |
| 부분 인덱스 (Partial) | `loans.due_date WHERE status = 'active'` | 활성 대출만 인덱싱하여 크기 절감 |
| 부분 유니크 | `authors.orcid WHERE orcid IS NOT NULL` | NULL 허용하면서 값이 있는 경우만 유일성 보장 |
| 복합 인덱스 | `marc_fields(bib_id, tag)` | 다중 컬럼 조건의 커버링 인덱스 |

### 3.2 인덱스를 추가하지 않은 컬럼

| 컬럼 | 이유 |
|------|------|
| `bib_records.abstract` | 긴 텍스트 컬럼 — 필요 시 GIN 인덱스 별도 추가 |
| `bib_records.electronic_url` | URL 검색은 드물고, 필요 시 Elasticsearch가 담당 |
| `acquisitions.title/author` | 수서 건수가 상대적으로 적어 순차 스캔으로 충분 |

---

## 4. 데이터 무결성 전략

### 4.1 ON DELETE 정책

| FK 관계 | 정책 | 이유 |
|---------|------|------|
| `marc_fields` → `bib_records` | CASCADE | 서지 삭제 시 MARC 필드도 함께 제거 |
| `bib_authors` → `bib_records` | CASCADE | 서지 삭제 시 연결 해제 |
| `bib_authors` → `authors` | CASCADE | 저자 삭제 시 연결 해제 |
| `items` → `bib_records` | CASCADE | 서지 삭제 시 소장 항목도 제거 |
| `loans` → `items` | **RESTRICT** | 대출 이력이 있는 자료는 삭제 불가 |
| `loans` → `users` | **RESTRICT** | 대출 이력이 있는 이용자는 삭제 불가 |

### 4.2 CHECK 제약조건

모든 상태/유형 컬럼에 CHECK 제약을 적용하여 DB 레벨에서 유효값을 강제한다. PostgreSQL ENUM 대신 `VARCHAR + CHECK` 패턴을 선택한 이유:

- ENUM은 값 추가 시 `ALTER TYPE`이 필요하고 트랜잭션 내 DDL 제약이 있음
- CHECK는 `ALTER TABLE ... DROP CONSTRAINT / ADD CONSTRAINT`로 간단히 변경 가능

---

## 5. 테이블 관계 요약

```
bib_records ─┬─< marc_fields        (1:N)
             ├─< items ─< loans     (1:N:N)
             ├──< bib_authors >──   authors   (M:N)
             └──< bib_subjects >──  subjects  (M:N)

users ─< loans                      (1:N)

acquisitions                        (독립)
```
