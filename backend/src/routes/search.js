const { Router } = require('express');
const { query, validationResult } = require('express-validator');

const router = Router();

const ES_HOST = process.env.ES_HOST || 'http://localhost:9200';
const ES_INDEX = 'bib-records';

function validate(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      error: '입력값이 올바르지 않습니다.',
      details: errors.array(),
    });
    return false;
  }
  return true;
}

async function esSearch(body) {
  const res = await fetch(`${ES_HOST}/${ES_INDEX}/_search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(
      `ES 검색 실패: ${res.status} ${json.error?.reason || ''}`,
    );
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

// -------------------------------------------------------
// GET /api/v1/search?q=&field=all|title|author|subject|isbn&from=&size=
// -------------------------------------------------------
router.get(
  '/',
  [
    query('q').trim().notEmpty().withMessage('검색어(q)를 입력해 주세요.'),
    query('field')
      .optional()
      .isIn(['all', 'title', 'author', 'subject', 'isbn']),
    query('from').optional().isInt({ min: 0 }),
    query('size').optional().isInt({ min: 1, max: 100 }),
  ],
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      const q = req.query.q;
      const field = req.query.field || 'all';
      const from = parseInt(req.query.from, 10) || 0;
      const size = parseInt(req.query.size, 10) || 10;

      let queryClause;
      switch (field) {
        case 'title':
          queryClause = { match: { title: q } };
          break;
        case 'author':
          queryClause = {
            multi_match: {
              query: q,
              fields: ['main_entry^2', 'authors^2'],
              type: 'best_fields',
            },
          };
          break;
        case 'subject':
          queryClause = { match: { subjects: q } };
          break;
        case 'isbn':
          queryClause = { term: { isbn: q } };
          break;
        case 'all':
        default:
          // 가중치: title 3, main_entry/authors 2, subjects 2, abstract 1
          queryClause = {
            multi_match: {
              query: q,
              fields: [
                'title^3',
                'main_entry^2',
                'authors^2',
                'subjects^2',
                'abstract^1',
              ],
              type: 'best_fields',
            },
          };
      }

      const result = await esSearch({
        from,
        size,
        query: queryClause,
        highlight: {
          pre_tags: ['<em>'],
          post_tags: ['</em>'],
          fields: {
            title: {},
            main_entry: {},
            authors: {},
            subjects: {},
            abstract: {},
          },
        },
      });

      res.json({
        total: result.hits.total.value,
        took_ms: result.took,
        from,
        size,
        hits: result.hits.hits.map((h) => ({
          id: h._id,
          score: h._score,
          source: h._source,
          highlight: h.highlight || {},
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

// -------------------------------------------------------
// GET /api/v1/search/suggest?q=  - 제목 prefix 자동완성 (최대 5개)
// -------------------------------------------------------
router.get(
  '/suggest',
  [query('q').trim().notEmpty()],
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      const q = req.query.q;

      const result = await esSearch({
        size: 5,
        _source: ['title'],
        query: {
          match_phrase_prefix: {
            title: { query: q, max_expansions: 20 },
          },
        },
      });

      const suggestions = result.hits.hits
        .map((h) => h._source?.title)
        .filter(Boolean);

      res.json({ q, suggestions });
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
