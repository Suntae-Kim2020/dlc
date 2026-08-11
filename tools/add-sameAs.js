const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });

const FUSEKI_URL = process.env.FUSEKI_URL || 'http://localhost:3030';
const FUSEKI_DATASET = process.env.FUSEKI_DATASET || 'digital-library';
const FUSEKI_USER = process.env.FUSEKI_USER || 'admin';
const FUSEKI_PASSWORD = process.env.FUSEKI_PASSWORD || '';

const UPDATE_ENDPOINT = `${FUSEKI_URL}/${FUSEKI_DATASET}/update`;
const AUTH_HEADER =
  'Basic ' +
  Buffer.from(`${FUSEKI_USER}:${FUSEKI_PASSWORD}`).toString('base64');

// SPARQL Update 전용 PREFIX 선언 (Turtle의 @prefix 아님 — 마침표 없음)
// URI는 prefix 축약 대신 전체 <http://...> 형식으로 사용 (slash 파싱 회피)
const SPARQL = `PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX owl:  <http://www.w3.org/2002/07/owl#>
PREFIX rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

INSERT DATA {

  # ---------------------------------------------------------
  # 1. 샘플 저자 — 홍길동 (가상 Wikidata QID + 한국어 위키백과)
  #    실제 연결 시 Q999999를 실존 인물의 QID로 교체할 것.
  # ---------------------------------------------------------
  <http://ailibrary.kr/resource/agent/hong-gildong>
      owl:sameAs <https://www.wikidata.org/entity/Q999999> ;
      foaf:page  <https://ko.wikipedia.org/wiki/%ED%99%8D%EA%B8%B8%EB%8F%99> .

  # ---------------------------------------------------------
  # 2. Tim Berners-Lee — 실제 Wikidata + DBpedia URI
  #    링크드 데이터 4원칙 ② "HTTP URI를 사용하라"의 살아 있는 사례.
  #    Q80     = Wikidata의 Tim Berners-Lee 항목.
  #    DBpedia = 페더레이션 SPARQL 데모용 (Wikidata는 Java 클라이언트
  #              기본 User-Agent를 거부하므로 페더레이션 시연은 DBpedia 사용).
  # ---------------------------------------------------------
  <http://ailibrary.kr/resource/agent/tim-berners-lee>
      a foaf:Person ;
      foaf:name "Tim Berners-Lee" ;
      owl:sameAs <https://www.wikidata.org/entity/Q80> ,
                 <http://dbpedia.org/resource/Tim_Berners-Lee> .

  # ---------------------------------------------------------
  # 3. 서지 레코드 KMO202300001 — WorldCat OCLC 가상 연결
  #    실제 연결 시 999999999를 실존 OCLC 번호로 교체할 것.
  # ---------------------------------------------------------
  <http://ailibrary.kr/resource/work/KMO202300001>
      owl:sameAs <https://www.worldcat.org/oclc/999999999> .

  # ---------------------------------------------------------
  # 4. 기관 — AI Library (가상 Wikidata QID)
  #    Q888888은 실습용 가상 식별자. 실제 운영 기관이라면 등록된 QID 사용.
  # ---------------------------------------------------------
  <http://ailibrary.kr/resource/organization/ailbrary>
      a foaf:Organization ;
      foaf:name "AI Library" ;
      owl:sameAs <https://www.wikidata.org/entity/Q888888> .
}
`;

async function main() {
  console.log(`Fuseki Update 엔드포인트: ${UPDATE_ENDPOINT}`);

  const res = await fetch(UPDATE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/sparql-update',
      Authorization: AUTH_HEADER,
    },
    body: SPARQL,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `SPARQL Update 실패: ${res.status} ${res.statusText}\n${text}`,
    );
  }

  console.log('owl:sameAs 외부 연결 트리플 추가 완료');
  console.log('  - 홍길동           → Wikidata Q999999 (가상)');
  console.log('  - Tim Berners-Lee  → Wikidata Q80 (실제)');
  console.log('  - KMO202300001     → WorldCat OCLC 999999999 (가상)');
  console.log('  - AI Library       → Wikidata Q888888 (가상)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
