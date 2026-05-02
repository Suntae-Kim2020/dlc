const { Router } = require('express');

const router = Router();

const FUSEKI_URL = process.env.FUSEKI_URL || 'http://localhost:3030';
const FUSEKI_DATASET = process.env.FUSEKI_DATASET || 'digital-library';
const FUSEKI_USER = process.env.FUSEKI_USER || 'admin';
const FUSEKI_PASSWORD = process.env.FUSEKI_PASSWORD || '';
const QUERY_ENDPOINT = `${FUSEKI_URL}/${FUSEKI_DATASET}/query`;
const AUTH_HEADER =
  'Basic ' +
  Buffer.from(`${FUSEKI_USER}:${FUSEKI_PASSWORD}`).toString('base64');

const RESOURCE_BASE = 'http://ailibrary.kr/resource';

// type/id 안전 패턴 — SPARQL 주입 방지
const VALID_PARAM = /^[A-Za-z0-9._\-]+$/;

// Accept 헤더 → Fuseki에 위임할 RDF Content-Type 결정
function negotiateRdfFormat(acceptHeader) {
  if (!acceptHeader) return null;
  const lower = acceptHeader.toLowerCase();
  if (lower.includes('text/turtle')) return 'text/turtle';
  if (lower.includes('application/rdf+xml')) return 'application/rdf+xml';
  if (lower.includes('application/ld+json')) return 'application/ld+json';
  if (lower.includes('application/n-triples')) return 'application/n-triples';
  return null;
}

// SPARQL DESCRIBE 위임 — 클라이언트가 요청한 RDF 포맷으로 직렬화
async function fusekiDescribe(uri, contentType) {
  const sparql = `DESCRIBE <${uri}>`;
  const params = new URLSearchParams({ query: sparql });
  const res = await fetch(`${QUERY_ENDPOINT}?${params}`, {
    method: 'GET',
    headers: {
      Accept: contentType,
      Authorization: AUTH_HEADER,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(
      `SPARQL DESCRIBE 실패: ${res.status} ${res.statusText}\n${text}`,
    );
    err.status = res.status;
    throw err;
  }
  return res.text();
}

// -------------------------------------------------------
// GET /resource/:type/:id  — Linked Data Content Negotiation
// -------------------------------------------------------
router.get('/:type/:id', async (req, res, next) => {
  try {
    const { type, id } = req.params;

    if (!VALID_PARAM.test(type) || !VALID_PARAM.test(id)) {
      return res
        .status(400)
        .json({ error: '잘못된 type 또는 id 형식입니다.' });
    }

    const uri = `${RESOURCE_BASE}/${type}/${id}`;
    const rdfFormat = negotiateRdfFormat(req.headers.accept);

    // 프로그램 클라이언트 — 요청한 RDF 포맷으로 직접 응답
    if (rdfFormat) {
      const body = await fusekiDescribe(uri, rdfFormat);
      return res
        .set('Content-Type', `${rdfFormat}; charset=utf-8`)
        .send(body);
    }

    // 브라우저(text/html) 또는 일반 JSON 클라이언트
    // 10장에서 HTML 상세 페이지로 교체될 임시 응답.
    // 지금은 Turtle 표현을 JSON 봉투에 담아 반환한다.
    const turtle = await fusekiDescribe(uri, 'text/turtle');

    if (!turtle.trim()) {
      return res.status(404).json({
        uri,
        type,
        id,
        error: '해당 URI에 트리플이 없습니다.',
      });
    }

    return res.json({
      uri,
      type,
      id,
      _description: '10장에서 HTML 상세 페이지로 교체될 임시 응답',
      turtle,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
