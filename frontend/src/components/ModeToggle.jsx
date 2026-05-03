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

export default function ModeToggle() {
  const [showUnlock, setShowUnlock] = useState(false)

  // 데모 빌드가 아니면 토글 자체를 노출하지 않음
  if (!isDemoBuild()) return null

  const admin = isAdmin()

  function handleToggle() {
    if (admin) {
      // 활성 → 데모
      if (
        window.confirm('데모 모드로 전환하시겠습니까?\n활성 모드 인증이 해제됩니다.')
      ) {
        clearAdminToken()
        window.location.reload()
      }
    } else {
      // 데모 → 활성 (비밀번호 모달)
      setShowUnlock(true)
    }
  }

  function handleUnlockSuccess() {
    setShowUnlock(false)
    window.location.reload()
  }

  return (
    <>
      <button
        type="button"
        onClick={handleToggle}
        title={admin ? '클릭해서 데모 모드로' : '클릭해서 활성 모드로'}
        className="group inline-flex items-center gap-2.5 select-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded-full px-1.5 py-1"
      >
        {/* 라벨 + 점 */}
        <span
          className={[
            'inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap transition-colors',
            admin ? 'text-emerald-700' : 'text-amber-700',
          ].join(' ')}
        >
          <span
            className={[
              'inline-block w-1.5 h-1.5 rounded-full',
              admin ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400',
            ].join(' ')}
          />
          {admin ? '활성 모드' : '데모 모드'}
        </span>

        {/* 슬라이더 스위치 */}
        <span
          role="switch"
          aria-checked={admin}
          className={[
            'relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors',
            admin
              ? 'bg-emerald-500 group-hover:bg-emerald-600'
              : 'bg-slate-300 group-hover:bg-slate-400',
          ].join(' ')}
        >
          <span
            className={[
              'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
              admin ? 'translate-x-5' : 'translate-x-0.5',
            ].join(' ')}
          />
        </span>
      </button>

      {showUnlock && (
        <UnlockModal
          onCancel={() => setShowUnlock(false)}
          onSuccess={handleUnlockSuccess}
        />
      )}
    </>
  )
}
