import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { searchBibs, getBibs } from '../../api/bibs'

const FIELD_TABS = [
  { key: 'all', label: '전체' },
  { key: 'title', label: '제목' },
  { key: 'author', label: '저자' },
  { key: 'subject', label: '주제어' },
  { key: 'isbn', label: 'ISBN' },
]
const PAGE_SIZE = 10

// 서지 카드 — 검색 결과(hit.source)와 목록(row) 양쪽 모양 모두 지원
function BibCard({ bib, onClick }) {
  const src = bib.source || bib
  const id = src.control_number
  const author =
    src.main_entry ||
    (Array.isArray(src.authors) && src.authors.join(', ')) ||
    '저자 미상'

  return (
    <article
      onClick={() => onClick(id)}
      className="bg-white rounded-lg border border-slate-200 p-5 cursor-pointer transition-shadow hover:shadow-md hover:border-slate-300"
    >
      <h3 className="text-lg font-semibold text-slate-900 mb-1 line-clamp-2">
        {src.title || '(제목 없음)'}
      </h3>
      <p className="text-sm text-slate-600 mb-3">{author}</p>

      <dl className="text-xs text-slate-500 grid grid-cols-2 gap-x-3 gap-y-1">
        <div className="truncate">
          <dt className="inline text-slate-400">출판사: </dt>
          <dd className="inline">{src.publisher || '-'}</dd>
        </div>
        <div>
          <dt className="inline text-slate-400">발행년: </dt>
          <dd className="inline">{src.pub_year || '-'}</dd>
        </div>
        <div className="col-span-2 truncate">
          <dt className="inline text-slate-400">청구기호: </dt>
          <dd className="inline font-mono">{src.call_number || '-'}</dd>
        </div>
      </dl>

      <div className="mt-3 flex items-center justify-between">
        <span className="inline-block px-2 py-0.5 rounded text-xs bg-emerald-100 text-emerald-700">
          대출 가능
        </span>
        <span className="text-xs text-slate-400 font-mono">{id}</span>
      </div>
    </article>
  )
}

function Pagination({ total, page, pageSize, onPageChange }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (totalPages <= 1) return null

  const start = Math.max(1, page - 2)
  const end = Math.min(totalPages, page + 2)
  const pages = []
  for (let p = start; p <= end; p++) pages.push(p)

  const btn = (active, disabled) =>
    [
      'min-w-9 h-9 px-3 rounded-md text-sm border transition-colors',
      active
        ? 'bg-slate-900 text-white border-slate-900'
        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100',
      disabled ? 'opacity-40 cursor-not-allowed hover:bg-white' : '',
    ].join(' ')

  return (
    <nav className="flex justify-center items-center gap-2 mt-8">
      <button
        className={btn(false, page === 1)}
        disabled={page === 1}
        onClick={() => onPageChange(page - 1)}
      >
        ←
      </button>
      {start > 1 && (
        <>
          <button className={btn(false)} onClick={() => onPageChange(1)}>
            1
          </button>
          {start > 2 && <span className="text-slate-400">…</span>}
        </>
      )}
      {pages.map((p) => (
        <button
          key={p}
          className={btn(p === page)}
          onClick={() => onPageChange(p)}
        >
          {p}
        </button>
      ))}
      {end < totalPages && (
        <>
          {end < totalPages - 1 && <span className="text-slate-400">…</span>}
          <button
            className={btn(false)}
            onClick={() => onPageChange(totalPages)}
          >
            {totalPages}
          </button>
        </>
      )}
      <button
        className={btn(false, page === totalPages)}
        disabled={page === totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        →
      </button>
    </nav>
  )
}

export default function SearchPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const q = params.get('q') || ''
  const field = params.get('field') || 'all'
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1)

  const [input, setInput] = useState(q)
  const [results, setResults] = useState(null) // { total, took_ms, hits[] }
  const [latest, setLatest] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // q가 외부에서 바뀌면 입력창 동기화 (브라우저 뒤로가기 등)
  useEffect(() => {
    setInput(q)
  }, [q])

  // 데이터 로딩
  useEffect(() => {
    let cancelled = false
    setError(null)
    setLoading(true)

    const work = async () => {
      try {
        if (q) {
          const data = await searchBibs(q, {
            field,
            from: (page - 1) * PAGE_SIZE,
            size: PAGE_SIZE,
          })
          if (!cancelled) setResults(data)
        } else {
          const data = await getBibs(1, 20)
          if (cancelled) return
          const sorted = [...(data.data || [])]
            .sort((a, b) => (b.pub_year || 0) - (a.pub_year || 0))
            .slice(0, 5)
          setLatest(sorted)
          setResults(null)
        }
      } catch (err) {
        if (!cancelled) setError(err.message || '요청 실패')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    work()
    return () => {
      cancelled = true
    }
  }, [q, field, page])

  function submit(e) {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed) {
      setParams({})
      return
    }
    setParams({ q: trimmed, field, page: '1' })
  }

  function changeField(next) {
    if (q) setParams({ q, field: next, page: '1' })
    else setParams(next === 'all' ? {} : { field: next })
  }

  function changePage(next) {
    setParams({ q, field, page: String(next) })
  }

  function openBib(id) {
    if (id) navigate(`/bib/${encodeURIComponent(id)}`)
  }

  return (
    <div>
      {/* 검색창 */}
      <form
        onSubmit={submit}
        className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm mb-4 flex gap-2"
      >
        <input
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="책 제목, 저자, 주제어로 검색"
          className="flex-1 px-4 py-3 text-base text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
          autoFocus
        />
        <button
          type="submit"
          className="px-6 py-3 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition-colors"
        >
          검색
        </button>
      </form>

      {/* 검색 유형 탭 */}
      <div className="flex flex-wrap gap-1 mb-6 border-b border-slate-200">
        {FIELD_TABS.map((t) => {
          const active = field === t.key
          return (
            <button
              key={t.key}
              onClick={() => changeField(t.key)}
              className={[
                'px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
                active
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-700',
              ].join(' ')}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && (
        <div className="py-16 text-center text-sm text-slate-400">불러오는 중…</div>
      )}

      {/* 검색 결과 */}
      {!loading && q && results && (
        <>
          <p className="text-sm text-slate-600 mb-4">
            총 <strong className="text-slate-900">{results.total.toLocaleString()}</strong>건
            {results.took_ms != null && (
              <span className="text-slate-400"> · {results.took_ms}ms</span>
            )}
          </p>
          {results.hits.length === 0 ? (
            <div className="py-16 text-center text-slate-500">
              검색 결과가 없습니다.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {results.hits.map((hit) => (
                  <BibCard key={hit.id} bib={hit} onClick={openBib} />
                ))}
              </div>
              <Pagination
                total={results.total}
                page={page}
                pageSize={PAGE_SIZE}
                onPageChange={changePage}
              />
            </>
          )}
        </>
      )}

      {/* 검색 전 — 최근 입수 자료 */}
      {!loading && !q && (
        <section>
          <h2 className="text-xl font-semibold text-slate-900 mb-4">
            최근 입수 자료
          </h2>
          {latest.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              아직 등록된 자료가 없습니다.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {latest.map((b) => (
                <BibCard key={b.control_number} bib={b} onClick={openBib} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
