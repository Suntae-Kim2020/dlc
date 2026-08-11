# AI Library — 디지털도서관 시스템 (LAS)

대학도서관 자동화시스템(Library Automation System)을 처음부터 만들어 보는 학습용 풀스택 프로젝트입니다. **REST API · 검색 · OAI-PMH · BIBFRAME · Linked Data · RAG**까지 도서관 정보학의 핵심 표준을 한 코드베이스에서 다룹니다.

---

## 무엇을 다루는가

| 영역 | 구현 |
|---|---|
| **REST API** | Express + PostgreSQL — 서지(MARC21), 이용자, 대출, 수서, 전자자원 |
| **검색** | Elasticsearch + nori 한국어 형태소 분석 (색인용 mixed / 검색용 discard 분석기 분리) |
| **메타데이터 표준** | OAI-PMH 2.0 데이터 제공자 + 수확기, COUNTER R5 SUSHI 모의 |
| **시맨틱 웹** | Apache Jena Fuseki에 Dublin Core + BIBFRAME 두 모델 동시 적재 |
| **링크드 데이터** | `owl:sameAs` 외부 연결 (Wikidata Q80 등), SPARQL 페더레이션 쿼리 |
| **콘텐츠 협상** | `/resource/:type/:id` — Accept 헤더에 따라 Turtle/RDF-XML/JSON-LD 반환 |
| **AI 검색** | Claude API + Elasticsearch RAG 파이프라인 |
| **프론트엔드** | React 19 + Vite + Tailwind v4 — 이용자 화면 4종, 관리자 화면 5종 |
| **인프라** | Docker Compose (PostgreSQL 16, ES 8.12, Fuseki 4.10, BaseX) |

---

## 아키텍처

```
                       ┌──────────────────────────┐
                       │  React + Vite (3000)     │
                       │  - 검색 / 상세 / 대출 /  │
                       │    AI 검색 / 관리자      │
                       └────────────┬─────────────┘
                                    │  HTTPS
                                    ▼
                       ┌──────────────────────────┐
                       │  Express REST API (4000) │
                       │  /api/v1/*  /oai  /resource │
                       └────────────┬─────────────┘
            ┌──────────────┬────────┼────────┬──────────────┐
            ▼              ▼        ▼        ▼              ▼
       PostgreSQL   Elasticsearch  Fuseki  BaseX        Claude API
       (원장)        (검색 인덱스)  (RDF)   (XML)        (RAG)
                                ↑
                                │ OAI-PMH 수확
                       arXiv (외부 SP)
```

**source of truth는 PostgreSQL**입니다. ES·Fuseki·BaseX는 모두 PG에서 파생된 검색·시맨틱 표현 저장소예요. 수확기(`tools/oai-harvester.js`)는 외부에서 받아온 자료를 네 곳 모두에 동시 적재합니다.

---

## 빠른 시작

### 사전 요구사항
- Docker Desktop / Docker Engine
- Node.js 20 이상
- (선택) Anthropic API 키 — RAG 기능 사용 시

### 1. 환경변수 설정
```bash
cp .env.example .env
cp .env.example backend/.env
# 두 .env 파일에 비밀번호·API 키 입력
```

### 2. 인프라 기동
```bash
docker compose up -d postgres elasticsearch fuseki basex
```

### 3. 데이터베이스 초기화
```bash
docker exec -i dl-postgres psql -U dluser -d digital_library < database/schema.sql
docker exec -i dl-postgres psql -U dluser -d digital_library < database/sample_data.sql
```

### 4. 검색 인덱스 생성 + 색인
```bash
cd tools && npm install && cd ..
node tools/create-es-index.js
node tools/pg-to-es.js
```

### 5. 시맨틱 데이터 적재 (선택)
```bash
node tools/pg-to-fuseki.js     # Dublin Core
node tools/pg-to-bibframe.js   # BIBFRAME (Work/Instance/Item)
node tools/add-sameAs.js       # Wikidata 외부 연결
```

