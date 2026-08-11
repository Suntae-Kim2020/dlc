const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { Router } = require('express');

const pool = require('../db');

const router = Router();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.env.RAG_PASSWORD;

// POST /api/v1/admin/unlock  — 활성 모드 전환을 위한 비밀번호 검증
router.post('/unlock', (req, res) => {
  if (!ADMIN_PASSWORD) {
    return res.status(503).json({
      error: '관리자 비밀번호가 서버에 설정되어 있지 않습니다.',
    });
  }
  const provided = req.body?.password;
  if (!provided) {
    return res.status(400).json({ error: '비밀번호를 입력하세요.' });
  }
  if (provided !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: '비밀번호가 올바르지 않습니다.' });
  }
  // 학습용 단순 토큰 — 비밀번호 자체를 토큰으로 사용
  // (운영 환경에선 JWT 등 시간 제한 토큰 권장)
  res.json({
    token: ADMIN_PASSWORD,
    message: '활성 모드로 전환되었습니다.',
  });
});

// POST /api/v1/admin/verify  — 토큰 유효성 확인 (선택)
router.post('/verify', (req, res) => {
  const token = req.get('X-Admin-Token') || req.body?.token;
  if (!ADMIN_PASSWORD) return res.status(503).json({ valid: false });
  res.json({ valid: token === ADMIN_PASSWORD });
});

// =====================================================
// OAI 수확 — 시작 / SSE 진행 / 이력 / 상태
// =====================================================

const HARVESTER_PATH = path.resolve(
  __dirname,
  '../../../tools/oai-harvester.js',
);
const HARVEST_STATE_FILE = path.resolve(
  __dirname,
  '../../../tools/harvest-state.json',
);

// 현재 실행 중인 작업 한 건 + SSE 구독자 목록 (단일 서버 인스턴스 가정)
const jobs = new Map(); // jobId -> { events: [], subs: Set<res>, status, child }

function broadcast(jobId, event) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.events.push(event);
  // 메모리 보호: 이벤트 너무 많이 쌓이면 가장 오래된 것부터 버림
  if (job.events.length > 500) job.events.shift();
  for (const res of job.subs) {
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch {
      /* 연결이 끊어진 구독자는 cleanup 핸들러가 정리 */
    }
  }
}

function activeJobId() {
  for (const [id, j] of jobs.entries()) {
    if (j.status === 'running') return id;
  }
  return null;
}

// 권한: 활성모드(X-Admin-Token) 만 허용
function requireAdmin(req, res, next) {
  const token = req.get('X-Admin-Token');
  if (!ADMIN_PASSWORD || token !== ADMIN_PASSWORD) {
    return res.status(403).json({ error: '활성 모드 인증이 필요합니다.' });
  }
  next();
}

// POST /api/v1/admin/harvest/run — 수확 시작
router.post('/harvest/run', requireAdmin, async (req, res) => {
  if (activeJobId()) {
    return res.status(409).json({
      error: '이미 수확 작업이 실행 중입니다.',
      activeJobId: activeJobId(),
    });
  }

  // 1. PG 에 이력 행 먼저 생성 — id 를 자식 프로세스에 전달
  let jobId;
  try {
    const ins = await pool.query(
      `INSERT INTO oai_harvests
         (source, triggered_by, status)
       VALUES ('arxiv', 'manual', 'running') RETURNING id`,
    );
    jobId = ins.rows[0].id;
  } catch (err) {
    return res.status(500).json({ error: `이력 행 생성 실패: ${err.message}` });
  }

  // 2. 자식 프로세스 spawn — stdout 의 PROGRESS:{json} 라인을 SSE 로 중계
  const child = spawn(
    process.execPath,
    [HARVESTER_PATH, `--job-id=${jobId}`, '--triggered-by=manual'],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    },
  );

  jobs.set(jobId, {
    events: [],
    subs: new Set(),
    status: 'running',
    child,
  });

  let stdoutBuf = '';
  child.stdout.on('data', (chunk) => {
    process.stdout.write(`[harvester ${jobId}] ${chunk}`);
    stdoutBuf += chunk.toString('utf8');
    let idx;
    while ((idx = stdoutBuf.indexOf('\n')) !== -1) {
      const line = stdoutBuf.slice(0, idx).trimEnd();
      stdoutBuf = stdoutBuf.slice(idx + 1);
      if (line.startsWith('PROGRESS:')) {
        try {
          const event = JSON.parse(line.slice('PROGRESS:'.length));
          broadcast(jobId, event);
        } catch (err) {
          console.error(`[harvest:${jobId}] 진행상황 파싱 실패: ${err.message}`);
        }
      }
    }
  });

  child.stderr.on('data', (chunk) => {
    process.stderr.write(`[harvester:${jobId}:err] ${chunk}`);
  });

  child.on('exit', (code) => {
    const job = jobs.get(jobId);
    if (job) {
      job.status = code === 0 ? 'finished' : 'failed';
      broadcast(jobId, {
        phase: 'exit',
        jobId,
        exitCode: code,
        ok: code === 0,
      });
      // SSE 구독자 종료 신호 후 닫기
      for (const r of job.subs) {
        try {
          r.end();
        } catch {
          /* already closed */
        }
      }
      // 5분 후 메모리에서 제거
      setTimeout(() => jobs.delete(jobId), 5 * 60 * 1000);
    }
  });

  res.status(202).json({ jobId });
});

