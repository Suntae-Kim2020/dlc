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
// POST /api/loans - 대출 처리
// -------------------------------------------------------
router.post(
  '/',
  [
    body('item_id').isInt(),
    body('user_id').isInt(),
    body('due_date').isISO8601(),
  ],
  async (req, res, next) => {
    if (!validate(req, res)) return;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { item_id, user_id, due_date } = req.body;

      // 소장 항목 상태 확인
      const itemResult = await client.query(
        'SELECT item_status FROM items WHERE id = $1 FOR UPDATE',
        [item_id],
      );
      if (itemResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: '소장 항목을 찾을 수 없습니다.' });
      }
      if (itemResult.rows[0].item_status !== 'available') {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: '현재 대출할 수 없는 자료입니다.' });
      }

      // 이용자 상태 확인
      const userResult = await client.query(
        'SELECT status FROM users WHERE id = $1',
        [user_id],
      );
      if (userResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: '이용자를 찾을 수 없습니다.' });
      }
      if (userResult.rows[0].status !== 'active') {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: '이용이 정지된 이용자입니다.' });
      }

      // 대출 레코드 생성
      const loanResult = await client.query(
        `INSERT INTO loans (item_id, user_id, due_date, status)
         VALUES ($1, $2, $3, 'active') RETURNING *`,
        [item_id, user_id, due_date],
      );

      // 소장 항목 상태 변경
      await client.query(
        "UPDATE items SET item_status = 'on_loan' WHERE id = $1",
        [item_id],
      );

      await client.query('COMMIT');
      res.status(201).json(loanResult.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      next(err);
    } finally {
      client.release();
    }
  },
);

// -------------------------------------------------------
// PUT /api/loans/:id/return - 반납 처리
// -------------------------------------------------------
router.put(
  '/:id/return',
  [param('id').isInt()],
  async (req, res, next) => {
    if (!validate(req, res)) return;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const loanResult = await client.query(
        "SELECT * FROM loans WHERE id = $1 AND status = 'active' FOR UPDATE",
        [req.params.id],
      );
      if (loanResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: '해당 대출 건을 찾을 수 없습니다.' });
      }

      const loan = loanResult.rows[0];

      // 대출 레코드 업데이트
      const updatedLoan = await client.query(
        `UPDATE loans
         SET return_date = CURRENT_DATE, status = 'returned'
         WHERE id = $1 RETURNING *`,
        [req.params.id],
      );

      // 소장 항목 상태 복원
      await client.query(
        "UPDATE items SET item_status = 'available' WHERE id = $1",
        [loan.item_id],
      );

      await client.query('COMMIT');
      res.json(updatedLoan.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      next(err);
    } finally {
      client.release();
    }
  },
);

// -------------------------------------------------------
// GET /api/loans/overdue - 연체 목록
// -------------------------------------------------------
router.get('/overdue', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT l.*, u.name AS user_name, u.user_number,
              b.title AS book_title, i.barcode
       FROM loans l
       JOIN users u ON u.id = l.user_id
       JOIN items i ON i.id = l.item_id
       JOIN bib_records b ON b.id = i.bib_id
       WHERE l.status = 'active' AND l.due_date < CURRENT_DATE
       ORDER BY l.due_date`,
    );
    res.json({ total: rows.length, data: rows });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------
// GET /api/loans/user/:user_id - 이용자별 대출 현황
// -------------------------------------------------------
router.get(
  '/user/:user_id',
  [param('user_id').isInt()],
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      const { rows } = await pool.query(
        `SELECT l.*, b.title AS book_title, i.barcode, i.location
         FROM loans l
         JOIN items i ON i.id = l.item_id
         JOIN bib_records b ON b.id = i.bib_id
         WHERE l.user_id = $1
         ORDER BY l.loan_date DESC`,
        [req.params.user_id],
      );
      res.json({ total: rows.length, data: rows });
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
