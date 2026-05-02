import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { ragSearch } from '../../api/rag'
import { READ_ONLY } from '../../config'

const PWD_KEY = 'ragPassword'

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

  // READ_ONLY 환경에서만 비밀번호 입력을 받음 (sessionStorage에 보관 — 탭 닫으면 사라짐)
  const [password, setPassword] = useState('')
  const [pwdInput, setPwdInput] = useState('')

  useEffect(() => {
    if (READ_ONLY) {
      const cached = sessionStorage.getItem(PWD_KEY)
      if (cached) setPassword(cached)
    }
  }, [])

  function submitPassword(e) {
    e.preventDefault()
    const v = pwdInput.trim()
    if (!v) return
    setPassword(v)
    sessionStorage.setItem(PWD_KEY, v)
  }

  function clearPassword() {
    setPassword('')
    sessionStorage.removeItem(PWD_KEY)
    setResult(null)
    setError(null)
  }

  async function submit(e) {
    if (e) e.preventDefault()
    const q = question.trim()
    if (!q || loading) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const data = await ragSearch(q, READ_ONLY ? password : undefined)
      setResult(data)
    } catch (err) {
      const status = err.response?.status
      // 비밀번호 오류면 캐시 삭제하고 다시 입력받기
      if (status === 401 && READ_ONLY) {
        clearPassword()
        setError('비밀번호가 올바르지 않습니다. 다시 입력해 주세요.')
      } else {
        setError(err.response?.data?.error || err.message)
      }
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      submit()
    }
  }

  // READ_ONLY 환경에서 아직 비밀번호가 입력되지 않으면 비밀번호 입력 폼만 보여줌
  if (READ_ONLY && !password) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold text-slate-900">AI 자연어 검색</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-amber-900 mb-2">
            🔒 비밀번호가 필요합니다
          </h2>
          <p className="text-sm text-amber-800 leading-relaxed mb-4">
            AI 자연어 검색은 Claude API 호출 비용이 발생하므로, 인증된 사용자만
            이용할 수 있습니다. 발급받은 비밀번호를 입력해 주세요.
          </p>

          <form onSubmit={submitPassword} className="flex gap-2">
            <input
              type="password"
              value={pwdInput}
              onChange={(e) => setPwdInput(e.target.value)}
              placeholder="비밀번호"
              autoFocus
              required
              className="flex-1 px-4 py-2 text-base text-slate-900 bg-white border border-amber-300 rounded focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            />
            <button
              type="submit"
              className="px-6 py-2 bg-amber-700 text-white rounded font-medium hover:bg-amber-800 transition-colors"
            >
              인증
            </button>
          </form>

          {error && (
            <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </p>
          )}

          <div className="mt-4">
            <Link
              to="/"
              className="text-sm text-amber-900 underline hover:text-amber-700"
            >
              ← 일반 검색으로 돌아가기
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-slate-900">AI 자연어 검색</h1>
        {READ_ONLY && password && (
          <button
            onClick={clearPassword}
            className="text-xs text-slate-500 hover:text-slate-900 underline"
          >
            🔓 인증 해제
          </button>
        )}
      </div>

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
