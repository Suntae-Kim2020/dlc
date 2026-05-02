import { useState } from 'react'
import { Link } from 'react-router-dom'

import { ragSearch } from '../../api/rag'

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        opacity="0.25"
      />
      <path
        d="M4 12a8 8 0 018-8"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  )
}

function SourceCard({ index, source }) {
  const id = source.control_number
  const title = source.title || '(제목 없음)'

  return (
    <article className="border border-slate-200 rounded-lg p-4 transition-colors hover:border-slate-300">
      <div className="flex items-start gap-3">
        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-100 text-slate-700 text-sm font-medium flex items-center justify-center">
          {index}
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-slate-900 mb-1">
            {id ? (
              <Link
                to={`/bib/${encodeURIComponent(id)}`}
                className="hover:underline"
              >
                {title}
              </Link>
            ) : (
              title
            )}
          </h3>
          <p className="text-sm text-slate-600 mb-2">
            {source.author || '저자 미상'}
          </p>
          <dl className="text-xs text-slate-500 grid grid-cols-2 gap-x-3 gap-y-0.5">
            <div className="truncate">
              <dt className="inline text-slate-400">출판사: </dt>
              <dd className="inline">{source.publisher || '-'}</dd>
            </div>
            <div>
              <dt className="inline text-slate-400">발행년: </dt>
              <dd className="inline">{source.pub_year || '-'}</dd>
            </div>
            <div className="col-span-2 truncate">
              <dt className="inline text-slate-400">청구기호: </dt>
              <dd className="inline font-mono">{source.call_number || '-'}</dd>
            </div>
          </dl>
        </div>
      </div>
    </article>
  )
}

export default function RagPage() {
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  async function submit(e) {
    if (e) e.preventDefault()
    const q = question.trim()
    if (!q || loading) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const data = await ragSearch(q)
      setResult(data)
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      submit()
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-slate-900">AI 자연어 검색</h1>

      {/* 1. 안내 */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
        <p className="text-sm text-slate-700 mb-1">
          소장 자료를 바탕으로 질문에 답변합니다.
        </p>
        <p className="text-xs text-slate-500">
          예: <span className="italic">"디지털도서관 구축 방법을 알고 싶다"</span>
        </p>
      </div>

      {/* 2. 질문 입력 */}
      <form
        onSubmit={submit}
        className="bg-white border border-slate-200 rounded-xl p-5"
      >
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={4}
          required
          placeholder="궁금한 내용을 자연어로 입력하세요…"
          className="w-full px-4 py-3 text-base text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent resize-y"
        />
        <div className="flex justify-between items-center mt-3 flex-wrap gap-2">
          <p className="text-xs text-slate-400">
            Ctrl+Enter (Mac ⌘+Enter)로 빠르게 전송
          </p>
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="px-6 py-2.5 bg-slate-900 text-white rounded-lg font-medium transition-colors hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <>
                <Spinner />
                <span>AI가 응답 중…</span>
              </>
            ) : (
              '질문하기'
            )}
          </button>
        </div>
      </form>

      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 3. 답변 */}
      {result && (
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div>
            <h2 className="text-xs uppercase tracking-wider text-slate-500 mb-2 font-semibold">
              질문
            </h2>
            <p className="text-base text-slate-700">{result.question}</p>
            {result.keywords && (
              <p className="text-xs text-slate-400 mt-1">
                추출 키워드:{' '}
                <span className="font-mono text-slate-600">
                  {result.keywords}
                </span>
              </p>
            )}
          </div>

          <div className="border-t border-slate-100 pt-4">
            <h2 className="text-xs uppercase tracking-wider text-slate-500 mb-2 font-semibold">
              답변
            </h2>
            <div className="text-base text-slate-800 leading-relaxed whitespace-pre-wrap">
              {result.answer}
            </div>
          </div>

          {Array.isArray(result.sources) && result.sources.length > 0 ? (
            <div className="border-t border-slate-100 pt-4">
              <h2 className="text-xs uppercase tracking-wider text-slate-500 mb-3 font-semibold">
                참고 자료 ({result.sources.length})
              </h2>
              <ol className="space-y-3">
                {result.sources.map((src, i) => (
                  <li key={src.control_number || i}>
                    <SourceCard index={i + 1} source={src} />
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <p className="border-t border-slate-100 pt-4 text-sm text-slate-500">
              참고한 소장 자료가 없습니다.
            </p>
          )}
        </section>
      )}

      {/* 4. 주의 문구 */}
      {result && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          <strong className="block mb-1">⚠ 안내</strong>
          이 답변은 소장 자료를 기반으로 AI가 생성한 것입니다. 정확성을 위해
          원문 자료를 직접 확인하세요.
        </div>
      )}
    </div>
  )
}
