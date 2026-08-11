const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');

const bibsRouter = require('./routes/bibs');
const loansRouter = require('./routes/loans');
const usersRouter = require('./routes/users');
const acquisitionsRouter = require('./routes/acquisitions');
const eresourcesRouter = require('./routes/eresources');
const searchRouter = require('./routes/search');
const ragRouter = require('./routes/rag');
const oaiRouter = require('./routes/oai');
const lodRouter = require('./routes/lod');
const adminRouter = require('./routes/admin');
const sparqlRouter = require('./routes/sparql');
const swaggerSpec = require('./swagger');
const { startScheduler } = require('./scheduler');

const app = express();

// CORS — dev는 localhost:3000, prod는 ALLOWED_ORIGIN 환경변수
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());

// 읽기 전용 모드 — 데모 환경에서 쓰기·RAG 차단
// 활성 모드 전환: X-Admin-Token 헤더에 ADMIN_PASSWORD를 보내면 통과
// (admin.js의 unlock 엔드포인트로 검증 후 클라이언트가 sessionStorage에 저장)
const READ_ONLY = process.env.READ_ONLY_MODE === 'true';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.env.RAG_PASSWORD;

if (READ_ONLY) {
  console.log(
    '[app] READ_ONLY 모드 활성 — 쓰기/RAG는 X-Admin-Token 헤더로 통제',
  );

  app.use((req, res, next) => {
    // RAG는 자체 검증 (X-RAG-Password 또는 X-Admin-Token)
    if (req.path.startsWith('/api/v1/rag')) return next();

    // SPARQL query는 read-only이므로 통과 (update는 라우터 안에서 별도 검증)
    if (req.path === '/api/v1/sparql/query') return next();

    // unlock 엔드포인트 자체는 통과 — 비밀번호 검증은 그 안에서
    if (req.path === '/api/v1/admin/unlock') return next();

    // 쓰기 요청 — X-Admin-Token 검증
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const token = req.get('X-Admin-Token');
      if (ADMIN_PASSWORD && token === ADMIN_PASSWORD) {
        return next(); // 활성 모드 — 쓰기 허용
      }
      return res.status(403).json({
        error: '데모 모드 — 활성 모드 전환이 필요합니다.',
        hint: '메인 화면에서 [활성 모드 전환] 버튼으로 비밀번호를 입력하세요.',
      });
    }
    next();
  });
}

// Swagger UI — 개발자 문서
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/api-docs.json', (_req, res) => res.json(swaggerSpec));

// v1 라우트 (권장)
app.use('/api/v1/bibs', bibsRouter);
app.use('/api/v1/loans', loansRouter);
app.use('/api/v1/users', usersRouter);
app.use('/api/v1/acquisitions', acquisitionsRouter);
app.use('/api/v1/e-resources', eresourcesRouter);
app.use('/api/v1/search', searchRouter);
app.use('/api/v1/rag', ragRouter);
app.use('/api/v1/admin', adminRouter);
app.use('/api/v1/sparql', sparqlRouter);

// OAI-PMH 데이터 제공자 (표준상 baseURL은 버전 prefix 없이 노출)
app.use('/oai', oaiRouter);

// Linked Data 콘텐츠 협상 — /resource/:type/:id
// (URI 베이스가 http://ailibrary.kr/resource 이므로 같은 경로로 마운트)
app.use('/resource', lodRouter);

// OAI 자동 수확 — OAI_SCHEDULER_ENABLED=true 일 때만 매일 새벽 3시(KST) 실행.
// 기본은 꺼짐 — 관리자 화면에서 수동 실행으로 충분, 자동은 노이즈만 만든다.
if (process.env.OAI_SCHEDULER_ENABLED === 'true') {
  startScheduler();
} else {
  console.log('[scheduler] OAI 자동 수확 비활성 (수동 실행만 허용)');
}

// 하위 호환성 — /api/* (deprecated, v1로 마이그레이션 권장)
app.use('/api/bibs', bibsRouter);
app.use('/api/loans', loansRouter);
app.use('/api/users', usersRouter);
app.use('/api/acquisitions', acquisitionsRouter);

// 헬스체크
app.get(['/api/health', '/api/v1/health'], (_req, res) => {
  res.json({ status: 'ok' });
});

// 404
app.use((_req, res) => {
  res.status(404).json({ error: '요청한 리소스를 찾을 수 없습니다.' });
});

// 글로벌 에러 핸들러
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: '서버 내부 오류가 발생했습니다.' });
});

module.exports = app;
