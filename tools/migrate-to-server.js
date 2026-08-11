// 로컬 dev → 서버 데이터 마이그레이션
//
// 동작 방식: SSH 다중 -L 포트포워딩 터널을 띄워 서버의 PG/ES/BaseX 를
// 로컬 포트로 노출. 그 동안 PG/ES/BaseX 클라이언트로 동기화 진행.
//
// 환경변수 (backend/.env 또는 셸에서 지정):
//   SERVER_HOST   필수 — 대상 서버 주소
//   SERVER_USER   필수 — SSH 계정
//   SERVER_KEY    선택 — SSH 개인키 경로 (기본 ~/.ssh/id_rsa)
//   SERVER_PATH   선택 — 서버의 저장소 경로 (기본 /home/user/DLC/digital-library)
//   SERVER_PORT   선택 — SSH 포트 (기본 22)
//
// 배포 대상 정보는 공개 저장소에 남기지 않도록 기본값을 두지 않는다.

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execSync } = require('child_process');
const net = require('net');

require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });

const { Client: PgClient } = require('pg');

// ----- 설정 -----
const SERVER_HOST = process.env.SERVER_HOST;
const SERVER_USER = process.env.SERVER_USER;
const SERVER_KEY =
  process.env.SERVER_KEY || path.join(os.homedir(), '.ssh/id_rsa');
// 서버에 저장소가 놓인 경로. 예전 서버는 /opt/dlc 였고 지금은 홈 아래에 있다.
// 서버를 옮길 때마다 이 파일을 고치지 않도록 밖으로 뺀다.
const SERVER_PATH =
  process.env.SERVER_PATH || '/home/user/DLC/digital-library';
// 서버 SSH 포트. 기본 22 가 아닌 곳이 있어 밖으로 뺀다.
const SERVER_PORT = process.env.SERVER_PORT || '22';

if (!SERVER_HOST || !SERVER_USER) {
  console.error(
    '[설정 누락] SERVER_HOST 와 SERVER_USER 가 필요합니다.\n' +
      '  backend/.env 에 추가하거나 실행 시 지정하세요:\n' +
      '    SERVER_HOST=example.com SERVER_USER=deploy node tools/migrate-to-server.js',
  );
  process.exit(1);
}

const LOCAL_PG_PORT = parseInt(process.env.DB_PORT, 10) || 5432;
const LOCAL_ES_HOST = process.env.ES_HOST || 'http://localhost:9200';
const LOCAL_BASEX_URL = process.env.BASEX_URL || 'http://localhost:8984';

// 로컬에서 본 서버 포워딩 포트 (충돌 회피)
const FWD_PG_PORT = 15432;
const FWD_ES_PORT = 19200;
const FWD_BASEX_PORT = 18984;

const ES_INDEX = 'bib-records';
const BASEX_DB = 'arxiv';

const LOCAL_BASEX_AUTH =
  'Basic ' +
  Buffer.from(`admin:${process.env.BASEX_PASSWORD || 'admin'}`).toString(
    'base64',
  );

// 서버의 자격증명은 ssh 로 .env 를 끌어와 자동으로 사용
function fetchServerEnv() {
  const out = execSync(
    `ssh -i "${SERVER_KEY}" -p ${SERVER_PORT} -o StrictHostKeyChecking=no -o BatchMode=yes ${SERVER_USER}@${SERVER_HOST} "cat ${SERVER_PATH}/backend/.env"`,
    { encoding: 'utf8' },
  );
  const env = {};
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

let SERVER_ENV = {};
let SERVER_BASEX_AUTH = LOCAL_BASEX_AUTH;

// ----- 진행 표시 -----
class ProgressBar {
  constructor(label, total) {
    this.label = label;
    this.total = total;
    this.current = 0;
    this.lastSub = '';
    this.render();
  }
  tick(n = 1, sublabel = '') {
    this.current += n;
    this.lastSub = sublabel;
    this.render();
  }
  finish() {
    if (this.current < this.total) this.current = this.total;
    this.render();
    process.stdout.write('\n');
  }
  render() {
    const width = 28;
    const pct = this.total > 0 ? this.current / this.total : 1;
    const filled = Math.round(pct * width);
    const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
    const sub = this.lastSub
      ? ' ' + this.lastSub.replace(/\s+/g, ' ').slice(0, 40)
      : '';
    process.stdout.write(
      `\r${this.label.padEnd(7)} [${bar}] ${String(this.current).padStart(
        3,
      )}/${this.total} (${(pct * 100).toFixed(0).padStart(3)}%)${sub}      `,
    );
  }
}

// ----- SSH 터널 -----
function waitForPort(port, timeoutMs = 8000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const sock = net.connect(port, '127.0.0.1');
      sock.once('connect', () => {
        sock.end();
        resolve();
      });
      sock.once('error', () => {
        sock.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`포트 ${port} 가 ${timeoutMs}ms 안에 열리지 않음`));
        } else {
          setTimeout(tryConnect, 250);
        }
      });
    };
    tryConnect();
  });
}