### 6. 백엔드 + 프론트엔드 기동
```bash
cd backend && npm install && npm run dev   # 포트 4000
cd frontend && npm install && npm run dev  # 포트 3000
```

브라우저 접속:
- 검색 포털: http://localhost:3000
- API 문서 (Swagger): http://localhost:4000/api-docs
- OAI-PMH baseURL: http://localhost:4000/oai?verb=Identify

---

## 프로젝트 구조

```
digital-library/
├── backend/
│   ├── src/
│   │   ├── routes/           # REST API 라우터
│   │   │   ├── bibs.js       # 서지 (MARC + 저자 + 주제)
│   │   │   ├── loans.js      # 대출/반납/연체
│   │   │   ├── users.js      # 이용자
│   │   │   ├── acquisitions.js # 수서
│   │   │   ├── eresources.js # 전자자원 + COUNTER R5
│   │   │   ├── search.js     # ES 검색 + 자동완성
│   │   │   ├── rag.js        # Claude RAG
│   │   │   ├── oai.js        # OAI-PMH 제공자
│   │   │   └── lod.js        # Linked Data 콘텐츠 협상
│   │   ├── app.js            # 라우터 등록 + READ_ONLY 모드
│   │   ├── server.js
│   │   ├── db.js             # PostgreSQL 풀
│   │   ├── scheduler.js      # node-cron (매일 03:00 OAI 수확)
│   │   └── swagger.js        # OpenAPI 3.1 명세
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── api/              # 백엔드 API 호출 모듈
│   │   ├── components/       # NavBar 등
│   │   ├── pages/
│   │   │   ├── user/         # 검색·상세·대출·AI 검색
│   │   │   └── admin/        # 대시보드·서지·수서·이용자·대출 관리
│   │   ├── config.js         # READ_ONLY 모드 단일 export
│   │   └── App.jsx           # 라우트 (이용자/관리자 분리)
│   └── .env.production       # VITE_READ_ONLY=true
├── tools/
│   ├── pg-to-es.js           # PG → Elasticsearch 색인
│   ├── pg-to-fuseki.js       # PG → Fuseki Dublin Core
│   ├── pg-to-bibframe.js     # PG → Fuseki BIBFRAME
│   ├── pg-to-basex.js        # PG → BaseX XML
│   ├── oai-harvester.js      # arXiv OAI-PMH 수확 → PG/ES/BaseX
│   ├── add-sameAs.js         # owl:sameAs Wikidata 연결
│   ├── create-es-index.js    # ES bib-records 인덱스 매핑
│   └── metadata-generator.js # Claude로 Dublin Core 자동 생성
├── database/
│   ├── schema.sql            # PostgreSQL 전체 스키마
│   ├── sample_data.sql       # 샘플 서지·이용자
│   └── migrations/
│       └── 001_eresources.sql # 5장 LSP 테이블
├── docs/
│   ├── architecture.md       # 시스템 아키텍처
│   ├── erd.md                # ERD (Mermaid)
│   ├── tables.md             # 테이블 명세
│   └── application-profile.xml # Dublin Core Application Profile
├── docker-compose.yml        # PG / ES / Fuseki / BaseX
└── test.http                 # REST Client (VS Code) 테스트 모음
```

---

## 주요 기능

### 이용자 화면 (`/`)
- **검색** — 키워드/제목/저자/주제어/ISBN 필드 분기, 한국어 nori 분석
- **서지 상세** — MARC 필드, 소장 현황, 대출 신청, **링크드 데이터로 보기** (JSON-LD + Wikidata 링크)
- **대출 현황** — 이용자 ID 입력 → 대출 목록 + 연체 강조 + 반납 처리
- **AI 자연어 검색** — Claude가 질문에서 키워드 추출 → ES 검색 → 답변 + 참고 자료

