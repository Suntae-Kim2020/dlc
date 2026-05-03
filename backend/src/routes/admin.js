const { Router } = require('express');

const router = Router();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.env.RAG_PASSWORD;

// POST /api/v1/admin/unlock  — 활성 모드 전환을 위한 비밀번호 검증
router.post('/unlock', (req, res) => {
  if (!ADMIN_PASSWORD) {
    return res.status(503).json({
      error: '관리자 비밀번호가 서버에 설정되어 있지 않습니다.',
    });
  }
  const provided = req.body?.password;
  if (!provided) {
    return res.status(400).json({ error: '비밀번호를 입력하세요.' });
  }
  if (provided !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: '비밀번호가 올바르지 않습니다.' });
  }
  // 학습용 단순 토큰 — 비밀번호 자체를 토큰으로 사용
  // (운영 환경에선 JWT 등 시간 제한 토큰 권장)
  res.json({
    token: ADMIN_PASSWORD,
    message: '활성 모드로 전환되었습니다.',
  });
});

// POST /api/v1/admin/verify  — 토큰 유효성 확인 (선택)
router.post('/verify', (req, res) => {
  const token = req.get('X-Admin-Token') || req.body?.token;
  if (!ADMIN_PASSWORD) return res.status(503).json({ valid: false });
  res.json({ valid: token === ADMIN_PASSWORD });
});

module.exports = router;
