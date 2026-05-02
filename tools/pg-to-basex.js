const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });

const { Client } = require('pg');

const BASEX_URL = process.env.BASEX_URL || 'http://localhost:8984';
const BASEX_USER = process.env.BASEX_USER || 'admin';
const BASEX_PASSWORD = process.env.BASEX_PASSWORD || 'admin';
const BASEX_DB = 'ailb';

const AUTH_HEADER =
  'Basic ' + Buffer.from(`${BASEX_USER}:${BASEX_PASSWORD}`).toString('base64');

const NS_DC = 'http://purl.org/dc/elements/1.1/';
const NS_AILB = 'http://ai-library.example.ac.kr/ns/';

function escapeXml(v) {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toDublinCoreXml(r) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<ailb:record xmlns:dc="${NS_DC}" xmlns:ailb="${NS_AILB}">`,
  ];
  const push = (tag, val, attrs = '') => {
    if (val == null || val === '') return;
    lines.push(`  <${tag}${attrs}>${escapeXml(val)}</${tag}>`);
  };

  push('dc:title', r.title);
  push('dc:creator', r.main_entry);
  push('dc:description', r.abstract);
  push('dc:publisher', r.publisher);
  push('dc:date', r.pub_year);
  push('dc:identifier', r.isbn, ' scheme="ISBN"');
  push('ailb:callNumber', r.call_number);
  push('ailb:extent', r.extent);

  lines.push('</ailb:record>');
  return lines.join('\n');
}

async function basexRequest(pathname, { method, body, contentType }) {
  const res = await fetch(`${BASEX_URL}${pathname}`, {
    method,
    headers: {
      Authorization: AUTH_HEADER,
      ...(contentType ? { 'Content-Type': contentType } : {}),
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${method} ${pathname} → ${res.status} ${res.statusText}\n${text}`);
  }
  return res;
}

async function ensureDatabase() {
  const xquery = `<query xmlns="http://basex.org/rest">
  <text>if (db:exists('${BASEX_DB}')) then () else db:create('${BASEX_DB}')</text>
</query>`;
  await basexRequest('/rest', {
    method: 'POST',
    body: xquery,
    contentType: 'application/xml',
  });
}

async function putDocument(controlNumber, xml) {
  const safe = encodeURIComponent(controlNumber);
  await basexRequest(`/rest/${BASEX_DB}/${safe}`, {
    method: 'PUT',
    body: xml,
    contentType: 'application/xml',
  });
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
    await ensureDatabase();
    console.log(`BaseX 데이터베이스 '${BASEX_DB}' 준비 완료`);

    const { rows } = await pg.query(
      `SELECT control_number, title, main_entry, abstract, publisher,
              pub_year, isbn, call_number, extent
         FROM bib_records
        WHERE record_status = 'active'
        ORDER BY id`,
    );
    console.log(`PostgreSQL에서 ${rows.length}건 조회`);

    let ok = 0;
    let fail = 0;
    for (const r of rows) {
      if (!r.control_number) {
        fail++;
        console.error('제어번호 누락 레코드 스킵');
        continue;
      }
      try {
        await putDocument(r.control_number, toDublinCoreXml(r));
        ok++;
        process.stdout.write(`\r진행: ${ok}/${rows.length}`);
      } catch (err) {
        fail++;
        console.error(`\n${r.control_number} 변환 실패 — ${err.message}`);
      }
    }
    console.log(`\n완료 — 성공 ${ok} / 실패 ${fail}`);
  } finally {
    await pg.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
