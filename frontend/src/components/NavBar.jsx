import { useState } from 'react'
import { NavLink } from 'react-router-dom'

import {
  isDemoBuild,
  isAdmin,
  setAdminToken,
  clearAdminToken,
} from '../config'
import { unlock } from '../api/admin'

const userLinks = [
  { to: '/', label: '검색', end: true },
  { to: '/loans', label: '대출현황' },
  { to: '/rag', label: '자연어검색' },
]

const adminLinks = [
  { to: '/admin', label: '대시보드', end: true },
  { to: '/admin/bibs', label: '서지' },
  { to: '/admin/acquire', label: '수서' },
  { to: '/admin/users', label: '이용자' },
  { to: '/admin/loans', label: '대출' },
]

function linkClass({ isActive }) {
  return [
    'px-3 py-2 rounded-md text-sm font-medium transition-colors',
    isActive
      ? 'bg-slate-900 text-white'
      : 'text-slate-700 hover:bg-slate-200',
  ].join(' ')
}

function UnlockModal({ onCancel, onSuccess }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await unlock(password)
      setAdminToken(result.token)
      onSuccess()
    } catch (err) {
      setError(err.response?.data?.error || err.message)
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-30 p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl shadow-xl max-w-md w-full p-6"
      >
        <h3 className="text-lg font-semibold text-slate-900 mb-1">
          🔓 활성 모드 전환
        </h3>
        <p className="text-sm text-slate-500 mb-4 leading-relaxed">
          관리자 비밀번호를 입력하세요. 활성 모드에서는 자료 등록·수정·삭제와
          AI 자연어 검색(RAG)이 모두 가능합니다.
        </p>

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호"
          autoFocus
          required
          className="w-full px-4 py-2 text-base text-slate-900 bg-slate-50 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
        />

        {error && (
          <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex gap-2 mt-5">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 px-4 py-2 border border-slate-300 rounded text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={busy || !password}
            className="flex-1 px-4 py-2 bg-slate-900 text-white rounded font-medium hover:bg-slate-800 disabled:opacity-50"
          >
            {busy ? '확인 중…' : '활성 모드 전환'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default function NavBar() {
  const [showUnlock, setShowUnlock] = useState(false)

  const demoBuild = isDemoBuild()
  const admin = isAdmin()

  function handleSwitchToDemo() {
    if (window.confirm('데모 모드로 전환하시겠습니까? 활성 모드 인증이 해제됩니다.')) {
      clearAdminToken()
      window.location.reload()
    }
  }

  function handleUnlockSuccess() {
    setShowUnlock(false)
    window.location.reload() // 모든 컴포넌트가 새 상태로 다시 렌더링
  }

  return (
    <>
      <header className="border-b border-slate-200 bg-white sticky top-0 z-10">
        <nav className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-6 flex-wrap">
          <NavLink to="/" className="text-lg font-semibold text-slate-900">
            AI Library
          </NavLink>

          <div className="flex items-center gap-1">
            {userLinks.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={linkClass}>
                {l.label}
              </NavLink>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {/* 모드 배지 + 토글 (데모 빌드일 때만 노출) */}
            {demoBuild && admin && (
              <>
                <span className="text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700 font-medium">
                  🟢 활성 모드
                </span>
                <button
                  onClick={handleSwitchToDemo}
                  className="text-xs px-3 py-1.5 border border-slate-300 rounded text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  데모로 전환
                </button>
              </>
            )}
            {demoBuild && !admin && (
              <>
                <span className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-700 font-medium">
                  🟡 데모 모드
                </span>
                <button
                  onClick={() => setShowUnlock(true)}
                  className="text-xs px-3 py-1.5 bg-slate-900 text-white rounded hover:bg-slate-800 transition-colors"
                >
                  활성 모드 전환
                </button>
              </>
            )}

            {/* 관리자 진입 — 데모/활성 무관하게 항상 노출 */}
            {(demoBuild || true) && (
              <NavLink
                to="/admin"
                className="px-3 py-2 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-200 transition-colors"
              >
                관리자 →
              </NavLink>
            )}

            {/* dev 환경(데모 빌드 아님)에선 관리자 sublinks도 함께 표시 */}
            {!demoBuild && (
              <>
                {adminLinks.slice(1).map((l) => (
                  <NavLink
                    key={l.to}
                    to={l.to}
                    end={l.end}
                    className={linkClass}
                  >
                    {l.label}
                  </NavLink>
                ))}
              </>
            )}
          </div>
        </nav>
      </header>

      {showUnlock && (
        <UnlockModal
          onCancel={() => setShowUnlock(false)}
          onSuccess={handleUnlockSuccess}
        />
      )}
    </>
  )
}
