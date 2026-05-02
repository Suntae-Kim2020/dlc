const { Router } = require('express');
const pool = require('../db');

const router = Router();

// ===== 저장소 메타 =====
const REPO_NAME = 'AI Library Digital Repository';
const REPO_BASE_URL = 'http://localhost:4000/oai';
const ADMIN_EMAIL = 'admin@ailibrary.kr';
const PROTOCOL_VERSION = '2.0';
const GRANULARITY = 'YYYY-MM-DD';
const DELETED_RECORD = 'no';
const ID_PREFIX = 'oai:ailibrary.kr:';
const SUPPORTED_PREFIX = 'oai_dc';
const PAGE_SIZE = 100;

// 각 verb가 허용하는 인수 (verb 자체 제외)
const ALLOWED_ARGS = {
  Identify: [],
  ListMetadataFormats: ['identifier'],
  ListRecords: ['from', 'until', 'metadataPrefix', 'set', 'resumptionToken'],
  ListIdentifiers: ['from', 'until', 'metadataPrefix', 'set', 'resumptionToken'],
  GetRecord: ['identifier', 'metadataPrefix'],
};

// ===== 유틸 =====
function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function utcNowSeconds() {
  // 2026-05-01T12:34:56Z (밀리초 제거)
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function formatDate(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function isValidDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return !Number.isNaN(new Date(s).getTime());
}

function controlNumberFromIdentifier(id) {
  if (!id || !id.startsWith(ID_PREFIX)) return null;
  return id.slice(ID_PREFIX.length);
}

function identifierFromControlNumber(cn) {
  return ID_PREFIX + cn;
}

// resumptionToken: base64url(JSON {from, until, offset})
function encodeToken(state) {
  return Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');
}

function decodeToken(token) {
  try {
    const json = Buffer.from(token, 'base64url').toString('utf8');
    const state = JSON.parse(json);
    if (typeof state.offset !== 'number' || state.offset < 0) return null;
    return state;
  } catch {
    return null;
  }
}

// ===== 응답 빌더 =====
function buildEnvelope({ requestParams, body, error }) {
  const responseDate = utcNowSeconds();

  // badVerb / badArgument 의 경우 attribute 없이 baseURL만 echo
  let requestEl;
  if (error && (error.code === 'badVerb' || error.code === 'badArgument')) {
    requestEl = `<request>${escapeXml(REPO_BASE_URL)}</request>`;
  } else {
    const attrs = Object.entries(requestParams || {})
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${escapeXml(k)}="${escapeXml(v)}"`)
      .join(' ');
    requestEl = `<request${attrs ? ' ' + attrs : ''}>${escapeXml(REPO_BASE_URL)}</request>`;
  }

  const inner = error
    ? `<error code="${escapeXml(error.code)}">${escapeXml(error.message || '')}</error>`
    : body;

  return `<?xml version="1.0" encoding="UTF-8"?>
<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://www.openarchives.org/OAI/2.0/ http://www.openarchives.org/OAI/2.0/OAI-PMH.xsd">
  <responseDate>${responseDate}</responseDate>
  ${requestEl}
  ${inner}
</OAI-PMH>
`;
}

function sendXml(res, xml) {
  // OAI-PMH의 프로토콜 오류는 HTTP 200으로 반환 (HTTP 오류는 인프라 오류용)
  res.status(200).set('Content-Type', 'text/xml; charset=utf-8').send(xml);
}

function sendError(res, code, message, requestParams = {}) {
  sendXml(res, buildEnvelope({ requestParams, error: { code, message } }));
}

// ===== 인수 검증 =====
function validateArgKeys(verb, params) {
  const allowed = new Set([...(ALLOWED_ARGS[verb] || []), 'verb']);
  for (const k of Object.keys(params)) {
    if (!allowed.has(k)) {
      return { code: 'badArgument', message: `허용되지 않는 인수: ${k}` };
    }
  }
  return null;
}

// 리스트 verb 공통 인수 처리 (resumptionToken 우선)
function resolveListArgs(params) {
  if (params.resumptionToken !== undefined) {
    const otherArgs = Object.keys(params).filter(
      (k) => k !== 'verb' && k !== 'resumptionToken',
    );
    if (otherArgs.length > 0) {
      return {
        error: {
          code: 'badArgument',
          message: 'resumptionToken은 다른 인수와 함께 쓸 수 없음',
        },
      };
    }
    const state = decodeToken(params.resumptionToken);
    if (!state) {
      return {
        error: { code: 'badResumptionToken', message: '토큰이 유효하지 않거나 만료됨' },
      };
    }
    return { from: state.from || null, until: state.until || null, offset: state.offset };
  }

  if (!params.metadataPrefix) {
    return { error: { code: 'badArgument', message: 'metadataPrefix 인수가 필요함' } };
  }
  if (params.metadataPrefix !== SUPPORTED_PREFIX) {
    return {
      error: {
        code: 'cannotDisseminateFormat',
        message: `지원하지 않는 metadataPrefix: ${params.metadataPrefix}`,
      },
    };
  }
  if (params.set !== undefined) {
    return { error: { code: 'noSetHierarchy', message: 'set은 지원하지 않음' } };
  }
  if (params.from !== undefined && !isValidDate(params.from)) {
    return { error: { code: 'badArgument', message: 'from 형식 오류 (YYYY-MM-DD)' } };
  }
  if (params.until !== undefined && !isValidDate(params.until)) {
    return { error: { code: 'badArgument', message: 'until 형식 오류 (YYYY-MM-DD)' } };
  }

  return {
    from: params.from || null,
    until: params.until || null,
    offset: 0,
  };
}

// ===== DB 조회 =====
async function fetchBibPage(from, until, offset) {
  const conditions = [`record_status = 'active'`];
  const args = [];
  if (from) {
    args.push(from);
    conditions.push(`DATE(created_at) >= $${args.length}`);
  }
  if (until) {
    args.push(until);
    conditions.push(`DATE(created_at) <= $${args.length}`);
  }
  const whereClause = conditions.join(' AND ');

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM bib_records WHERE ${whereClause}`,
    args,
  );
  const totalCount = countResult.rows[0].cnt;

  const dataArgs = [...args, PAGE_SIZE, offset];
  const dataResult = await pool.query(
    `SELECT control_number, title, main_entry, isbn, pub_year, publisher,
            abstract, call_number, created_at
       FROM bib_records WHERE ${whereClause}
       ORDER BY id
       LIMIT $${dataArgs.length - 1} OFFSET $${dataArgs.length}`,
    dataArgs,
  );

  return { totalCount, rows: dataResult.rows };
}

// ===== XML 조각 빌더 =====
function buildHeader(row) {
  return `<header>
        <identifier>${escapeXml(identifierFromControlNumber(row.control_number))}</identifier>
        <datestamp>${formatDate(row.created_at)}</datestamp>
      </header>`;
}

function buildDcMetadata(row) {
  const lines = [
    '      <metadata>',
    '        <oai_dc:dc xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/" ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/" ' +
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
      'xsi:schemaLocation="http://www.openarchives.org/OAI/2.0/oai_dc/ ' +
      'http://www.openarchives.org/OAI/2.0/oai_dc.xsd">',
  ];
  if (row.title)
    lines.push(`          <dc:title>${escapeXml(row.title)}</dc:title>`);
  if (row.main_entry)
    lines.push(`          <dc:creator>${escapeXml(row.main_entry)}</dc:creator>`);
  if (row.isbn)
    lines.push(`          <dc:identifier>${escapeXml(row.isbn)}</dc:identifier>`);
  if (row.pub_year != null)
    lines.push(`          <dc:date>${escapeXml(row.pub_year)}</dc:date>`);
  if (row.publisher)
    lines.push(`          <dc:publisher>${escapeXml(row.publisher)}</dc:publisher>`);
  if (row.abstract)
    lines.push(`          <dc:description>${escapeXml(row.abstract)}</dc:description>`);
  if (row.call_number)
    lines.push(`          <dc:subject>${escapeXml(row.call_number)}</dc:subject>`);
  lines.push('        </oai_dc:dc>');
  lines.push('      </metadata>');
  return lines.join('\n');
}

function buildResumptionTokenXml(state, totalCount) {
  const cursor = state.offset;
  const nextOffset = state.offset + PAGE_SIZE;
  if (nextOffset >= totalCount) {
    // 마지막 페이지 신호 — 빈 토큰
    return `<resumptionToken cursor="${cursor}" completeListSize="${totalCount}"></resumptionToken>`;
  }
  const token = encodeToken({
    from: state.from,
    until: state.until,
    offset: nextOffset,
  });
  return `<resumptionToken cursor="${cursor}" completeListSize="${totalCount}">${escapeXml(token)}</resumptionToken>`;
}

// ===== Verb 핸들러 =====
async function handleIdentify(res, params) {
  const err = validateArgKeys('Identify', params);
  if (err) return sendError(res, err.code, err.message, params);

  const result = await pool.query(
    `SELECT MIN(created_at) AS earliest FROM bib_records WHERE record_status = 'active'`,
  );
  const earliest = result.rows[0].earliest;
  const earliestDatestamp = earliest ? formatDate(earliest) : '1970-01-01';

  const body = `<Identify>
    <repositoryName>${escapeXml(REPO_NAME)}</repositoryName>
    <baseURL>${escapeXml(REPO_BASE_URL)}</baseURL>
    <protocolVersion>${PROTOCOL_VERSION}</protocolVersion>
    <adminEmail>${escapeXml(ADMIN_EMAIL)}</adminEmail>
    <earliestDatestamp>${earliestDatestamp}</earliestDatestamp>
    <deletedRecord>${DELETED_RECORD}</deletedRecord>
    <granularity>${GRANULARITY}</granularity>
  </Identify>`;

  sendXml(res, buildEnvelope({ requestParams: params, body }));
}

async function handleListMetadataFormats(res, params) {
  const err = validateArgKeys('ListMetadataFormats', params);
  if (err) return sendError(res, err.code, err.message, params);

  if (params.identifier !== undefined) {
    const cn = controlNumberFromIdentifier(params.identifier);
    if (!cn) {
      return sendError(res, 'idDoesNotExist', '식별자 형식 오류', params);
    }
    const r = await pool.query(
      `SELECT id FROM bib_records WHERE control_number = $1 AND record_status = 'active'`,
      [cn],
    );
    if (r.rows.length === 0) {
      return sendError(res, 'idDoesNotExist', '식별자에 해당하는 레코드 없음', params);
    }
  }

  const body = `<ListMetadataFormats>
    <metadataFormat>
      <metadataPrefix>oai_dc</metadataPrefix>
      <schema>http://www.openarchives.org/OAI/2.0/oai_dc.xsd</schema>
      <metadataNamespace>http://www.openarchives.org/OAI/2.0/oai_dc/</metadataNamespace>
    </metadataFormat>
  </ListMetadataFormats>`;

  sendXml(res, buildEnvelope({ requestParams: params, body }));
}

async function handleListRecords(res, params) {
  const err = validateArgKeys('ListRecords', params);
  if (err) return sendError(res, err.code, err.message, params);

  const args = resolveListArgs(params);
  if (args.error) return sendError(res, args.error.code, args.error.message, params);

  const { rows, totalCount } = await fetchBibPage(args.from, args.until, args.offset);
  if (rows.length === 0) {
    return sendError(res, 'noRecordsMatch', '조건에 맞는 레코드 없음', params);
  }

  const recordXmls = rows
    .map(
      (row) => `    <record>
      ${buildHeader(row)}
${buildDcMetadata(row)}
    </record>`,
    )
    .join('\n');

  let tokenXml = '';
  if (totalCount > PAGE_SIZE) {
    tokenXml = '\n    ' + buildResumptionTokenXml(args, totalCount);
  }

  const body = `<ListRecords>
${recordXmls}${tokenXml}
  </ListRecords>`;

  sendXml(res, buildEnvelope({ requestParams: params, body }));
}

async function handleListIdentifiers(res, params) {
  const err = validateArgKeys('ListIdentifiers', params);
  if (err) return sendError(res, err.code, err.message, params);

  const args = resolveListArgs(params);
  if (args.error) return sendError(res, args.error.code, args.error.message, params);

  const { rows, totalCount } = await fetchBibPage(args.from, args.until, args.offset);
  if (rows.length === 0) {
    return sendError(res, 'noRecordsMatch', '조건에 맞는 레코드 없음', params);
  }

  const headerXmls = rows.map((row) => `    ${buildHeader(row)}`).join('\n');

  let tokenXml = '';
  if (totalCount > PAGE_SIZE) {
    tokenXml = '\n    ' + buildResumptionTokenXml(args, totalCount);
  }

  const body = `<ListIdentifiers>
${headerXmls}${tokenXml}
  </ListIdentifiers>`;

  sendXml(res, buildEnvelope({ requestParams: params, body }));
}

async function handleGetRecord(res, params) {
  const err = validateArgKeys('GetRecord', params);
  if (err) return sendError(res, err.code, err.message, params);

  if (!params.identifier || !params.metadataPrefix) {
    return sendError(
      res,
      'badArgument',
      'identifier와 metadataPrefix가 모두 필요함',
      params,
    );
  }
  if (params.metadataPrefix !== SUPPORTED_PREFIX) {
    return sendError(
      res,
      'cannotDisseminateFormat',
      `지원하지 않는 metadataPrefix: ${params.metadataPrefix}`,
      params,
    );
  }

  const cn = controlNumberFromIdentifier(params.identifier);
  if (!cn) {
    return sendError(res, 'idDoesNotExist', '식별자 형식 오류', params);
  }

  const result = await pool.query(
    `SELECT control_number, title, main_entry, isbn, pub_year, publisher,
            abstract, call_number, created_at
       FROM bib_records
      WHERE control_number = $1 AND record_status = 'active'`,
    [cn],
  );
  if (result.rows.length === 0) {
    return sendError(res, 'idDoesNotExist', '식별자에 해당하는 레코드 없음', params);
  }

  const row = result.rows[0];
  const body = `<GetRecord>
    <record>
      ${buildHeader(row)}
${buildDcMetadata(row)}
    </record>
  </GetRecord>`;

  sendXml(res, buildEnvelope({ requestParams: params, body }));
}

// ===== 메인 라우터 =====
async function handleOai(req, res, next) {
  try {
    const params = { ...req.query };

    // 동일 인수 중복 → badArgument (verb 포함)
    for (const [k, v] of Object.entries(params)) {
      if (Array.isArray(v)) {
        if (k === 'verb') {
          return sendError(res, 'badVerb', 'verb는 한 번만 지정 가능', {});
        }
        return sendError(res, 'badArgument', `중복된 인수: ${k}`, params);
      }
    }

    const verb = params.verb;
    if (!verb) {
      return sendError(res, 'badVerb', 'verb 인수가 필요함', {});
    }

    switch (verb) {
      case 'Identify':
        return await handleIdentify(res, params);
      case 'ListMetadataFormats':
        return await handleListMetadataFormats(res, params);
      case 'ListRecords':
        return await handleListRecords(res, params);
      case 'ListIdentifiers':
        return await handleListIdentifiers(res, params);
      case 'GetRecord':
        return await handleGetRecord(res, params);
      default:
        return sendError(res, 'badVerb', `지원하지 않는 verb: ${verb}`, {});
    }
  } catch (err) {
    next(err);
  }
}

router.get('/', handleOai);

module.exports = router;
