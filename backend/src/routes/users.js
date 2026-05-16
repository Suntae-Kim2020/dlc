const { Router } = require('express');
const { param, body, validationResult } = require('express-validator');
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
// GET /api/users - 이용자 목록 (페이징 + 키워드 검색)
//   ?page=1&limit=20&q=홍길동&user_type=student&status=active
// -------------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 20);
    const offset = (page - 1) * limit;
    const q = (req.query.q || '').trim();
    const userType = req.query.user_type;
    const status = req.query.status;

    const where = [];
    const params = [];
    if (q) {
      params.push(`%${q}%`);
      where.push(
        `(name ILIKE $${params.length} OR user_number ILIKE $${params.length} OR email ILIKE $${params.length})`,
      );
    }
    if (userType) {
      params.push(userType);
      where.push(`user_type = $${params.length}`);
    }
    if (status) {
      params.push(status);
      where.push(`status = $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const totalRes = await pool.query(
      `SELECT COUNT(*)::int AS n FROM users ${whereSql}`,
      params,
    );
    const total = totalRes.rows[0].n;

    params.push(limit, offset);
    const rowsRes = await pool.query(
      `SELECT id, user_number, name, email, phone, affiliation,
              user_type, status, join_date, created_at
         FROM users ${whereSql}
        ORDER BY id DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    res.json({ total, page, limit, data: rowsRes.rows });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------
// GET /api/users/:id - 이용자 정보 조회 (대출 현황 포함)
// -------------------------------------------------------
router.get(
  '/:id',
  [param('id').isInt()],
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      const userResult = await pool.query(
        'SELECT * FROM users WHERE id = $1',
        [req.params.id],
      );
      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: '이용자를 찾을 수 없습니다.' });
      }

      const loansResult = await pool.query(
        `SELECT l.id, l.loan_date, l.due_date, l.return_date, l.status,
                b.title AS book_title, i.barcode
         FROM loans l
         JOIN items i ON i.id = l.item_id
         JOIN bib_records b ON b.id = i.bib_id
         WHERE l.user_id = $1 AND l.status = 'active'
         ORDER BY l.due_date`,
        [req.params.id],
      );

      res.json({
        ...userResult.rows[0],
        active_loans: loansResult.rows,
      });
    } catch (err) {
      next(err);
    }
  },
);

// -------------------------------------------------------
// POST /api/users - 이용자 등록
// -------------------------------------------------------
router.post(
  '/',
  [
    body('user_number').trim().notEmpty().withMessage('학번/교번은 필수입니다.'),
    body('name').trim().notEmpty().withMessage('이름은 필수입니다.'),
    body('email').optional().isEmail().withMessage('올바른 이메일 형식이 아닙니다.'),
    body('user_type').isIn(['student', 'faculty', 'staff']).withMessage('유효한 이용자 유형이 아닙니다.'),
  ],
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      const { user_number, name, email, phone, affiliation, user_type } = req.body;

      const { rows } = await pool.query(
        `INSERT INTO users (user_number, name, email, phone, affiliation, user_type)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [user_number, name, email, phone, affiliation, user_type],
      );

      res.status(201).json(rows[0]);
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: '이미 등록된 학번/교번 또는 이메일입니다.' });
      }
      next(err);
    }
  },
);

module.exports = router;
