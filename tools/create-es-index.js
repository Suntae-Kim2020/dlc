const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });

const ES_HOST = process.env.ES_HOST || 'http://localhost:9200';
const INDEX_NAME = 'bib-records';

const indexBody = {
  settings: {
    analysis: {
      tokenizer: {
        // 색인용: 복합어 원형 + 분해형 모두 (재현율 ↑)
        nori_index_tk: {
          type: 'nori_tokenizer',
          decompound_mode: 'mixed',
        },
        // 검색용: 분해형만 — mixed가 만드는 토큰 그래프가 match 쿼리를
        // phrase 매칭처럼 다루는 문제를 피하기 위함
        nori_search_tk: {
          type: 'nori_tokenizer',
          decompound_mode: 'discard',
        },
      },
      filter: {
        // 조사(J), 어미(E) 제거
        nori_pos_basic: {
          type: 'nori_part_of_speech',
          stoptags: [
            'E',   // 어미
            'J',   // 조사
          ],
        },
      },
      analyzer: {
        korean_nori: {
          type: 'custom',
          tokenizer: 'nori_index_tk',
          filter: ['nori_pos_basic', 'lowercase'],
        },
        korean_nori_search: {
          type: 'custom',
          tokenizer: 'nori_search_tk',
          filter: ['nori_pos_basic', 'lowercase'],
        },
      },
    },
  },
  mappings: {
    properties: {
      title:          { type: 'text', analyzer: 'korean_nori', search_analyzer: 'korean_nori_search' },
      main_entry:     { type: 'text', analyzer: 'korean_nori', search_analyzer: 'korean_nori_search' },
      // bib_authors/authors JOIN으로 색인되는 저자명 배열
      authors:        { type: 'text', analyzer: 'korean_nori', search_analyzer: 'korean_nori_search' },
      // bib_subjects/subjects JOIN으로 색인되는 주제어 배열
      subjects:       { type: 'text', analyzer: 'korean_nori', search_analyzer: 'korean_nori_search' },
      abstract:       { type: 'text', analyzer: 'korean_nori', search_analyzer: 'korean_nori_search' },
      publisher:      { type: 'keyword' },
      pub_year:       { type: 'integer' },
      isbn:           { type: 'keyword' },
      call_number:    { type: 'keyword' },
      control_number: { type: 'keyword' },
    },
  },
};

async function indexExists() {
  const res = await fetch(`${ES_HOST}/${INDEX_NAME}`, { method: 'HEAD' });
  return res.status === 200;
}

async function deleteIndex() {
  const res = await fetch(`${ES_HOST}/${INDEX_NAME}`, { method: 'DELETE' });
  if (!res.ok) {
    throw new Error(`인덱스 삭제 실패: ${res.status} ${await res.text()}`);
  }
}

async function createIndex() {
  const res = await fetch(`${ES_HOST}/${INDEX_NAME}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(indexBody),
  });
  if (!res.ok) {
    throw new Error(`인덱스 생성 실패: ${res.status} ${await res.text()}`);
  }
}

async function main() {
  const recreate = process.argv.includes('--recreate');
  console.log(`Elasticsearch: ${ES_HOST}`);
  console.log(`인덱스: ${INDEX_NAME}`);

  if (await indexExists()) {
    if (recreate) {
      console.log('기존 인덱스 삭제 (--recreate)');
      await deleteIndex();
    } else {
      console.log('이미 존재합니다. 다시 만들려면 --recreate 옵션을 사용하세요.');
      return;
    }
  }

  await createIndex();
  console.log('인덱스 생성 완료');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
