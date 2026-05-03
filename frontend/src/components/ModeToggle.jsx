import { useState } from 'react'

import {
  clearAdminToken,
  isAdmin,
  isDemoBuild,
  setAdminToken,
} from '../config'
import { unlock } from '../api/admin'

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
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onCancel}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 sm:p-8"
      >
        <div className="flex items-center gap-3 mb-2">
          <span className="text-2xl">🔓</span>
          <h3 className="text-xl font-semibold text-slate-900">활성 모드 전환</h3>
        </div>
        <p className="text-sm text-slate-500 leading-relaxed mb-5">
          관리자 비밀번호를 입력하면 자료 등록·수정·삭제와 AI 자연어 검색이
          모두 가능해집니다. 인증은 브라우저 탭을 닫을 때까지만 유지됩니다.
        </p>

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호"
          autoFocus
          required
          autoComplete="current-password"
          className="w-full px-4 py-3 text-base text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
        />

        {error && (
          <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex gap-2 mt-6">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 font-medium hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={busy || !password}
            className="flex-1 px-4 py-2.5 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            {busy ? '확인 중…' : '활성 모드 전환'}
          </button>
        </div>
      </form>
    </div>
  )
}

// variant: 'light' (기본, 흰 배경에서) | 'dark' (어두운 헤더에서)
export default function ModeToggle({ variant = 'light' }) {
  const [showUnlock, setShowUnlock] = useState(false)

  // 데모 빌드가 아니면 토글 자체를 노출하지 않음
  if (!isDemoBuild()) return null

  const admin = isAdmin()

  function handleSwitchToDemo() {
    if (
      window.confirm(
        '데모 모드로 전환하시겠습니까?\n활성 모드 인증이 해제됩니다.',
      )
    ) {
      clearAdminToken()
      window.location.reload()
    }
  }

  function handleUnlockSuccess() {
    setShowUnlock(false)
    window.location.reload()
  }

  // 다크 헤더(예: 관리자) vs 라이트 헤더(이용자) 분기 색상
  const badgeBase = 'inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap'
  const btnBase = 'text-xs font-medium px-3 py-1.5 rounded-full whitespace-nowrap transition-colors'

  return (
    <>
      <div className="flex items-center gap-2">
        {admin ? (
          <>
            <span
              className={`${badgeBase} ${
                variant === 'dark'
                  ? 'bg-emerald-400/20 text-emerald-300 border border-emerald-400/30'
                  : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              🟢 활성 모드
            </span>
            <button
              onClick={handleSwitchToDemo}
              className={`${btnBase} ${
                variant === 'dark'
                  ? 'border border-slate-600 text-slate-300 hover:bg-slate-800'
                  : 'border border-slate-300 text-slate-600 hover:bg-slate-100'
              }`}
            >
              데모로 전환
            </button>
          </>
        ) : (
          <>
            <span
              className={`${badgeBase} ${
                variant === 'dark'
                  ? 'bg-amber-400/20 text-amber-200 border border-amber-400/30'
                  : 'bg-amber-100 text-amber-700'
              }`}
            >
              🟡 데모 모드
            </span>
            <button
              onClick={() => setShowUnlock(true)}
              className={`${btnBase} ${
                variant === 'dark'
                  ? 'bg-white text-slate-900 hover:bg-slate-100'
                  : 'bg-slate-900 text-white hover:bg-slate-800'
              }`}
            >
              활성 모드 전환
            </button>
          </>
        )}
      </div>

      {showUnlock && (
        <UnlockModal
          onCancel={() => setShowUnlock(false)}
          onSuccess={handleUnlockSuccess}
        />
      )}
    </>
  )
}
