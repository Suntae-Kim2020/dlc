const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });

const { Client } = require('pg');

const FUSEKI_URL = process.env.FUSEKI_URL || 'http://localhost:3030';
const FUSEKI_DATASET = process.env.FUSEKI_DATASET || 'digital-library';
const FUSEKI_USER = process.env.FUSEKI_USER || 'admin';
const FUSEKI_PASSWORD = process.env.FUSEKI_PASSWORD || '';

const UPDATE_ENDPOINT = `${FUSEKI_URL}/${FUSEKI_DATASET}/update`;

const AUTH_HEADER =
  'Basic ' +
  Buffer.from(`${FUSEKI_USER}:${FUSEKI_PASSWORD}`).toString('base64');

// SPARQL Update 전용 prefix 선언 — @prefix / 마침표 금지
const PREFIXES = [
  'PREFIX dc: <http://purl.org/dc/elements/1.1/>',
  'PREFIX ailb: <http://ailibrary.kr/ontology#>',
  'PREFIX foaf: <http://xmlns.com/foaf/0.1/>',
  'PREFIX schema: <http://schema.org/>',
  'PREFIX bib: <http://ailibrary.kr/resource/bib/>',
  'PREFIX auth: <http://ailibrary.kr/resource/author/>',
].join('\n');

// 로컬명 슬러그 — 라틴 외 문자(한글 등)도 보존, 공백은 하이픈
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

// SPARQL 단일따옴표 문자열 이스케이프
function esc(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

function bibTriples(r) {
  const out = [];
  if (!r.control_number) return out;
  const s = `bib:${r.control_number}`;

  if (r.title) out.push(`${s} dc:title '${esc(r.title)}' .`);

  if (r.main_entry) {
    const sl = slugify(r.main_entry);
    if (sl) out.push(`${s} dc:creator auth:${sl} .`);
  }

  if (Array.isArray(r.subjects)) {
    for (const term of r.subjects) {
      if (term) out.push(`${s} dc:subject '${esc(term)}' .`);
    }
  }

  if (r.publisher) out.push(`${s} dc:publisher '${esc(r.publisher)}' .`);
  if (r.pub_year != null)
    out.push(`${s} dc:date '${esc(r.pub_year)}' .`);
  if (r.isbn) out.push(`${s} dc:identifier 'ISBN:${esc(r.isbn)}' .`);
  if (r.call_number)
    out.push(`${s} ailb:callNumber '${esc(r.call_number)}' .`);

  return out;
}

function authorTriples(a) {
  const out = [];
  const sl = slugify(a.name);
  if (!sl) return out;
  const s = `auth:${sl}`;
  if (a.name) out.push(`${s} foaf:name '${esc(a.name)}' .`);
  if (a.affiliation)
    out.push(`${s} schema:affiliation '${esc(a.affiliation)}' .`);
  return out;
}

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
    const err = new Error(`${res.status} ${res.statusText}\n${text}`);
    err.status = res.status;
    throw err;
  }
}

// 데이터셋이 update를 받아들이는지 확인하고, 필요 시 tdb2로 재생성.
// (stain/jena-fuseki의 FUSEKI_DATASET 자동 생성은 read-only가 될 수 있음)
async function ensureWritableDataset() {
  try {
    await sendUpdate('INSERT DATA {}');
    return;
  } catch (err) {
    if (err.status !== 405) throw err;
    console.warn("기존 데이터셋이 쓰기 불가 — tdb2로 재생성합니다.");
  }

  const del = await fetch(
    `${FUSEKI_URL}/$/datasets/${FUSEKI_DATASET}`,
    { method: 'DELETE', headers: { Authorization: AUTH_HEADER } },
  );
  if (!del.ok && del.status !== 404) {
    const text = await del.text().catch(() => '');
    throw new Error(`데이터셋 삭제 실패: ${del.status}\n${text}`);
  }

  const body = new URLSearchParams({
    dbName: FUSEKI_DATASET,
    dbType: 'tdb2',
  }).toString();
  const create = await fetch(`${FUSEKI_URL}/$/datasets`, {
    method: 'POST',
    headers: {
      Authorization: AUTH_HEADER,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  if (!create.ok) {
    const text = await create.text().catch(() => '');
    throw new Error(`데이터셋 생성 실패: ${create.status}\n${text}`);
  }
  console.log(`데이터셋 '${FUSEKI_DATASET}' 재생성 완료 (tdb2)`);
}

async function main() {
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
    await ensureWritableDataset();

    // 서지 + 주제(조인으로 집계) 조회
    const bibResult = await pg.query(
      `SELECT b.control_number, b.title, b.main_entry,
              b.publisher, b.pub_year, b.isbn, b.call_number,
              COALESCE(
                array_agg(s.term) FILTER (WHERE s.term IS NOT NULL),
                '{}'
              ) AS subjects
         FROM bib_records b
         LEFT JOIN bib_subjects bs ON bs.bib_id = b.id
         LEFT JOIN subjects s ON s.id = bs.subject_id
        WHERE b.record_status = 'active'
        GROUP BY b.id
        ORDER BY b.id`,
    );
    console.log(`서지 ${bibResult.rows.length}건 조회`);

    const authorResult = await pg.query(
      `SELECT name, affiliation FROM authors ORDER BY id`,
    );
    console.log(`저자 ${authorResult.rows.length}건 조회`);

    const triples = [];
    for (const r of bibResult.rows) triples.push(...bibTriples(r));
    for (const a of authorResult.rows) triples.push(...authorTriples(a));

    if (triples.length === 0) {
      console.log('업로드할 트리플이 없습니다.');
      return;
    }

    // 배치 업로드 — 한 번에 너무 큰 요청을 피함
    const BATCH = 500;
    let done = 0;
    for (let i = 0; i < triples.length; i += BATCH) {
      const chunk = triples.slice(i, i + BATCH);
      const sparql = `${PREFIXES}\nINSERT DATA {\n  ${chunk.join('\n  ')}\n}`;
      await sendUpdate(sparql);
      done += chunk.length;
      process.stdout.write(`\r업로드: ${done}/${triples.length} triples`);
    }
    console.log(`\n완료 — 총 ${triples.length} triples`);
  } finally {
    await pg.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
