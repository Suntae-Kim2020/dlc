const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });

const { Client } = require('pg');

// -------------------------------------------------------
// 설정
// -------------------------------------------------------
const FUSEKI_URL = process.env.FUSEKI_URL || 'http://localhost:3030';
const FUSEKI_DATASET = process.env.FUSEKI_DATASET || 'digital-library';
const FUSEKI_USER = process.env.FUSEKI_USER || 'admin';
const FUSEKI_PASSWORD = process.env.FUSEKI_PASSWORD || '';
const UPDATE_ENDPOINT = `${FUSEKI_URL}/${FUSEKI_DATASET}/update`;
const AUTH_HEADER =
  'Basic ' +
  Buffer.from(`${FUSEKI_USER}:${FUSEKI_PASSWORD}`).toString('base64');

// SPARQL Update 전용 PREFIX (Turtle의 @prefix가 아님 — 줄 끝 마침표 없음)
const PREFIXES = [
  'PREFIX bf:     <http://id.loc.gov/ontologies/bibframe/>',
  'PREFIX bflc:   <http://id.loc.gov/ontologies/bflc/>',
  'PREFIX dc:     <http://purl.org/dc/elements/1.1/>',
  'PREFIX foaf:   <http://xmlns.com/foaf/0.1/>',
  'PREFIX owl:    <http://www.w3.org/2002/07/owl#>',
  'PREFIX schema: <http://schema.org/>',
  'PREFIX rdf:    <http://www.w3.org/1999/02/22-rdf-syntax-ns#>',
  'PREFIX rdfs:   <http://www.w3.org/2000/01/rdf-schema#>',
].join('\n');

// 자체 자원 IRI 베이스
const AILB_BASE = 'http://ailibrary.kr/resource';
const ORG_AILBRARY = `<${AILB_BASE}/organization/ailbrary>`;

// -------------------------------------------------------
// IRI 빌더 — slash가 들어가는 경로는 prefix화 어려우므로 full IRI 사용
// -------------------------------------------------------
const workIri = (cn) => `<${AILB_BASE}/work/${cn}>`;
const instanceIri = (cn) => `<${AILB_BASE}/instance/${cn}>`;
const itemIri = (cn) => `<${AILB_BASE}/item/${cn}-1>`;
const agentIri = (slug) => `<${AILB_BASE}/agent/${slug}>`;

// -------------------------------------------------------
// 유틸
// -------------------------------------------------------
function slugify(s) {
  if (!s) return '';
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// SPARQL/Turtle 큰따옴표 리터럴 (큰따옴표·역슬래시·줄바꿈 이스케이프)
function lit(s) {
  if (s == null) return null;
  const esc = String(s)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
  return `"${esc}"`;
}

// -------------------------------------------------------
// BIBFRAME 트리플 빌더
// -------------------------------------------------------
function buildWorkBlock(b) {
  const parts = ['a bf:Work'];

  if (b.title) {
    parts.push(`bf:title [ a bf:Title ; bf:mainTitle ${lit(b.title)} ]`);
  }

  if (b.main_entry) {
    parts.push(
      `bf:contribution [
    a bf:Contribution ;
    bf:agent [
      a bf:Agent ;
      rdfs:label ${lit(b.main_entry)} ;
      foaf:name ${lit(b.main_entry)}
    ]
  ]`,
    );
  }

  if (Array.isArray(b.subjects)) {
    const valid = b.subjects.filter(Boolean);
    if (valid.length > 0) {
      // 사용자 스펙대로 blank node로 표현
      const nodes = valid.map((s) => `[ rdfs:label ${lit(s)} ]`);
      parts.push(`bf:subject ${nodes.join(', ')}`);
    }
  }

  if (b.abstract) {
    parts.push(`schema:description ${lit(b.abstract)}`);
  }

  return `${workIri(b.control_number)} ${parts.join(' ;\n  ')} .`;
}

function buildInstanceBlock(b) {
  const parts = ['a bf:Instance'];
  parts.push(`bf:instanceOf ${workIri(b.control_number)}`);

  if (b.isbn) {
    parts.push(`bf:identifiedBy [ a bf:Isbn ; rdf:value ${lit(b.isbn)} ]`);
  }

  if (b.publisher || b.pub_year != null) {
    const pubParts = ['a bf:Publication'];
    if (b.publisher) pubParts.push(`bf:agent ${lit(b.publisher)}`);
    if (b.pub_year != null)
      pubParts.push(`bf:date ${lit(String(b.pub_year))}`);
    parts.push(`bf:provisionActivity [ ${pubParts.join(' ; ')} ]`);
  }

  if (b.extent) {
    parts.push(`bf:extent [ a bf:Extent ; rdfs:label ${lit(b.extent)} ]`);
  }

  return `${instanceIri(b.control_number)} ${parts.join(' ;\n  ')} .`;
}

function buildItemBlock(b) {
  const parts = ['a bf:Item'];
  parts.push(`bf:itemOf ${instanceIri(b.control_number)}`);
  if (b.call_number) parts.push(`bf:shelfMark ${lit(b.call_number)}`);
  parts.push(`bf:heldBy ${ORG_AILBRARY}`);
  return `${itemIri(b.control_number)} ${parts.join(' ;\n  ')} .`;
}

function buildAgentBlock(a) {
  const slug = slugify(a.name);
  if (!slug) return null;

  const parts = ['a bf:Agent'];
  if (a.name) parts.push(`foaf:name ${lit(a.name)}`);
  if (a.affiliation) parts.push(`schema:affiliation ${lit(a.affiliation)}`);
  if (a.orcid) parts.push(`owl:sameAs <https://orcid.org/${a.orcid}>`);

  return `${agentIri(slug)} ${parts.join(' ;\n  ')} .`;
}

// -------------------------------------------------------
// HTTP — Fuseki SPARQL Update
// -------------------------------------------------------
async function sendUpdate(sparql) {
  const res = await fetch(UPDATE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/sparql-update',
      Authorization: AUTH_HEADER,
    },
    body: sparql,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(
      `SPARQL Update 실패: ${res.status} ${res.statusText}\n${text}`,
    );
    err.status = res.status;
    throw err;
  }
}

