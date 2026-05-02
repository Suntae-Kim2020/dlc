const { Router } = require('express');
const { body, validationResult } = require('express-validator');
const Anthropic = require('@anthropic-ai/sdk');

const router = Router();

const ES_HOST = process.env.ES_HOST || 'http://localhost:9200';
const ES_INDEX = 'bib-records';

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

const CLAUDE_MODEL = 'claude-opus-4-7';

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

// 1단계 — 자연어 질문에서 검색용 키워드 추출
async function extractKeywords(question) {
  const res = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content:
          '다음 도서관 이용자의 질문에서 검색에 사용할 핵심 키워드만 공백으로 구분해 출력해줘. ' +
          '다른 설명, 따옴표, 줄바꿈은 절대 포함하지 마. 키워드만 한 줄로.\n\n' +
          `질문: ${question}\n\n키워드:`,
      },
    ],
  });
  const textBlock = res.content.find((b) => b.type === 'text');
  if (!textBlock) return question;
  return textBlock.text.trim().split('\n')[0].trim() || question;
}

// 2단계 — 추출한 키워드로 Elasticsearch 검색 (상위 5건)
async function searchEs(keywords) {
  const response = await fetch(`${ES_HOST}/${ES_INDEX}/_search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      size: 5,
      query: {
        multi_match: {
          query: keywords,
          fields: [
            'title^3',
            'main_entry^2',
            'authors^2',
            'subjects^2',
            'abstract^1',
          ],
          type: 'best_fields',
        },
      },
      _source: [
        'control_number',
        'title',
        'main_entry',
        'authors',
        'subjects',
        'abstract',
        'publisher',
        'pub_year',
        'call_number',
        'isbn',
      ],
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`ES 검색 실패: ${response.status}\n${text}`);
  }
  const json = await response.json();
  return json.hits.hits.map((h) => h._source);
}

// 3단계 — 검색 결과를 컨텍스트로 Claude에 전달, 답변 생성
async function generateAnswer(question, sources) {
  const context = sources
    .map((s, i) => {
      const author =
        Array.isArray(s.authors) && s.authors.length > 0
          ? s.authors.join(', ')
          : s.main_entry || '';
      const subjects = Array.isArray(s.subjects) ? s.subjects.join(', ') : '';
      return `[${i + 1}] 제목: ${s.title}
저자: ${author}
출판사: ${s.publisher || ''}
출판연도: ${s.pub_year || ''}
청구기호: ${s.call_number || ''}
주제: ${subjects}
초록: ${s.abstract || ''}`;
    })
    .join('\n\n');

  const systemPrompt =
    '당신은 전문 도서관 사서입니다. 이용자의 질문에 아래 도서관 소장 자료를 바탕으로 답변해주세요. ' +
    '답변 마지막에 참고한 자료 목록을 번호로 제시해주세요. ' +
    '소장 자료에 없는 내용은 답변하지 마세요.';

  const userPrompt = `[도서관 소장 자료]
${context}

[이용자 질문]
${question}`;

  const res = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });
  const textBlock = res.content.find((b) => b.type === 'text');
  return textBlock ? textBlock.text : '';
}

// -------------------------------------------------------
// POST /api/v1/rag/search
// -------------------------------------------------------
router.post(
  '/search',
  [
    body('question')
      .trim()
      .notEmpty()
      .withMessage('question(자연어 질문)이 필요합니다.'),
  ],
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      const { question } = req.body;

      const keywords = await extractKeywords(question);
      const sources = await searchEs(keywords);

      if (sources.length === 0) {
        return res.json({
          question,
          keywords,
          answer: '관련된 도서관 소장 자료를 찾지 못했습니다.',
          sources: [],
        });
      }

      const answer = await generateAnswer(question, sources);

      res.json({
        question,
        keywords,
        answer,
        sources: sources.map((s) => ({
          control_number: s.control_number,
          title: s.title,
          author:
            Array.isArray(s.authors) && s.authors.length > 0
              ? s.authors.join(', ')
              : s.main_entry || '',
          publisher: s.publisher,
          pub_year: s.pub_year,
          call_number: s.call_number,
          isbn: s.isbn,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