async function startTunnel() {
  const args = [
    '-i', SERVER_KEY,
    '-p', SERVER_PORT,
    '-N', '-T',
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'ExitOnForwardFailure=yes',
    '-o', 'ServerAliveInterval=30',
    '-L', `${FWD_PG_PORT}:localhost:5432`,
    '-L', `${FWD_ES_PORT}:localhost:9200`,
    '-L', `${FWD_BASEX_PORT}:localhost:8984`,
    `${SERVER_USER}@${SERVER_HOST}`,
  ];
  const ssh = spawn('ssh', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderrBuf = '';
  ssh.stderr.on('data', (c) => {
    stderrBuf += c.toString();
  });
  ssh.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.error(`\n[ssh tunnel] 종료 코드 ${code}\n${stderrBuf}`);
    }
  });

  // 세 개 포트 모두 열릴 때까지 대기
  await Promise.all([
    waitForPort(FWD_PG_PORT),
    waitForPort(FWD_ES_PORT),
    waitForPort(FWD_BASEX_PORT),
  ]);
  return ssh;
}

// ----- PG 마이그레이션 -----
async function migratePg() {
  const local = new PgClient({
    host: process.env.DB_HOST,
    port: LOCAL_PG_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });
  await local.connect();

  const cnt = await local.query(
    `SELECT COUNT(*)::int AS n FROM bib_records WHERE control_number LIKE 'ARXIV-%'`,
  );
  const total = cnt.rows[0].n;
  if (total === 0) {
    console.log('PG     건너뜀 (ARXIV-* 레코드 없음)');
    await local.end();
    return { ok: 0, total: 0 };
  }

  const remote = new PgClient({
    host: '127.0.0.1',
    port: FWD_PG_PORT,
    database: SERVER_ENV.DB_NAME || process.env.DB_NAME,
    user: SERVER_ENV.DB_USER || process.env.DB_USER,
    password: SERVER_ENV.DB_PASSWORD,
  });
  await remote.connect();

  const data = await local.query(
    `SELECT control_number, title, main_entry, pub_year, abstract
       FROM bib_records
      WHERE control_number LIKE 'ARXIV-%'
      ORDER BY id`,
  );

  const bar = new ProgressBar('PG', total);
  let ok = 0;
  for (const row of data.rows) {
    try {
      await remote.query(
        `INSERT INTO bib_records (control_number, title, main_entry, pub_year, abstract)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (control_number) DO UPDATE SET
           title      = EXCLUDED.title,
           main_entry = EXCLUDED.main_entry,
           pub_year   = EXCLUDED.pub_year,
           abstract   = EXCLUDED.abstract`,
        [row.control_number, row.title, row.main_entry, row.pub_year, row.abstract],
      );
      ok++;
    } catch (err) {
      process.stdout.write(`\n  PG ${row.control_number}: ${err.message}\n`);
    }
    bar.tick(1, row.control_number);
  }
  bar.finish();

  await local.end();
  await remote.end();
  return { ok, total };
}

