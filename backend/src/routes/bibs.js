const { Router } = require('express');
const { query, param, body, validationResult } = require('express-validator');
const pool = require('../db');

const router = Router();

const ES_HOST = process.env.ES_HOST || 'http://localhost:9200';
const ES_INDEX = 'bib-records';

// 유효성 검사 결과 확인 헬퍼
function validate(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: '입력값이 올바르지 않습니다.', details: errors.array() });
    return false;
  }
  return true;
}

// :id 를 WHERE 절로 바꾼다.
//   공개 식별자는 control_number(KMO202300001)이고 numeric id는 내부 구현 세부사항이다.
//   조회만 control_number를 받고 수정·삭제는 numeric PK만 받으면 식별자 정책이 갈리므로,
//   :id 를 쓰는 모든 핸들러가 이 헬퍼를 공유한다.
function bibIdClause(id, placeholder = '$1') {
  return /^\d+$/.test(id)
    ? `id = ${placeholder}`
    : `control_number = ${placeholder}`;
}

// ES 색인 — 실패해도 PG 트랜잭션에는 영향 없음(검색은 사이드카, PG가 source of truth)
async function indexBibToEs(record) {
  const id = encodeURIComponent(record.control_number);
  try {
    const res = await fetch(`${ES_HOST}/${ES_INDEX}/_doc/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        control_number: record.control_number,
        title: record.title,
        main_entry: record.main_entry,
        publisher: record.publisher,
        pub_year: record.pub_year,
        isbn: record.isbn,
        call_number: record.call_number,
        abstract: record.abstract,
        // 신규 등록 시점에는 저자/주제가 아직 연결되지 않은 상태이므로 빈 배열.
        // 이후 별도 엔드포인트로 추가될 때 재색인 또는 일괄 색인(pg-to-es)으로 갱신.
        authors: [],
        subjects: [],
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`ES 색인 실패 ${record.control_number}: ${res.status} ${text}`);
    }
  } catch (err) {
    console.error(`ES 색인 예외 ${record.control_number}:`, err.message);
  }
}

// -------------------------------------------------------
// GET /api/bibs/search - 제목·저자·ISBN 검색
// (주의: /search 는 /:id 보다 먼저 선언해야 함)
// -------------------------------------------------------
router.get(
  '/search',
  [
    query('q').trim().notEmpty().withMessage('검색어(q)를 입력해 주세요.'),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      const q = `%${req.query.q}%`;
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 20;
      const offset = (page - 1) * limit;

      const countResult = await pool.query(
        `SELECT count(*) FROM bib_records
         WHERE title ILIKE $1 OR main_entry ILIKE $1 OR isbn ILIKE $1`,
        [q],
      );
      const total = parseInt(countResult.rows[0].count, 10);

      const { rows } = await pool.query(
        `SELECT * FROM bib_records
         WHERE title ILIKE $1 OR main_entry ILIKE $1 OR isbn ILIKE $1
         ORDER BY id
         LIMIT $2 OFFSET $3`,
        [q, limit, offset],
      );

      res.json({ total, page, limit, data: rows });
    } catch (err) {
      next(err);
    }
  },
);

// -------------------------------------------------------
// GET /api/bibs - 전체 목록 조회 (페이지네이션)
// -------------------------------------------------------
router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 20;
      const offset = (page - 1) * limit;

      const countResult = await pool.query(
        'SELECT count(*) FROM bib_records WHERE record_status = $1',
        ['active'],
      );
      const total = parseInt(countResult.rows[0].count, 10);

      const { rows } = await pool.query(
        `SELECT * FROM bib_records
         WHERE record_status = $1
         ORDER BY id
         LIMIT $2 OFFSET $3`,
        ['active', limit, offset],
      );

      res.json({ total, page, limit, data: rows });
    } catch (err) {
      next(err);
    }
  },
);

// -------------------------------------------------------
// GET /api/bibs/:id - 특정 레코드 조회 (MARC 필드 + 저자 + 주제 포함)
//   :id는 numeric PK(예: 1) 또는 control_number(예: KMO202300001) 모두 허용.
//   공개 식별자는 control_number이고 numeric id는 내부용이므로 양쪽 모두 받아야
//   프론트엔드(검색 카드 클릭 → control_number로 이동)와 깔끔하게 정합된다.
// -------------------------------------------------------
router.get(
  '/:id',
  async (req, res, next) => {
    try {
      const { id } = req.params;

      const bibResult = await pool.query(
        `SELECT * FROM bib_records WHERE ${bibIdClause(id)}`,
        [id],
      );
      if (bibResult.rows.length === 0) {
        return res.status(404).json({ error: '서지 레코드를 찾을 수 없습니다.' });
      }

      // 관련 테이블 조회는 항상 numeric PK 기준
      const numericId = bibResult.rows[0].id;

      const marcResult = await pool.query(
        'SELECT tag, ind1, ind2, subfield_code, subfield_value, field_order FROM marc_fields WHERE bib_id = $1 ORDER BY field_order',
        [numericId],
      );

      const authorsResult = await pool.query(
        `SELECT a.id, a.name, a.name_type, a.orcid, a.affiliation, ba.role, ba.author_order
         FROM authors a
         JOIN bib_authors ba ON ba.author_id = a.id
         WHERE ba.bib_id = $1
         ORDER BY ba.author_order`,
        [numericId],
      );

      const subjectsResult = await pool.query(
        `SELECT s.id, s.term, s.scheme, s.lang
         FROM subjects s
         JOIN bib_subjects bs ON bs.subject_id = s.id
         WHERE bs.bib_id = $1`,
        [numericId],
      );

      res.json({
        ...bibResult.rows[0],
        marc_fields: marcResult.rows,
        authors: authorsResult.rows,
        subjects: subjectsResult.rows,
      });
    } catch (err) {
      next(err);
    }
  },
);

// -------------------------------------------------------
// POST /api/bibs - 새 레코드 등록
// -------------------------------------------------------
router.post(
  '/',
  [
    body('control_number').trim().notEmpty(),
    body('title').trim().notEmpty(),
  ],
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      const {
        control_number, isbn, call_number, title, statement_of_resp,
        main_entry, publisher, pub_year, extent, abstract,
        ddc_number, electronic_url,
      } = req.body;

      const { rows } = await pool.query(
        `INSERT INTO bib_records
           (control_number, isbn, call_number, title, statement_of_resp,
            main_entry, publisher, pub_year, extent, abstract,
            ddc_number, electronic_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING *`,
        [control_number, isbn, call_number, title, statement_of_resp,
         main_entry, publisher, pub_year, extent, abstract,
         ddc_number, electronic_url],
      );

      await indexBibToEs(rows[0]);
      res.status(201).json(rows[0]);
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: '이미 존재하는 제어번호입니다.' });
      }
      next(err);
    }
  },
);

// -------------------------------------------------------
// PUT /api/bibs/:id - 레코드 수정
//   :id는 GET과 마찬가지로 numeric PK 또는 control_number 모두 허용.
// -------------------------------------------------------
router.put(
  '/:id',
  [
    param('id').trim().notEmpty(),
    body('title').optional().trim().notEmpty(),
  ],
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      const { id } = req.params;
      const fields = [
        'isbn', 'call_number', 'title', 'statement_of_resp',
        'main_entry', 'publisher', 'pub_year', 'extent', 'abstract',
        'ddc_number', 'electronic_url', 'record_status',
      ];

      const setClauses = [];
      const values = [];
      let idx = 1;

      for (const field of fields) {
        if (req.body[field] !== undefined) {
          setClauses.push(`${field} = $${idx}`);
          values.push(req.body[field]);
          idx++;
        }
      }

      if (setClauses.length === 0) {
        return res.status(400).json({ error: '수정할 필드가 없습니다.' });
      }

      values.push(id);
      const { rows } = await pool.query(
        `UPDATE bib_records SET ${setClauses.join(', ')} WHERE ${bibIdClause(id, `$${idx}`)} RETURNING *`,
        values,
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: '서지 레코드를 찾을 수 없습니다.' });
      }

      res.json(rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// -------------------------------------------------------
// DELETE /api/bibs/:id - 레코드 삭제 (논리 삭제)
//   :id는 GET과 마찬가지로 numeric PK 또는 control_number 모두 허용.
// -------------------------------------------------------
router.delete(
  '/:id',
  [param('id').trim().notEmpty()],
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      const { id } = req.params;
      const { rows } = await pool.query(
        `UPDATE bib_records SET record_status = 'deleted' WHERE ${bibIdClause(id)} RETURNING id`,
        [id],
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: '서지 레코드를 찾을 수 없습니다.' });
      }

      res.json({ message: '서지 레코드가 삭제되었습니다.', id: rows[0].id });
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
