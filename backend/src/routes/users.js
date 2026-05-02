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
