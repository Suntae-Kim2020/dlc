import { useState } from 'react'

import { sparqlQuery } from '../../api/sparql'

const EXAMPLES = [
  {
    label: '전체 트리플 수',
    query: `SELECT (COUNT(*) AS ?triples) WHERE {
  ?s ?p ?o
}`,
  },
  {
    label: '모든 서지의 제목',
    query: `PREFIX dc:   <http://purl.org/dc/elements/1.1/>
PREFIX bib:  <http://ailibrary.kr/resource/bib/>

SELECT ?bib ?title WHERE {
  ?bib dc:title ?title .
}
ORDER BY ?title`,
  },
  {
    label: 'BIBFRAME Work + Title',
    query: `PREFIX bf:   <http://id.loc.gov/ontologies/bibframe/>

SELECT ?work ?mainTitle WHERE {
  ?work a bf:Work ;
        bf:title/bf:mainTitle ?mainTitle .
}`,
  },
  {
    label: '저자별 출판물',
    query: `PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX bf:   <http://id.loc.gov/ontologies/bibframe/>

SELECT ?authorName ?title WHERE {
  ?work bf:title/bf:mainTitle ?title ;
        bf:contribution/bf:agent/foaf:name ?authorName .
}
ORDER BY ?authorName`,
  },
  {
    label: '외부 연결 (owl:sameAs)',
    query: `PREFIX owl:  <http://www.w3.org/2002/07/owl#>

SELECT ?subject ?external WHERE {
  ?subject owl:sameAs ?external .
}`,
  },
  {
    label: 'Wikidata 페더레이션 — Tim Berners-Lee 출생지',
    query: `PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX owl:  <http://www.w3.org/2002/07/owl#>
PREFIX wdt:  <http://www.wikidata.org/prop/direct/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT ?name ?birthPlace WHERE {
  ?author foaf:name "Tim Berners-Lee" ;
          owl:sameAs ?wikidataId .
  SERVICE <https://query.wikidata.org/sparql> {
    ?wikidataId wdt:P19 ?bp .
    ?bp rdfs:label ?birthPlace .
    FILTER(LANG(?birthPlace) = "en")
  }
  BIND("Tim Berners-Lee" AS ?name)
}
LIMIT 5`,
  },
]

function ResultsTable({ data }) {
  if (!data || !data.head?.vars || !data.results?.bindings) {
    return null
  }
  const vars = data.head.vars
  const rows = data.results.bindings

  if (rows.length === 0) {
    return (
      <p className="text-sm text-neutral-500 py-8 text-center">
        결과가 없습니다.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-neutral-500 bg-neutral-50 border-b border-neutral-200">
          <tr>
            {vars.map((v) => (
              <th key={v} className="text-left py-2 px-3 font-mono">
                ?{v}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50"
            >
              {vars.map((v) => {
                const cell = row[v]
                if (!cell)
                  return (
                    <td key={v} className="py-2 px-3 text-neutral-300">
                      —
                    </td>
                  )
                const isUri = cell.type === 'uri'
                return (
                  <td
                    key={v}
                    className={`py-2 px-3 ${
                      isUri ? 'font-mono text-xs text-indigo-600' : 'text-neutral-800'
                    }`}
                  >
                    {isUri ? (
                      <a
                        href={cell.value}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline break-all"
                      >
                        {cell.value}
                      </a>
                    ) : (
                      <span className="break-words">{cell.value}</span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-neutral-500 mt-2 px-1">
        총 {rows.length.toLocaleString()}개 결과
      </p>
    </div>
  )
}

export default function SparqlPage() {
  const [query, setQuery] = useState(EXAMPLES[0].query)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [contentType, setContentType] = useState('')

  function pickExample(ex) {
    setQuery(ex.query)
    setResult(null)
    setError(null)
  }

  async function execute(e) {
    if (e) e.preventDefault()
    if (busy || !query.trim()) return
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const { contentType, body } = await sparqlQuery(query)
      setContentType(contentType)
      // JSON 결과면 파싱
      if (contentType.includes('json')) {
        try {
          setResult({ kind: 'json', data: JSON.parse(body) })
        } catch {
          setResult({ kind: 'text', data: body })
        }
      } else {
        // Turtle, RDF/XML 등
        setResult({ kind: 'text', data: body })
      }
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.response?.data ||
        err.message
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg))
    } finally {
      setBusy(false)
    }
  }

  function handleKeyDown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      execute()
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold text-neutral-900 tracking-tight">
          SPARQL 쿼리
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          Apache Jena Fuseki — Dublin Core, BIBFRAME, owl:sameAs 외부 연결까지 조회 가능
        </p>
      </div>

      {/* 예시 쿼리 */}
      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((ex, i) => (
          <button
            key={i}
            onClick={() => pickExample(ex)}
            className="text-xs font-medium px-3 py-1.5 border border-neutral-200 rounded-md text-neutral-700 hover:bg-neutral-50 hover:border-neutral-400 transition-colors"
          >
            {ex.label}
          </button>
        ))}
      </div>

      {/* 쿼리 에디터 */}
      <form onSubmit={execute}>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={12}
          spellCheck={false}
          className="w-full px-4 py-3 text-sm font-mono text-neutral-900 bg-neutral-50 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-y"
        />
        <div className="flex justify-between items-center mt-2 flex-wrap gap-2">
          <p className="text-xs text-neutral-400">
            Ctrl+Enter (Mac ⌘+Enter) 로 실행
          </p>
          <button
            type="submit"
            disabled={busy || !query.trim()}
            className="px-5 py-2 bg-neutral-900 text-white rounded-md font-medium text-sm hover:bg-neutral-800 disabled:opacity-50 transition-colors"
          >
            {busy ? '실행 중…' : '실행'}
          </button>
        </div>
      </form>

      {/* 에러 */}
      {error && (
        <div className="px-4 py-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-700 whitespace-pre-wrap break-words">
          {error}
        </div>
      )}

      {/* 결과 */}
      {result && (
        <section className="border border-neutral-200 rounded-md overflow-hidden">
          <header className="px-4 py-2 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-500">결과</span>
            <span className="text-xs text-neutral-400 font-mono">
              {contentType.split(';')[0]}
            </span>
          </header>
          <div className="p-1">
            {result.kind === 'json' ? (
              <ResultsTable data={result.data} />
            ) : (
              <pre className="px-3 py-2 text-xs font-mono text-neutral-800 whitespace-pre-wrap overflow-x-auto max-h-96">
                {result.data}
              </pre>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
