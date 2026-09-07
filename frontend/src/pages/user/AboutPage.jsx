// 소개 — 이 시스템이 무엇이고 왜 만들어졌는지.
//
// 화면 구성은 다른 이용자 페이지와 같은 규칙을 따른다(제목 + 부제, 카드,
// neutral 계열 + indigo 강조). 내용은 README 와 docs/architecture.md 의
// 사실만 옮겼다 — 실제 구현과 어긋나면 소개가 아니라 오해가 된다.

// 구현한 표준. 각 항목의 '위치'는 저장소 안 실제 경로다.
const STANDARDS = [
  {
    name: 'MARC21 서지',
    desc: '가변길이 필드·지시기호·서브필드 구조를 관계형으로 저장',
    where: 'backend/src/routes/bibs.js',
  },
  {
    name: 'Dublin Core',
    desc: '응용 프로파일을 정의하고 RDF 로 발행',
    where: 'tools/pg-to-fuseki.js',
  },
  {
    name: 'BIBFRAME',
    desc: 'Work · Instance · Item 3계층과 저자 Agent 엔티티',
    where: 'tools/pg-to-bibframe.js',
  },
  {
    name: 'OAI-PMH 2.0',
    desc: '데이터 제공자(6개 verb) + 외부 저장소 수확기 양쪽 모두',
    where: 'backend/src/routes/oai.js',
  },
  {
    name: 'COUNTER R5 SUSHI',
    desc: '전자자원 이용통계 수집 인터페이스 모의',
    where: 'backend/src/routes/eresources.js',
  },
  {
    name: '링크드 데이터',
    desc: 'Accept 헤더에 따라 Turtle · RDF/XML · JSON-LD 반환, owl:sameAs 로 Wikidata 연결',
    where: 'backend/src/routes/lod.js',
  },
]

// 자료가 흐르는 순서. PostgreSQL 이 원본이고 나머지는 파생이라는 점이
// 이 시스템에서 가장 중요한 설계 결정이라 따로 보여준다.
const PIPELINE = [
  { store: 'PostgreSQL', role: '원본 (source of truth)', accent: true },
  { store: 'Elasticsearch', role: '검색 색인 — 한국어 nori 형태소 분석' },
  { store: 'Apache Jena Fuseki', role: 'RDF 트리플 — Dublin Core + BIBFRAME' },
  { store: 'BaseX', role: 'XML 원문 — MARCXML · MODS' },
]

const PEOPLE = [
  {
    name: '김선태',
    title: '교수',
    org: '전북대학교 문헌정보학과',
    bio: '문헌정보학을 순수하게 공부하는 학생들에게 더 나은 교육 환경을 제공하고자 이 프로젝트를 시작했습니다.',
  },
]

// 후원 기업. 소개 문구와 링크는 lislab.kr/about/people 의 원문 그대로다.
const SPONSORS = [
  {
    name: '(주)아르고넷',
    tagline: 'AI 기반 연구성과 · 연구데이터 관리 전문 기업',
    url: 'https://argonet.co.kr/',
    host: 'argonet.co.kr',
    bio: '(주)아르고넷은 “정보, 자원, 시스템, 사람이 서로 소통하는 더 나은 지식세상”을 지향하며 AI 기반 연구성과·연구데이터 관리 분야를 선도해 온 전문 기업입니다. 대학과 정부출연연구기관, 학회를 대상으로 연구자의 논문·특허·저서 등 다양한 성과정보를 통합 수집하고 객관적 지표로 분석하는 연구성과관리시스템(R2RIMS/S2RIMS), 기관의 학술 자산을 개방형으로 축적·공개하는 기관 리포지터리 ScholarWorks, 데이터관리계획(DMP) 수립부터 R&D 연구데이터의 보존·공유·재사용까지 지원하는 연구데이터 리포지터리 DataWorks를 공급하고 있습니다. 또한 학술지 논문 투고·심사 관리 서비스, AI 검색 솔루션 ARi Search, 콘텐츠 통합관리 시스템 Contentree 등을 통해 메타데이터 표준과 시맨틱·AI 기술을 실제 서비스로 구현해 왔습니다. 오픈 사이언스 생태계에 필요한 실무 역량과 현장 경험을 바탕으로 LIS Lab의 교육·연구 활동을 후원하고 있습니다.',
  },
  {
    name: '(주)알투어스',
    tagline: '연구데이터 전주기 컨설팅 전문 기업',
    url: 'https://r2urs.com/',
    host: 'r2urs.com',
    bio: '주식회사 알투어스(R2URS)는 연구데이터의 수집·저장·관리·보존·출판·재사용에 이르는 전주기를 아우르는 연구데이터 컨설팅 전문 기업입니다. 국제 표준에 기반한 실행 중심의 컨설팅을 지향하며, 신뢰할 수 있는 데이터 리포지터리의 국제 인증인 CoreTrustSeal 획득 컨설팅을 핵심 역량으로 삼고 있습니다. 이와 함께 기관의 연구데이터 거버넌스 체계 수립(조직·규정·프로세스 정비), 연구자가 실무에 바로 활용할 수 있는 전주기 가이드라인 제작, 학문 분야별 메타데이터 스키마 설계와 표준 제정, DOI·ISNI 등 식별체계 연계, 기관평가 대응을 위한 성과 분석과 증빙 체계화, 연구데이터 플랫폼·리포지터리 구축 및 운영 지원까지 폭넓은 서비스를 제공합니다. 17개 기관과 34건의 과제를 수행하며 축적한 현장 경험을 바탕으로 LIS Lab의 교육·연구 활동을 후원하고 있습니다.',
  },
]

