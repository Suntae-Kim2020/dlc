const { Router } = require('express');

const router = Router();

const FUSEKI_URL = process.env.FUSEKI_URL || 'http://localhost:3030';
const FUSEKI_DATASET = process.env.FUSEKI_DATASET || 'digital-library';

// POST /api/v1/sparql/query — 읽기 전용 SPARQL (SELECT/ASK/DESCRIBE/CONSTRUCT)
router.post('/query', async (req, res, next) => {
  try {
    const query = req.body?.query;
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'query(SPARQL 쿼리) 본문이 필요합니다.' });
    }

    // UPDATE 키워드 차단 (이 엔드포인트는 read-only)
    const trimmed = query.trim().toUpperCase();
    const isUpdate = /^(INSERT|DELETE|DROP|CREATE|LOAD|CLEAR|COPY|MOVE|ADD|WITH)\b/.test(
      trimmed,
    );
    if (isUpdate) {
      return res.status(400).json({
        error: '이 엔드포인트는 SELECT/ASK/DESCRIBE/CONSTRUCT 만 지원합니다.',
        hint: 'INSERT/DELETE 등 업데이트는 별도 엔드포인트(/api/v1/sparql/update)를 사용하세요.',
      });
    }

    const accept = req.get('Accept') || 'application/sparql-results+json';
    const fusekiRes = await fetch(
      `${FUSEKI_URL}/${FUSEKI_DATASET}/query`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/sparql-query',
          Accept: accept,
        },
        body: query,
      },
    );

    const text = await fusekiRes.text();
    const ct = fusekiRes.headers.get('content-type') || 'application/json';
    res.status(fusekiRes.status).set('Content-Type', ct).send(text);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/sparql/update — 활성 모드에서만 (X-Admin-Token 필요)
// (READ_ONLY 미들웨어가 이미 X-Admin-Token 검증을 처리하지만,
//  Fuseki에 그대로 위임할 때를 위한 별도 라우트)
router.post('/update', async (req, res, next) => {
  try {
    const update = req.body?.update;
    if (!update || typeof update !== 'string') {
      return res.status(400).json({ error: 'update(SPARQL Update) 본문이 필요합니다.' });
    }

    const fusekiRes = await fetch(
      `${FUSEKI_URL}/${FUSEKI_DATASET}/update`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/sparql-update' },
        body: update,
      },
    );

    if (!fusekiRes.ok) {
      const text = await fusekiRes.text();
      return res.status(fusekiRes.status).json({ error: text });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