// ----- ES 마이그레이션 -----
async function migrateEs() {
  const cntRes = await fetch(`${LOCAL_ES_HOST}/${ES_INDEX}/_count`).then((r) =>
    r.ok ? r.json() : null,
  );
  if (!cntRes) {
    console.log('ES     건너뜀 (로컬 인덱스 없음)');
    return { ok: 0, total: 0 };
  }
  const total = cntRes.count || 0;
  if (total === 0) {
    console.log('ES     건너뜀 (도큐먼트 없음)');
    return { ok: 0, total: 0 };
  }

  // 자료가 적다고 가정 — 한 번에 가져옴 (10000 건 한도)
  const sres = await fetch(`${LOCAL_ES_HOST}/${ES_INDEX}/_search?size=10000`)
    .then((r) => r.json());
  const hits = sres.hits?.hits || [];

  const bar = new ProgressBar('ES', hits.length);
  let ok = 0;
  for (const hit of hits) {
    try {
      const r = await fetch(
        `http://127.0.0.1:${FWD_ES_PORT}/${ES_INDEX}/_doc/${encodeURIComponent(hit._id)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(hit._source),
        },
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      ok++;
    } catch (err) {
      process.stdout.write(`\n  ES ${hit._id}: ${err.message}\n`);
    }
    bar.tick(1, String(hit._id).slice(0, 40));
  }
  bar.finish();
  return { ok, total: hits.length };
}

// ----- BaseX 마이그레이션 -----
async function migrateBaseX() {
  // 로컬에 arxiv DB 가 있는지 확인 + 도큐먼트 목록 가져오기
  const listQuery =
    `<query xmlns="http://basex.org/rest"><text>` +
    `if (db:exists('${BASEX_DB}')) then string-join(db:list('${BASEX_DB}'), '&#10;') else ''` +
    `</text></query>`;

  const listRes = await fetch(`${LOCAL_BASEX_URL}/rest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/xml', Authorization: LOCAL_BASEX_AUTH },
    body: listQuery,
  });
  if (!listRes.ok) {
    console.log(`BaseX  건너뜀 (로컬 DB 접근 실패: ${listRes.status})`);
    return { ok: 0, total: 0 };
  }
  const listText = (await listRes.text()).trim();
  const docs = listText ? listText.split('\n').map((s) => s.trim()).filter(Boolean) : [];
  if (docs.length === 0) {
    console.log('BaseX  건너뜀 (도큐먼트 없음)');
    return { ok: 0, total: 0 };
  }

  // 서버에 arxiv DB 보장
  const ensureQuery =
    `<query xmlns="http://basex.org/rest"><text>` +
    `if (db:exists('${BASEX_DB}')) then () else db:create('${BASEX_DB}')` +
    `</text></query>`;
  const ensureRes = await fetch(`http://127.0.0.1:${FWD_BASEX_PORT}/rest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/xml', Authorization: SERVER_BASEX_AUTH },
    body: ensureQuery,
  });
  if (!ensureRes.ok) {
    throw new Error(
      `서버 BaseX DB 생성 실패: ${ensureRes.status} ${await ensureRes.text()}`,
    );
  }

  const bar = new ProgressBar('BaseX', docs.length);
  let ok = 0;
  for (const docName of docs) {
    try {
      const lr = await fetch(
        `${LOCAL_BASEX_URL}/rest/${BASEX_DB}/${encodeURIComponent(docName)}`,
        { headers: { Authorization: LOCAL_BASEX_AUTH } },
      );
      if (!lr.ok) throw new Error(`로컬 fetch ${lr.status}`);
      const xml = await lr.text();
      const rr = await fetch(
        `http://127.0.0.1:${FWD_BASEX_PORT}/rest/${BASEX_DB}/${encodeURIComponent(docName)}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/xml',
            Authorization: SERVER_BASEX_AUTH,
          },
          body: xml,
        },
      );
      if (!rr.ok) throw new Error(`서버 PUT ${rr.status}`);
      ok++;
    } catch (err) {
      process.stdout.write(`\n  BaseX ${docName}: ${err.message}\n`);
    }
    bar.tick(1, docName);
  }
  bar.finish();
  return { ok, total: docs.length };
}

// ----- harvest-state.json -----
function copyHarvestState() {
  const stateFile = path.resolve(__dirname, 'harvest-state.json');
  if (!fs.existsSync(stateFile)) {
    console.log('state  건너뜀 (harvest-state.json 없음)');
    return;
  }
  process.stdout.write('state  복사 중... ');
  execSync(
    `scp -i "${SERVER_KEY}" -P ${SERVER_PORT} -o StrictHostKeyChecking=no -q "${stateFile}" ` +
      `${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/tools/harvest-state.json`,
    { stdio: 'inherit' },
  );
  process.stdout.write('완료\n');
}

