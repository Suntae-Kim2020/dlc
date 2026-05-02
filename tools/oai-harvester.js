const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });

const fs = require('fs');
const { XMLParser } = require('fast-xml-parser');
const { Client: PgClient } = require('pg');

// -------------------------------------------------------
// 설정
// -------------------------------------------------------
const ARXIV_BASE = 'https://export.arxiv.org/oai2';
const ARXIV_SET = 'cs';
const METADATA_PREFIX = 'oai_dc';

const HARVEST_LIMIT = 20;          // 한 번 실행에 수확할 최대 건수
const REQUEST_DELAY_MS = 5000;     // arXiv 권장 — 요청 간 5초

const STATE_FILE = path.resolve(__dirname, 'harvest-state.json');

const ES_HOST = process.env.ES_HOST || 'http://localhost:9200';
const ES_INDEX = 'bib-records';

const BASEX_URL = process.env.BASEX_URL || 'http://localhost:8984';
const BASEX_USER = process.env.BASEX_USER || 'admin';
const BASEX_PASSWORD = process.env.BASEX_PASSWORD || 'admin';
const BASEX_DB = 'arxiv';
const BASEX_AUTH =
  'Basic ' +
  Buffer.from(`${BASEX_USER}:${BASEX_PASSWORD}`).toString('base64');

const USER_AGENT = 'digital-library-harvester/1.0';

// -------------------------------------------------------
// XML 파서
// -------------------------------------------------------
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true, // oai_dc:dc → dc, dc:title → title
  parseTagValue: false, // 모든 값 문자열 유지(arXiv 식별자/날짜 보호)
  trimValues: true,
});

