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
const swaggerSpec = require('./swagger');
const { startScheduler } = require('./scheduler');

const app = express();

// CORS — dev는 localhost:3000, prod는 ALLOWED_ORIGIN 환경변수
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());

// 읽기 전용 모드 — 운영(데모) 환경에서 쓰기 작업 차단
// RAG는 별도 비밀번호 검증으로 통제 (rag.js의 미들웨어 참고)
const READ_ONLY = process.env.READ_ONLY_MODE === 'true';
if (READ_ONLY) {
  console.log('[app] READ_ONLY 모드 활성 — 쓰기 요청 차단 (RAG는 비밀번호로 별도 통제).');

  app.use((req, res, next) => {
    // RAG는 자체 인증을 가지므로 READ_ONLY 검사에서 제외
    if (req.path.startsWith('/api/v1/rag')) return next();

    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      return res.status(403).json({
        error: '데모 환경 — 읽기 전용 모드입니다. 자료 변경 작업은 비활성화되어 있습니다.',
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

// OAI-PMH 데이터 제공자 (표준상 baseURL은 버전 prefix 없이 노출)
app.use('/oai', oaiRouter);

// Linked Data 콘텐츠 협상 — /resource/:type/:id
// (URI 베이스가 http://ailibrary.kr/resource 이므로 같은 경로로 마운트)
app.use('/resource', lodRouter);

// 스케줄러 시작 — 매일 새벽 3시(KST) OAI 수확 자동 실행
startScheduler();

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