// GET /api/v1/admin/harvest/stream/:jobId — SSE 진행 스트림
router.get('/harvest/stream/:jobId', requireAdmin, (req, res) => {
  const jobId = parseInt(req.params.jobId, 10);
  const job = jobs.get(jobId);
  if (!job) {
    return res.status(404).json({ error: '작업을 찾을 수 없습니다.' });
  }

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // nginx 버퍼링 비활성화
  });
  res.flushHeaders?.();

  // 누적된 이벤트 먼저 전부 보냄 — 클라이언트가 늦게 붙어도 처음부터 재생 가능
  for (const ev of job.events) {
    res.write(`data: ${JSON.stringify(ev)}\n\n`);
  }

  job.subs.add(res);

  // 작업이 이미 끝났으면 즉시 닫음
  if (job.status !== 'running') {
    res.write(
      `data: ${JSON.stringify({ phase: 'closed', jobId, status: job.status })}\n\n`,
    );
    res.end();
    return;
  }

  // 30초마다 keep-alive ping (프록시/브라우저 타임아웃 방지)
  const keepalive = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch {
      clearInterval(keepalive);
    }
  }, 30000);

  req.on('close', () => {
    clearInterval(keepalive);
    job.subs.delete(res);
  });
});

// GET /api/v1/admin/harvest/history?limit=20 — 이력 조회
router.get('/harvest/history', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  try {
    const result = await pool.query(
      `SELECT id, started_at, finished_at, source, triggered_by, status,
              from_date, until_date, total, harvested,
              pg_ok, es_ok, basex_ok, errors, error_message
         FROM oai_harvests
         ORDER BY started_at DESC
         LIMIT $1`,
      [limit],
    );
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/admin/harvest/state — 현재 상태(마지막 수확일, 활성 작업)
router.get('/harvest/state', async (req, res) => {
  let lastHarvest = null;
  try {
    if (fs.existsSync(HARVEST_STATE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(HARVEST_STATE_FILE, 'utf8'));
      lastHarvest = raw.last_harvest || null;
    }
  } catch {
    /* 파일 없거나 깨졌으면 null 유지 */
  }

  let lastFinished = null;
  try {
    const r = await pool.query(
      `SELECT started_at, finished_at, status, harvested, errors
         FROM oai_harvests
         WHERE status IN ('success', 'partial', 'failed')
         ORDER BY started_at DESC LIMIT 1`,
    );
    lastFinished = r.rows[0] || null;
  } catch {
    /* 테이블 없거나 PG 미연결 — null 유지 */
  }

  const schedulerOn = process.env.OAI_SCHEDULER_ENABLED === 'true';
  res.json({
    lastHarvestDate: lastHarvest,
    activeJobId: activeJobId(),
    lastFinished,
    schedule: schedulerOn ? '매일 03:00 KST 자동' : '비활성 (수동 실행만)',
    schedulerEnabled: schedulerOn,
  });
});

module.exports = router;