// -------------------------------------------------------
// PostgreSQL — 서지 + 주제 + 저자 조회
// -------------------------------------------------------
async function fetchBibs(pg) {
  const result = await pg.query(`
    SELECT b.control_number, b.title, b.main_entry, b.publisher, b.pub_year,
           b.isbn, b.call_number, b.extent, b.abstract,
           COALESCE(
             array_agg(s.term) FILTER (WHERE s.term IS NOT NULL),
             '{}'
           ) AS subjects
      FROM bib_records b
      LEFT JOIN bib_subjects bs ON bs.bib_id = b.id
      LEFT JOIN subjects     s  ON s.id = bs.subject_id
     WHERE b.record_status = 'active'
     GROUP BY b.id
     ORDER BY b.id
  `);
  return result.rows;
}

async function fetchAuthors(pg) {
  const result = await pg.query(
    `SELECT name, affiliation, orcid FROM authors ORDER BY id`,
  );
  return result.rows;
}

// -------------------------------------------------------
// 메인
// -------------------------------------------------------
async function main() {
  const reset = process.argv.includes('--reset');

  const pg = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });
  await pg.connect();

  try {
    console.log(`Fuseki Update 엔드포인트: ${UPDATE_ENDPOINT}`);

    if (reset) {
      console.warn('--reset: 기본 그래프 전체 삭제 (DROP DEFAULT)');
      await sendUpdate('DROP DEFAULT');
    }

    const bibs = await fetchBibs(pg);
    console.log(`서지 ${bibs.length}건 조회`);

    const authors = await fetchAuthors(pg);
    console.log(`저자 ${authors.length}명 조회`);

    const blocks = [];
    for (const b of bibs) {
      blocks.push(buildWorkBlock(b));
      blocks.push(buildInstanceBlock(b));
      blocks.push(buildItemBlock(b));
    }
    for (const a of authors) {
      const block = buildAgentBlock(a);
      if (block) blocks.push(block);
    }

    if (blocks.length === 0) {
      console.log('업로드할 BIBFRAME 블록이 없습니다.');
      return;
    }

    // INSERT DATA에 한 번에 너무 큰 페이로드를 보내지 않도록 50블록씩 배치
    const BATCH = 50;
    let done = 0;
    for (let i = 0; i < blocks.length; i += BATCH) {
      const chunk = blocks.slice(i, i + BATCH);
      const sparql = `${PREFIXES}\nINSERT DATA {\n${chunk.join('\n')}\n}`;
      await sendUpdate(sparql);
      done += chunk.length;
      process.stdout.write(`\r업로드: ${done}/${blocks.length} 블록`);
    }
    console.log(
      `\n완료 — 총 ${blocks.length} 블록 ` +
        `(서지 ${bibs.length}건의 Work/Instance/Item + 저자 ${authors.length}명)`,
    );
  } finally {
    await pg.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
