const { Router } = require('express');
const { query, param, body, validationResult } = require('express-validator');
const pool = require('../db');

const router = Router();

// 유효성 검사 헬퍼
function validate(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: '입력값이 올바르지 않습니다.', details: errors.array() });
    return false;
  }
  return true;
}

const RESOURCE_TYPES = ['journal', 'ebook', 'database'];
const RESOURCE_STATUSES = ['active', 'trial', 'cancelled'];

// 월 마지막 일 계산 (YYYY-MM-DD 포맷)
function monthEnd(year, month) {
  const d = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function monthStart(year, month) {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

// -------------------------------------------------------
// GET /api/v1/e-resources/stats/cost-per-use?year=YYYY
// (주의: /stats/...와 /sushi/... 는 /:id 보다 먼저 선언)
// -------------------------------------------------------
router.get(
  '/stats/cost-per-use',
  [query('year').isInt({ min: 1900, max: 2100 })],
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      const year = parseInt(req.query.year, 10);

      const { rows } = await pool.query(
        `SELECT er.id, er.title, er.resource_type, er.provider,
                COALESCE(SUM(us.total_item_requests), 0)::int   AS total_item_requests,
                COALESCE(SUM(us.unique_title_requests), 0)::int AS unique_title_requests,
                lic.annual_cost, lic.currency
         FROM e_resources er
         LEFT JOIN usage_stats us
                ON us.e_resource_id = er.id
               AND us.report_type   = 'TR'
               AND us.period_year   = $1
         LEFT JOIN LATERAL (
           SELECT annual_cost, currency
           FROM licenses
           WHERE e_resource_id = er.id
             AND (start_date IS NULL OR start_date <= make_date($1, 12, 31))
             AND (end_date   IS NULL OR end_date   >= make_date($1,  1,  1))
           ORDER BY start_date NULLS LAST
           LIMIT 1
         ) lic ON TRUE
         GROUP BY er.id, er.title, er.resource_type, er.provider,
                  lic.annual_cost, lic.currency
         ORDER BY er.id`,
        [year],
      );

      const data = rows.map((r) => {
        const annual = r.annual_cost != null ? Number(r.annual_cost) : null;
        const cpu =
          annual != null && r.total_item_requests > 0
            ? Number((annual / r.total_item_requests).toFixed(2))
            : null;
        return { ...r, annual_cost: annual, cost_per_use: cpu };
      });

      res.json({ year, data });
    } catch (err) {
      next(err);
    }
  },
);