function Section({ title, desc, children }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900 tracking-tight">
          {title}
        </h2>
        {desc && <p className="text-sm text-neutral-500 mt-1">{desc}</p>}
      </div>
      {children}
    </section>
  )
}

export default function AboutPage() {
  return (
    <div className="space-y-12 pb-8">
      {/* ---------------------------------------------------------- 머리말 */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold text-neutral-900 tracking-tight">
          소개
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          AI Library — 대학도서관 자동화시스템(LAS)을 처음부터 만들어 보는 교육용
          구현체
        </p>
      </div>

      <p className="text-[15px] leading-7 text-neutral-700 max-w-3xl">
        도서관 정보학의 핵심 표준들은 문서로만 읽으면 손에 잡히지 않습니다. MARC
        의 지시기호가 왜 그 자리에 있는지, OAI-PMH 의 resumption token 이 무엇을
        해결하는지는 직접 만들어 봐야 알게 됩니다. 이 시스템은 그
        표준들을 <strong className="font-semibold text-neutral-900">읽는 문서가
        아니라 돌아가는 코드</strong>로 옮겨 놓은 것입니다. 검색 · 메타데이터
        · 시맨틱 웹 · 링크드 데이터 · AI 검색까지 한 코드베이스 안에서 서로
        어떻게 맞물리는지 확인할 수 있습니다.
      </p>

      {/* ---------------------------------------------------------- 표준 */}
      <Section
        title="구현한 표준"
        desc="각 항목은 설명이 아니라 실제로 동작하는 코드입니다. 옆의 경로가 그 위치입니다."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {STANDARDS.map((s) => (
            <div
              key={s.name}
              className="border border-neutral-200 rounded-lg p-4 hover:border-neutral-300 transition-colors"
            >
              <h3 className="font-medium text-neutral-900">{s.name}</h3>
              <p className="text-sm text-neutral-600 mt-1 leading-6">{s.desc}</p>
              <code className="text-xs text-neutral-400 font-mono mt-2 block break-all">
                {s.where}
              </code>
            </div>
          ))}
        </div>
      </Section>

      {/* ---------------------------------------------------------- 구조 */}
      <Section
        title="네 개의 저장소, 하나의 원본"
        desc="검색·RDF·XML 저장소는 모두 PostgreSQL 에서 파생됩니다. 언제든 다시 만들 수 있고, 그래서 백업도 PostgreSQL 만 받습니다."
      >
        <div className="space-y-2">
          {PIPELINE.map((p) => (
            <div
              key={p.store}
              className={[
                'flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 rounded-lg px-4 py-3 border',
                p.accent
                  ? 'border-indigo-200 bg-indigo-50/50'
                  : 'border-neutral-200',
              ].join(' ')}
            >
              <span
                className={[
                  'font-medium whitespace-nowrap sm:w-44',
                  p.accent ? 'text-indigo-700' : 'text-neutral-900',
                ].join(' ')}
              >
                {p.store}
              </span>
              <span className="text-sm text-neutral-600">{p.role}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* ---------------------------------------------------------- 데모 모드 */}
      <Section
        title="이 공개 화면에 대하여"
        desc="누구나 볼 수 있도록 열어 둔 데모 환경입니다."
      >
        <div className="border border-neutral-200 rounded-lg p-4 space-y-2">
          <p className="text-sm text-neutral-600 leading-6">
            검색 · 조회 · SPARQL 질의는 자유롭게 사용하실 수 있습니다. 등록 ·
            수정 · 삭제 같은 쓰기 작업과 AI 검색은 잠겨 있습니다 — 인증 체계
            없이도 안전하게 외부에 열어 두기 위한 설계이고, AI 검색은 호출마다
            비용이 발생하기 때문입니다.
          </p>
          <p className="text-sm text-neutral-600 leading-6">
            학습 목적의 열람은 자유롭게 하셔도 됩니다. 상업적 이용은 하실 수
            없습니다.
          </p>
        </div>
      </Section>

      {/* ---------------------------------------------------------- 사람 */}
      <Section title="만든 사람">
        <div className="grid gap-3 sm:grid-cols-2">
          {PEOPLE.map((p) => (
            <div
              key={p.name}
              className="border border-neutral-200 rounded-lg p-4"
            >
              <div className="flex items-baseline gap-2">
                <h3 className="font-medium text-neutral-900">{p.name}</h3>
                <span className="text-sm text-neutral-500">{p.title}</span>
              </div>
              <p className="text-xs text-neutral-500 mt-0.5">{p.org}</p>
              <p className="text-sm text-neutral-600 mt-2 leading-6">{p.bio}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ---------------------------------------------------------- 후원 */}
      <Section
        title="운영에 도움을 주는 기업들"
        desc="LIS Lab 의 교육·연구 활동은 아래 기업들의 후원으로 운영됩니다."
      >
        <div className="space-y-3">
          {SPONSORS.map((s) => (
            <div
              key={s.name}
              className="border border-neutral-200 rounded-lg p-5"
            >
              <h3 className="font-medium text-neutral-900">{s.name}</h3>
              <p className="text-sm text-indigo-600 mt-0.5">{s.tagline}</p>
              <p className="text-sm text-neutral-600 mt-3 leading-7">{s.bio}</p>
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline mt-3"
              >
                {s.host} 바로가기
                <span aria-hidden="true">→</span>
              </a>
            </div>
          ))}
        </div>
      </Section>

      {/* ---------------------------------------------------------- 바깥 링크 */}
      <div className="border-t border-neutral-200 pt-6">
        <p className="text-sm text-neutral-500">
          문헌정보학 교육 자료는{' '}
          <a
            href="https://lislab.kr"
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-600 hover:underline"
          >
            LIS Lab
          </a>
          에서 함께 운영하고 있습니다.
        </p>
      </div>
    </div>
  )
}
