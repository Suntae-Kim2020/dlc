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

// CORS — 프론트엔드(http://localhost:3000)만 허용
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());

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