// -------------------------------------------------------
// GET /api/v1/e-resources/sushi/harvest?e_resource_id=&begin_date=YYYY-MM&end_date=YYYY-MM
// COUNTER R5 Title Master Report(TR) JSON 모의 응답
// -------------------------------------------------------
router.get(
  '/sushi/harvest',
  [
    query('e_resource_id').optional().isInt({ min: 1 }),
    query('begin_date').matches(/^\d{4}-\d{2}$/)
      .withMessage('begin_date는 YYYY-MM 형식이어야 합니다.'),
    query('end_date').matches(/^\d{4}-\d{2}$/)
      .withMessage('end_date는 YYYY-MM 형식이어야 합니다.'),
  ],
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      const [by, bm] = req.query.begin_date.split('-').map(Number);
      const [ey, em] = req.query.end_date.split('-').map(Number);

      if (by > ey || (by === ey && bm > em)) {
        return res.status(400).json({ error: 'begin_date가 end_date보다 이후입니다.' });
      }

      const params = [by, bm, ey, em];
      let resourceFilter = '';
      if (req.query.e_resource_id) {
        params.push(parseInt(req.query.e_resource_id, 10));
        resourceFilter = ` AND er.id = $${params.length}`;
      }

      const { rows } = await pool.query(
        `SELECT er.id, er.title, er.provider, er.resource_type,
                er.issn, er.isbn, er.platform_url,
                us.period_year, us.period_month,
                us.total_item_requests, us.unique_title_requests
         FROM e_resources er
         LEFT JOIN usage_stats us
                ON us.e_resource_id = er.id
               AND us.report_type   = 'TR'
               AND ( us.period_year >  $1
                  OR (us.period_year = $1 AND us.period_month >= $2) )
               AND ( us.period_year <  $3
                  OR (us.period_year = $3 AND us.period_month <= $4) )
         WHERE 1=1${resourceFilter}
         ORDER BY er.id, us.period_year, us.period_month`,
        params,
      );

      const byResource = new Map();
      for (const r of rows) {
        if (!byResource.has(r.id)) {
          const itemIds = [];
          if (r.issn) itemIds.push({ Type: 'Online_ISSN', Value: r.issn });
          if (r.isbn) itemIds.push({ Type: 'Online_ISBN', Value: r.isbn });
          itemIds.push({ Type: 'Proprietary', Value: `DL:eres:${r.id}` });

          byResource.set(r.id, {
            Title: r.title,
            Item_ID: itemIds,
            Platform: r.provider || 'Unknown',
            Publisher: r.provider || 'Unknown',
            Data_Type: r.resource_type === 'journal' ? 'Journal'
                     : r.resource_type === 'ebook'   ? 'Book' : 'Database',
            Performance: [],
          });
        }
        if (r.period_year != null) {
          byResource.get(r.id).Performance.push({
            Period: {
              Begin_Date: monthStart(r.period_year, r.period_month),
              End_Date:   monthEnd(r.period_year,   r.period_month),
            },
            Instance: [
              { Metric_Type: 'Total_Item_Requests',   Count: r.total_item_requests },
              { Metric_Type: 'Unique_Title_Requests', Count: r.unique_title_requests },
            ],
          });
        }
      }

      const filters = [
        { Name: 'Begin_Date', Value: monthStart(by, bm) },
        { Name: 'End_Date',   Value: monthEnd(ey, em) },
      ];
      if (req.query.e_resource_id) {
        filters.push({ Name: 'E_Resource_ID', Value: String(req.query.e_resource_id) });
      }

      res.json({
        Report_Header: {
          Created: new Date().toISOString(),
          Created_By: 'Digital Library Mock SUSHI',
          Customer_ID: 'local',
          Report_ID: 'TR',
          Release: '5',
          Report_Name: 'Title Master Report',
          Institution_Name: 'Digital Library',
          Report_Filters: filters,
        },
        Report_Items: Array.from(byResource.values()),
      });
    } catch (err) {
      next(err);
    }
  },
);