### 관리자 화면 (`/admin`)
- **대시보드** — 전체 서지/대출/연체 카운트 + 최근 입수 5건
- **서지 관리** — CRUD + 모달 폼 + 페이지네이션
- **수서 관리** — 구입 신청/수령 처리, 상태별 색상 (ordered/received/cataloged)
- **이용자 관리** — 조회 + 등록 (학생/교원/직원)
- **대출 관리** — 연체 목록 + 이용자별 대출 + 일괄 반납

### 시맨틱 / 표준 인터페이스
- **OAI-PMH 2.0**: `/oai?verb=Identify`, `ListRecords`, `GetRecord` 등 5종 verb
- **Linked Data**: `/resource/work/KMO202300001` 에 `Accept: text/turtle` → RDF 응답
- **SPARQL 페더레이션**: 우리 Fuseki에서 `SERVICE <https://query.wikidata.org/sparql>` 로 외부 데이터 결합
- **BIBFRAME**: Work/Instance/Item 3계층 + 저자 Agent 엔티티

---

## 운영 모드 (READ_ONLY)

공개 데모 환경(예: `dl.ailibrary.kr`)은 검색만 활성화하고 쓰기 작업은 모두 차단합니다. 이는 인증 시스템 없이도 안전하게 외부 노출이 가능하도록 한 설계입니다.

활성화:
```bash
# backend/.env
READ_ONLY_MODE=true
ALLOWED_ORIGIN=https://dl.ailibrary.kr

# frontend/.env.production
VITE_READ_ONLY=true
VITE_API_BASE_URL=https://dl.ailibrary.kr
```

차단되는 작업:
- POST/PUT/DELETE 모든 요청 → 403
- RAG 검색 → 503 + "비용 발생으로 사용 불가" 메시지
- 프론트엔드 관리자 메뉴 숨김, 대출 신청 버튼 비활성

---

## 배포

운영 저장소는 **배포 전용**입니다. 서버에서 소스를 직접 수정하지 않습니다.

```
로컬 수정 → git push origin main → 서버에서 재배포 스크립트
```

**서버에서 직접 커밋하지 않는 이유** — 2026-05-16 에 서버에서 4개 커밋이 직접 만들어져 로컬·GitHub 와 이력이 갈라진 적이 있습니다. 서버만 최신인 코드가 백업 없이 존재하게 되므로, `.git/hooks/pre-commit` 이 서버 커밋을 차단합니다. 재배포 스크립트의 `--ff-only` 도 같은 목적입니다 — 분기가 생기면 조용히 병합하지 않고 즉시 실패합니다.

접속 정보(`SERVER_HOST` 등)는 공개 저장소에 두지 않고 `.env` 에만 기재합니다 — `.env.example` 참고.

### 서버 구성

`teed`·`kisti`·`kistep` 등이 함께 올라가 있는 자체 서버에서 돌아갑니다. Caddy + systemd 구성이고, 필요한 것이 `deploy/` 에 모여 있습니다.

```bash
sudo ./deploy/install.sh    # 최초 구축 (여러 번 실행해도 안전)
./deploy.sh                 # 재배포 — git pull → 빌드 → 재시작 → 헬스체크
./deploy/backup.sh --verify # 수동 백업 (평소엔 타이머가 부른다)
./deploy/restore.sh         # 백업 스냅숏 목록 / 복원
```

| 구성요소 | 위치 |
|---|---|
| 정적 파일 | Caddy → `/var/www/dl` (빌드 후 복사) |
| API | systemd `dl-backend` → `127.0.0.1:4000` |
| PostgreSQL | 시스템 패키지 (16) |
| Elasticsearch / Fuseki / BaseX | `/opt/dl/*`, systemd `dl-elasticsearch`·`dl-fuseki`·`dl-basex` |
| Node | `.runtime/node` (프로젝트 안에 둠 — 한 머신에 여러 프로젝트가 있어 전역 버전을 고정하지 않음) |
| TLS | Caddy 자동 발급·갱신 |
| 무차별 대입 차단 | fail2ban — `/api/v1/admin/unlock` 과 RAG 의 401 을 본다 |
| 백업 | 매일 04:30, PostgreSQL 덤프만 (`deploy/backup.sh`) |

