const { Router } = require('express');
const { param, body, query, validationResult } = require('express-validator');
const pool = require('../db');

const router = Router();

function validate(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: '입력값이 올바르지 않습니다.', details: errors.array() });
    return false;
  }
  return true;
}

// -------------------------------------------------------
// GET /api/acquisitions - 수서 목록 (상태별 필터, 페이지네이션)
// -------------------------------------------------------
router.get(
  '/',
  [
    query('status').optional().isIn(['ordered', 'received', 'cataloged']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 20;
      const offset = (page - 1) * limit;

      let whereClause = '';
      const params = [];

      if (req.query.status) {
        params.push(req.query.status);
        whereClause = `WHERE status = $${params.length}`;
      }

      const countResult = await pool.query(
        `SELECT count(*) FROM acquisitions ${whereClause}`,
        params,
      );
      const total = parseInt(countResult.rows[0].count, 10);

      params.push(limit, offset);
      const { rows } = await pool.query(
        `SELECT * FROM acquisitions ${whereClause}
         ORDER BY order_date DESC NULLS LAST
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );

      res.json({ total, page, limit, data: rows });
    } catch (err) {
      next(err);
    }
  },
);

// -------------------------------------------------------
// POST /api/acquisitions - 구입 신청 등록
// -------------------------------------------------------
router.post(
  '/',
  [
    body('title').trim().notEmpty().withMessage('도서명은 필수입니다.'),
    body('quantity').optional().isInt({ min: 1 }),
    body('unit_price').optional().isFloat({ min: 0 }),
  ],
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      const {
        title, author, isbn, publisher,
        quantity, unit_price, order_date, fund_code,
      } = req.body;

      const { rows } = await pool.query(
        `INSERT INTO acquisitions
           (title, author, isbn, publisher, quantity, unit_price, order_date, fund_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [title, author, isbn, publisher, quantity || 1, unit_price, order_date, fund_code],
      );

      res.status(201).json(rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// -------------------------------------------------------
// PUT /api/acquisitions/:id/receive - 수령 처리
// -------------------------------------------------------
router.put(
  '/:id/receive',
  [param('id').isInt()],
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      const { rows } = await pool.query(
        `UPDATE acquisitions
         SET status = 'received', receive_date = CURRENT_DATE
         WHERE id = $1 AND status = 'ordered'
         RETURNING *`,
        [req.params.id],
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: '수령 처리할 주문을 찾을 수 없습니다.' });
      }

      res.json(rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