// -------------------------------------------------------
// GET /api/v1/e-resources  - 목록 (filter: type, status)
// -------------------------------------------------------
router.get(
  '/',
  [
    query('type').optional().isIn(RESOURCE_TYPES),
    query('status').optional().isIn(RESOURCE_STATUSES),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 20;
      const offset = (page - 1) * limit;

      const clauses = [];
      const params = [];
      if (req.query.type) {
        params.push(req.query.type);
        clauses.push(`resource_type = $${params.length}`);
      }
      if (req.query.status) {
        params.push(req.query.status);
        clauses.push(`status = $${params.length}`);
      }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

      const countResult = await pool.query(
        `SELECT count(*) FROM e_resources ${where}`,
        params,
      );
      const total = parseInt(countResult.rows[0].count, 10);

      const dataParams = [...params, limit, offset];
      const { rows } = await pool.query(
        `SELECT * FROM e_resources ${where}
         ORDER BY id
         LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
        dataParams,
      );

      res.json({ total, page, limit, data: rows });
    } catch (err) {
      next(err);
    }
  },
);

// -------------------------------------------------------
// GET /api/v1/e-resources/:id/stats  - 특정 자원의 이용통계
// -------------------------------------------------------
router.get(
  '/:id/stats',
  [
    param('id').isInt(),
    query('year').optional().isInt({ min: 1900, max: 2100 }),
    query('report_type').optional().isIn(['TR', 'PR', 'DR', 'IR']),
  ],
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      const { id } = req.params;

      const eres = await pool.query('SELECT id, title FROM e_resources WHERE id = $1', [id]);
      if (eres.rows.length === 0) {
        return res.status(404).json({ error: '전자자원을 찾을 수 없습니다.' });
      }

      const params = [id];
      const extra = [];
      if (req.query.year) {
        params.push(parseInt(req.query.year, 10));
        extra.push(`period_year = $${params.length}`);
      }
      if (req.query.report_type) {
        params.push(req.query.report_type);
        extra.push(`report_type = $${params.length}`);
      }
      const extraWhere = extra.length ? ` AND ${extra.join(' AND ')}` : '';

      const { rows } = await pool.query(
        `SELECT id, report_type, period_year, period_month,
                total_item_requests, unique_title_requests, collected_at
         FROM usage_stats
         WHERE e_resource_id = $1${extraWhere}
         ORDER BY period_year, period_month, report_type`,
        params,
      );

      const summary = rows.reduce(
        (acc, r) => ({
          total_item_requests:   acc.total_item_requests   + r.total_item_requests,
          unique_title_requests: acc.unique_title_requests + r.unique_title_requests,
        }),
        { total_item_requests: 0, unique_title_requests: 0 },
      );

      res.json({
        e_resource: eres.rows[0],
        summary,
        data: rows,
      });
    } catch (err) {
      next(err);
    }
  },
);

// -------------------------------------------------------
// GET /api/v1/e-resources/:id  - 상세 (라이선스 포함)
// -------------------------------------------------------
router.get(
  '/:id',
  [param('id').isInt()],
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      const { id } = req.params;

      const eres = await pool.query('SELECT * FROM e_resources WHERE id = $1', [id]);
      if (eres.rows.length === 0) {
        return res.status(404).json({ error: '전자자원을 찾을 수 없습니다.' });
      }

      const lic = await pool.query(
        `SELECT * FROM licenses
         WHERE e_resource_id = $1
         ORDER BY start_date DESC NULLS LAST, id DESC`,
        [id],
      );

      res.json({ ...eres.rows[0], licenses: lic.rows });
    } catch (err) {
      next(err);
    }
  },
);

// -------------------------------------------------------
// POST /api/v1/e-resources  - 등록
// -------------------------------------------------------
router.post(
  '/',
  [
    body('title').trim().notEmpty(),
    body('resource_type').isIn(RESOURCE_TYPES),
    body('status').optional().isIn(RESOURCE_STATUSES),
    body('issn').optional({ nullable: true }).isString().isLength({ max: 20 }),
    body('isbn').optional({ nullable: true }).isString().isLength({ max: 20 }),
    body('platform_url').optional({ nullable: true }).isString(),
  ],
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      const {
        title, resource_type, provider, platform_url,
        issn, isbn, subject, status,
      } = req.body;

      const { rows } = await pool.query(
        `INSERT INTO e_resources
           (title, resource_type, provider, platform_url,
            issn, isbn, subject, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7, COALESCE($8, 'active'))
         RETURNING *`,
        [title, resource_type, provider, platform_url,
         issn, isbn, subject, status],
      );

      res.status(201).json(rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// -------------------------------------------------------
// PUT /api/v1/e-resources/:id  - 부분 수정
// -------------------------------------------------------
router.put(
  '/:id',
  [
    param('id').isInt(),
    body('title').optional().trim().notEmpty(),
    body('resource_type').optional().isIn(RESOURCE_TYPES),
    body('status').optional().isIn(RESOURCE_STATUSES),
  ],
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      const { id } = req.params;
      const fields = [
        'title', 'resource_type', 'provider', 'platform_url',
        'issn', 'isbn', 'subject', 'status',
      ];

      const setClauses = [];
      const values = [];
      let idx = 1;
      for (const f of fields) {
        if (req.body[f] !== undefined) {
          setClauses.push(`${f} = $${idx}`);
          values.push(req.body[f]);
          idx++;
        }
      }
      if (setClauses.length === 0) {
        return res.status(400).json({ error: '수정할 필드가 없습니다.' });
      }

      values.push(id);
      const { rows } = await pool.query(
        `UPDATE e_resources SET ${setClauses.join(', ')}
         WHERE id = $${idx}
         RETURNING *`,
        values,
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: '전자자원을 찾을 수 없습니다.' });
      }

      res.json(rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
