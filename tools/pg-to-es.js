const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });

const { Client } = require('pg');

const ES_HOST = process.env.ES_HOST || 'http://localhost:9200';
const INDEX_NAME = 'bib-records';
const BULK_ENDPOINT = `${ES_HOST}/${INDEX_NAME}/_bulk`;
const BATCH_SIZE = 1000;

async function fetchAllBibs(pg) {
  const { rows } = await pg.query(`
    SELECT b.control_number, b.title, b.main_entry, b.publisher,
           b.pub_year, b.isbn, b.call_number, b.abstract,
           COALESCE(
             array_agg(DISTINCT a.name) FILTER (WHERE a.name IS NOT NULL),
             '{}'
           ) AS authors,
           COALESCE(
             array_agg(DISTINCT s.term) FILTER (WHERE s.term IS NOT NULL),
             '{}'
           ) AS subjects
      FROM bib_records b
      LEFT JOIN bib_authors  ba ON ba.bib_id = b.id
      LEFT JOIN authors      a  ON a.id = ba.author_id
      LEFT JOIN bib_subjects bs ON bs.bib_id = b.id
      LEFT JOIN subjects     s  ON s.id = bs.subject_id
     WHERE b.record_status = 'active'
     GROUP BY b.id
     ORDER BY b.id
  `);
  return rows;
}

function buildBulkPayload(rows) {
  const lines = [];
  for (const r of rows) {
    lines.push(
      JSON.stringify({
        index: { _index: INDEX_NAME, _id: r.control_number },
      }),
    );
    lines.push(
      JSON.stringify({
        control_number: r.control_number,
        title: r.title,
        main_entry: r.main_entry,
        publisher: r.publisher,
        pub_year: r.pub_year,
        isbn: r.isbn,
        call_number: r.call_number,
        abstract: r.abstract,
        authors: r.authors,
        subjects: r.subjects,
      }),
    );
  }
  // _bulk 페이로드는 마지막 줄도 개행으로 끝나야 함
  return lines.join('\n') + '\n';
}

async function sendBulk(payload) {
  const res = await fetch(BULK_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-ndjson' },
    body: payload,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Bulk 요청 실패: ${res.status}\n${text}`);
  }
  return res.json();
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
    console.log(`Elasticsearch: ${ES_HOST}`);
    console.log(`인덱스: ${INDEX_NAME}`);

    const rows = await fetchAllBibs(pg);
    console.log(`PostgreSQL에서 ${rows.length}건 조회`);
    if (rows.length === 0) return;

    let ok = 0;
    let fail = 0;
    const failures = [];

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const chunk = rows.slice(i, i + BATCH_SIZE);
      const payload = buildBulkPayload(chunk);
      const resp = await sendBulk(payload);

      for (const item of resp.items) {
        const op = item.index || item.create || item.update;
        if (op.error) {
          fail++;
          failures.push({
            id: op._id,
            reason: op.error.reason || op.error.type,
          });
        } else {
          ok++;
        }
      }
      process.stdout.write(`\r진행: ${ok + fail}/${rows.length}`);
    }

    console.log(`\n완료 — 성공 ${ok} / 실패 ${fail}`);
    if (failures.length > 0) {
      console.error('실패 상세 (상위 10건):');
      for (const f of failures.slice(0, 10)) {
        console.error(`  ${f.id} → ${f.reason}`);
      }
      if (failures.length > 10) {
        console.error(`  ... 외 ${failures.length - 10}건`);
      }
    }
  } finally {
    await pg.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