// ----- oai_harvests 이력 기록 -----
async function recordMigration({ pgRes, esRes, basexRes, errors, fromDate }) {
  const remote = new PgClient({
    host: '127.0.0.1',
    port: FWD_PG_PORT,
    database: SERVER_ENV.DB_NAME || process.env.DB_NAME,
    user: SERVER_ENV.DB_USER || process.env.DB_USER,
    password: SERVER_ENV.DB_PASSWORD,
  });
  await remote.connect();
  // 마이그레이션 한 건수의 대표값 — 가장 큰 단일 저장소 카운트로
  const harvested = Math.max(pgRes.ok, esRes.ok, basexRes.ok);
  const total = Math.max(pgRes.total, esRes.total, basexRes.total);
  const status = errors > 0 ? 'partial' : 'success';
  await remote.query(
    `INSERT INTO oai_harvests
       (source, triggered_by, status, started_at, finished_at,
        from_date, until_date, total, harvested, pg_ok, es_ok, basex_ok, errors)
     VALUES ('arxiv', 'dev_migration', $1,
             NOW(), NOW(),
             $2, CURRENT_DATE, $3, $4, $5, $6, $7, $8)`,
    [
      status,
      fromDate,
      total,
      harvested,
      pgRes.ok,
      esRes.ok,
      basexRes.ok,
      errors,
    ],
  );
  await remote.end();
}

// ----- 메인 -----
async function main() {
  console.log('========================================');
  console.log('  dev → server 데이터 마이그레이션');
  console.log('========================================');
  console.log(`  서버  ${SERVER_USER}@${SERVER_HOST}`);
  console.log(`  키    ${SERVER_KEY}`);
  console.log('');

  process.stdout.write('서버 자격증명 가져오는 중... ');
  SERVER_ENV = fetchServerEnv();
  if (SERVER_ENV.BASEX_PASSWORD) {
    SERVER_BASEX_AUTH =
      'Basic ' +
      Buffer.from(`admin:${SERVER_ENV.BASEX_PASSWORD}`).toString('base64');
  }
  process.stdout.write('OK\n');

  // harvest-state.json 의 last_harvest 를 fromDate 로 사용
  let fromDate = null;
  const stateFile = path.resolve(__dirname, 'harvest-state.json');
  if (fs.existsSync(stateFile)) {
    try {
      fromDate = JSON.parse(fs.readFileSync(stateFile, 'utf8')).last_harvest;
    } catch {
      /* ignore */
    }
  }

  process.stdout.write('SSH 터널 시작... ');
  const ssh = await startTunnel();
  process.stdout.write('OK\n\n');

  let pgRes = { ok: 0, total: 0 };
  let esRes = { ok: 0, total: 0 };
  let basexRes = { ok: 0, total: 0 };
  let totalErrors = 0;

  try {
    pgRes = await migratePg();
    totalErrors += pgRes.total - pgRes.ok;

    esRes = await migrateEs();
    totalErrors += esRes.total - esRes.ok;

    basexRes = await migrateBaseX();
    totalErrors += basexRes.total - basexRes.ok;

    copyHarvestState();

    await recordMigration({
      pgRes,
      esRes,
      basexRes,
      errors: totalErrors,
      fromDate,
    });

    console.log('\n========================================');
    console.log('  마이그레이션 완료');
    console.log('========================================');
    console.log(`  PG     ${pgRes.ok} / ${pgRes.total}`);
    console.log(`  ES     ${esRes.ok} / ${esRes.total}`);
    console.log(`  BaseX  ${basexRes.ok} / ${basexRes.total}`);
    console.log(`  오류   ${totalErrors}`);
  } finally {
    process.stdout.write('\nSSH 터널 종료... ');
    ssh.kill();
    process.stdout.write('OK\n');
  }
}

main().catch((err) => {
  console.error('\n마이그레이션 실패:', err);
  process.exit(1);
});