// -------------------------------------------------------
// 유틸
// -------------------------------------------------------
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoISODate(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function asArray(v) {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

// XML 이스케이프 (BaseX에 다시 보낼 XML 직렬화용)
function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// 식별자(oai:arXiv.org:cs/0001001)를 안전하게 URL 경로/ID로 변환
function safeId(identifier) {
  return encodeURIComponent(identifier);
}

// arXiv OAI 식별자 → PG bib_records.control_number 안전 키
// "oai:arXiv.org:cs/0001001" → "ARXIV-cs-0001001"
// 우리 OAI 제공자가 'oai:ailibrary.kr:' 접두사를 붙이는 정책과 충돌하지 않도록
// 외부 OAI 접두사는 제거하고 경로 구분자도 하이픈으로 정규화한다.
function arxivControlNumber(oaiId) {
  const local = oaiId.replace(/^oai:arXiv\.org:/i, '');
  const safe = local.replace(/[/\\:.\s]/g, '-');
  return `ARXIV-${safe}`;
}

// -------------------------------------------------------
// 상태 파일 — 마지막 수확 날짜 저장/로드
// -------------------------------------------------------
function loadState() {
  if (!fs.existsSync(STATE_FILE)) {
    return { last_harvest: daysAgoISODate(7) };
  }
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { last_harvest: daysAgoISODate(7) };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
}

// -------------------------------------------------------
// BaseX — arxiv 데이터베이스 자동 생성 (idempotent)
// -------------------------------------------------------
async function ensureBaseXDatabase() {
  const xquery =
    `<query xmlns="http://basex.org/rest">` +
    `<text>if (db:exists('${BASEX_DB}')) then () else db:create('${BASEX_DB}')</text>` +
    `</query>`;
  const res = await fetch(`${BASEX_URL}/rest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/xml',
      Authorization: BASEX_AUTH,
    },
    body: xquery,
  });
  if (!res.ok) {
    throw new Error(`BaseX DB 준비 실패: ${res.status} ${await res.text()}`);
  }
}

// -------------------------------------------------------
// OAI-PMH 요청
// -------------------------------------------------------
function buildListUrl({ from, until, resumptionToken }) {
  const params = new URLSearchParams();
  params.set('verb', 'ListRecords');
  if (resumptionToken) {
    // resumptionToken 사용 시 다른 파라미터는 보내지 않음 (OAI-PMH 규격)
    params.set('resumptionToken', resumptionToken);
  } else {
    params.set('metadataPrefix', METADATA_PREFIX);
    params.set('set', ARXIV_SET);
    params.set('from', from);
    params.set('until', until);
  }
  return `${ARXIV_BASE}?${params.toString()}`;
}

async function fetchOaiPage(opts) {
  const url = buildListUrl(opts);
  console.log(`OAI 요청: ${url}`);
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });

  // arXiv 503 — Retry-After 헤더에 따라 재시도
  if (res.status === 503) {
    const retryAfter = parseInt(res.headers.get('retry-after') || '30', 10);
    console.log(`arXiv 503 — ${retryAfter}초 후 재시도`);
    await sleep(retryAfter * 1000);
    return fetchOaiPage(opts);
  }
  if (!res.ok) {
    throw new Error(`OAI 요청 실패: ${res.status} ${await res.text()}`);
  }
  return await res.text();
}

// -------------------------------------------------------
// Dublin Core 추출
// -------------------------------------------------------
function extractDC(record) {
  const dc = record?.metadata?.dc || {};
  const first = (key) => {
    const arr = asArray(dc[key]);
    return arr.length > 0 ? String(arr[0]).trim() : null;
  };
  const all = (key) =>
    asArray(dc[key]).map((s) => String(s).trim()).filter(Boolean);
  return {
    title: first('title'),
    creators: all('creator'),
    subjects: all('subject'),
    description: first('description'),
    date: first('date'),
    identifiers: all('identifier'),
  };
}

// -------------------------------------------------------
// BaseX 저장 — Dublin Core XML 재구성
// -------------------------------------------------------
function buildDcXml(headerId, dc) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<oai_dc:dc xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/" ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/">',
    `  <dc:identifier>${escapeXml(headerId)}</dc:identifier>`,
  ];
  if (dc.title) lines.push(`  <dc:title>${escapeXml(dc.title)}</dc:title>`);
  for (const c of dc.creators) lines.push(`  <dc:creator>${escapeXml(c)}</dc:creator>`);
  for (const s of dc.subjects) lines.push(`  <dc:subject>${escapeXml(s)}</dc:subject>`);
  if (dc.description)
    lines.push(`  <dc:description>${escapeXml(dc.description)}</dc:description>`);
  if (dc.date) lines.push(`  <dc:date>${escapeXml(dc.date)}</dc:date>`);
  for (const i of dc.identifiers)
    lines.push(`  <dc:identifier>${escapeXml(i)}</dc:identifier>`);
  lines.push('</oai_dc:dc>');
  return lines.join('\n');
}

async function saveToBaseX(headerId, xml) {
  const res = await fetch(
    `${BASEX_URL}/rest/${BASEX_DB}/${safeId(headerId)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/xml',
        Authorization: BASEX_AUTH,
      },
      body: xml,
    },
  );
  if (!res.ok) {
    throw new Error(`BaseX 저장 실패: ${res.status} ${await res.text()}`);
  }
}

// -------------------------------------------------------
// PostgreSQL upsert — bib_records가 LAS의 source of truth
// (BaseX/ES는 파생 저장소; PG에 적재되어야 OAI 제공자에도 노출됨)
// -------------------------------------------------------
async function upsertToPg(pg, headerId, dc) {
  const cn = arxivControlNumber(headerId);
  const author = dc.creators[0] || null;
  const pubYear = dc.date
    ? parseInt(String(dc.date).slice(0, 4), 10) || null
    : null;

  await pg.query(
    `INSERT INTO bib_records
       (control_number, title, main_entry, pub_year, abstract)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (control_number) DO UPDATE SET
       title      = EXCLUDED.title,
       main_entry = EXCLUDED.main_entry,
       pub_year   = EXCLUDED.pub_year,
       abstract   = EXCLUDED.abstract`,
    [cn, dc.title, author, pubYear, dc.description],
  );
}

// -------------------------------------------------------
// Elasticsearch 색인 — 동일 식별자는 PUT으로 멱등 처리
// (POST /_doc 사용 시 매 수확마다 중복 문서가 쌓이므로 PUT _doc/{id})
// -------------------------------------------------------
async function indexToEs(headerId, dc) {
  // 작업 2의 인덱스 매핑(authors/subjects 복수형 + nori)에 맞춰 색인.
  // creator/subject 단수형으로 보내면 동적 매핑이 끼어들면서 nori가 적용되지 않음.
  const doc = {
    title: dc.title,
    authors: dc.creators,
    subjects: dc.subjects,
    abstract: dc.description,
    date: dc.date,
    identifier: headerId,
  };
  const res = await fetch(
    `${ES_HOST}/${ES_INDEX}/_doc/${safeId(headerId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(doc),
    },
  );
  if (!res.ok) {
    throw new Error(`ES 색인 실패: ${res.status} ${await res.text()}`);
  }
}

// -------------------------------------------------------
// 메인 — 수확 루프
// -------------------------------------------------------
async function main() {
  await ensureBaseXDatabase();
  console.log(`BaseX 데이터베이스 '${BASEX_DB}' 준비 완료`);

  const pg = new PgClient({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });
  await pg.connect();
  console.log('PostgreSQL 연결 완료');

  const state = loadState();
  const from = state.last_harvest;
  const until = todayISODate();
  console.log(`수확 기간: ${from} ~ ${until}`);
  console.log(`수확 한도: ${HARVEST_LIMIT}건`);

  let harvested = 0;
  let basexOk = 0;
  let esOk = 0;
  let pgOk = 0;
  let errors = 0;

  let resumptionToken = null;
  let firstRequest = true;

  outer: while (firstRequest || resumptionToken) {
    if (!firstRequest) {
      console.log(`${REQUEST_DELAY_MS / 1000}초 대기...`);
      await sleep(REQUEST_DELAY_MS);
    }
    firstRequest = false;

    const xmlText = await fetchOaiPage({ from, until, resumptionToken });
    const parsed = xmlParser.parse(xmlText);
    const oaiResp = parsed['OAI-PMH'] || {};

    if (oaiResp.error) {
      const code = oaiResp.error['@_code'] || 'unknown';
      const message = oaiResp.error['#text'] || '';
      if (code === 'noRecordsMatch') {
        console.log('수확 기간 내 신규 레코드 없음 (noRecordsMatch)');
        break;
      }
      throw new Error(`OAI 오류: ${code} — ${message}`);
    }

    const list = oaiResp.ListRecords || {};
    const records = asArray(list.record);

    for (const record of records) {
      if (harvested >= HARVEST_LIMIT) break outer;

      const headerId = record?.header?.identifier;
      if (!headerId) {
        errors++;
        continue;
      }
      if (record?.header?.['@_status'] === 'deleted') {
        // 삭제 표시 레코드는 건너뜀 (필요 시 BaseX/ES에서 DELETE도 가능)
        continue;
      }

      harvested++;
      const dc = extractDC(record);

      try {
        await saveToBaseX(headerId, buildDcXml(headerId, dc));
        basexOk++;
      } catch (err) {
        errors++;
        console.error(`[BaseX] ${headerId}: ${err.message}`);
      }

      try {
        await indexToEs(headerId, dc);
        esOk++;
      } catch (err) {
        errors++;
        console.error(`[ES] ${headerId}: ${err.message}`);
      }

      try {
        await upsertToPg(pg, headerId, dc);
        pgOk++;
      } catch (err) {
        errors++;
        console.error(`[PG] ${headerId}: ${err.message}`);
      }
    }

    // resumptionToken 추출
    const rt = list.resumptionToken;
    const tokenValue =
      typeof rt === 'object' && rt !== null ? rt['#text'] : rt;
    resumptionToken =
      tokenValue && String(tokenValue).trim() ? String(tokenValue).trim() : null;

    if (resumptionToken) {
      console.log(`다음 페이지 토큰: ${resumptionToken}`);
    }
  }

  await pg.end();

  // 수확 종료 후 상태 갱신
  state.last_harvest = until;
  saveState(state);

  console.log('\n=== 수확 결과 ===');
  console.log(`수확 건수    : ${harvested}`);
  console.log(`BaseX 저장   : ${basexOk}`);
  console.log(`ES 색인      : ${esOk}`);
  console.log(`PG 적재      : ${pgOk}`);
  console.log(`오류         : ${errors}`);
  console.log(`다음 수확 시작: ${state.last_harvest}`);
}

main().catch((err) => {
  console.error('수확 실패:', err);
  process.exit(1);
});