**정적 파일을 `/var/www/dl` 로 복사하는 이유** — 프로젝트가 홈 디렉토리에 있어서, Caddy 가 거기서 바로 읽게 하려면 `/home/user` 까지 전부 다른 사용자가 지나갈 수 있게 열어야 합니다. 같은 머신을 여러 프로젝트가 쓰고 있어 그 대가가 큽니다.

**PostgreSQL 만 백업하는 이유** — Elasticsearch·Fuseki·BaseX 는 모두 PG 에서 파생된 표현 저장소입니다. `tools/` 의 적재 스크립트로 언제든 다시 만들 수 있고, 같이 받으면 용량만 몇 배가 되면서 복원할 때 PG 와 어긋난 상태가 섞여 듭니다.

> **백업 사본이 한 곳뿐입니다.** 덤프는 같은 머신에 붙은 디스크에 쌓입니다. 머신 자체 사고에는 대비가 없으므로, 외부로 한 벌 더 보내는 장치가 필요합니다.

---

## 학습 핵심 포인트

이 프로젝트는 단순한 CRUD 학습이 아니라 **도서관 정보학의 핵심 표준**을 구현체로 만드는 것이 목표입니다.

| 표준 / 개념 | 구현 위치 |
|---|---|
| MARC21 서지 → REST | `backend/src/routes/bibs.js` |
| Dublin Core 응용 프로파일 | `tools/pg-to-fuseki.js`, `docs/application-profile.xml` |
| BIBFRAME (Work/Instance/Item) | `tools/pg-to-bibframe.js` |
| OAI-PMH 데이터 제공자 | `backend/src/routes/oai.js` |
| OAI-PMH 서비스 제공자 | `tools/oai-harvester.js` |
| COUNTER R5 SUSHI | `backend/src/routes/eresources.js` |
| 링크드 데이터 4원칙 | `tools/add-sameAs.js`, `backend/src/routes/lod.js` |
| SPARQL 페더레이션 (Wikidata) | `docs/architecture.md` 예시 쿼리 |
| Korean nori 분석기 (mixed/discard 분리) | `tools/create-es-index.js` |
| RAG 파이프라인 | `backend/src/routes/rag.js` |

---

## 기술적으로 짚어둘 점

**식별자 정책** — 모든 자원의 공개 식별자는 `control_number` (예: `KMO202300001`)입니다. ES `_id`, OAI-PMH identifier, Linked Data URI, REST `/api/bibs/:id` 모두 동일합니다. numeric PK는 내부 구현 세부사항으로 외부에 노출되지 않습니다.

**ES 매핑 — 색인용/검색용 분석기 분리** — nori `mixed` 모드는 색인 시 토큰 그래프(예: "디지털도서관" → 디지털·도서관·도서·관)를 만들어 재현율을 높이지만, 같은 분석기를 검색에 쓰면 `match` 쿼리가 phrase 매칭으로 바뀌면서 의도치 않은 0건 결과가 나옵니다. 색인엔 `mixed`, 검색엔 `discard`를 쓰는 매핑 패턴이 필요합니다 (`tools/create-es-index.js` 참고).

**Fuseki 데이터셋 update 활성화** — `stain/jena-fuseki:latest` 이미지에서 `FUSEKI_DATASET` 환경변수만 설정하면 read-only 데이터셋이 만들어집니다. update를 받으려면 `--update` 플래그를 command로 명시해야 합니다 (`docker-compose.yml` 참고).

---

## 라이선스 / 크레딧

- 학습 목적의 교재용 프로젝트입니다.
- 외부 데이터: arXiv (CC0), Wikidata (CC0)
- 사용 라이브러리: Express, React, Tailwind, Apache Jena, Apache Lucene, Anthropic SDK 등의 라이선스를 따릅니다.
