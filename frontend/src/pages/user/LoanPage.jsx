import { useState } from 'react'
import { Link } from 'react-router-dom'

import { getUserLoans, returnLoan } from '../../api/loans'
import { READ_ONLY } from '../../config'

// 날짜 표기 — ISO 8601의 앞 10자리(YYYY-MM-DD)만
function fmt(d) {
  if (!d) return '-'
  return String(d).slice(0, 10)
}

// 백엔드 스키마가 표준화 안 됐을 수 있어 후보 필드명 모두 받아들임
function loanId(l) {
  return l.id ?? l.loan_id
}
function isReturned(l) {
  return Boolean(l.return_date || l.returned_at)
}
function dueDate(l) {
  return l.due_date || l.due_at || null
}
function loanDate(l) {
  return l.loan_date || l.borrowed_at || l.created_at || null
}
function bibTitle(l) {
  // 백엔드가 b.title AS book_title로 JOIN해서 보냄 — 그걸 1순위로
  return (
    l.book_title ||
    l.title ||
    l.bib_title ||
    `항목 #${l.item_id ?? loanId(l)}`
  )
}

function isOverdue(l) {
  if (isReturned(l)) return false
  const due = dueDate(l)
  if (!due) return false
  const today = new Date().toISOString().slice(0, 10)
  return String(due).slice(0, 10) < today
}

function StatusBadge({ loan }) {
  if (isReturned(loan)) {
    return (
      <span className="inline-block px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-600">
        반납완료
      </span>
    )
  }
  if (isOverdue(loan)) {
    return (
      <span className="inline-block px-2 py-0.5 rounded text-xs bg-red-100 text-red-700">
        연체
      </span>
    )
  }
  return (
    <span className="inline-block px-2 py-0.5 rounded text-xs bg-emerald-100 text-emerald-700">
      대출중
    </span>
  )
}

export default function LoanPage() {
  const [userIdInput, setUserIdInput] = useState('')
  const [userId, setUserId] = useState(null)
  const [loans, setLoans] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [busyLoanId, setBusyLoanId] = useState(null)
  const [toast, setToast] = useState(null)

  async function fetchLoans(uid) {
    setLoading(true)
    setError(null)
    try {
      const data = await getUserLoans(uid)
      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.data)
        ? data.data
        : []
      setLoans(list)
    } catch (err) {
      setError(err.response?.data?.error || err.message)
      setLoans([])
    } finally {
      setLoading(false)
    }
  }

  function handleSearch(e) {
    e.preventDefault()
    const uid = userIdInput.trim()
    if (!uid) return
    setUserId(uid)
    fetchLoans(uid)
  }

  async function handleReturn(loan) {
    const id = loanId(loan)
    const ok = window.confirm(
      `'${bibTitle(loan)}' 자료를 반납 처리하시겠습니까?`,
    )
    if (!ok) return

    setBusyLoanId(id)
    try {
      await returnLoan(id)
      setToast({ type: 'success', message: '반납 처리 완료' })
      await fetchLoans(userId)
    } catch (err) {
      const msg = err.response?.data?.error || err.message
      setToast({ type: 'error', message: `반납 실패: ${msg}` })
    } finally {
      setBusyLoanId(null)
      setTimeout(() => setToast(null), 4000)
    }
  }

  const overdueCount = loans.filter((l) => !isReturned(l) && isOverdue(l)).length
  const activeCount = loans.filter((l) => !isReturned(l)).length

  if (READ_ONLY) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold text-slate-900">대출 현황</h1>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">
            데모 환경 — 검색 전용
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            이 사이트는 디지털도서관 시스템의 <strong>공개 검색 데모</strong>입니다.
            대출·반납과 같은 변경 작업은 비활성화되어 있고, 자료 검색·상세 조회만
            제공됩니다.
          </p>
          <div className="mt-4">
            <Link
              to="/"
              className="text-sm text-slate-700 underline hover:text-slate-900"
            >
              ← 검색으로 돌아가기
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-slate-900 mb-6">대출 현황</h1>

      {/* 1. 이용자 ID 입력 */}
      <form
        onSubmit={handleSearch}
        className="bg-white border border-slate-200 rounded-xl p-4 mb-6 shadow-sm flex gap-2"
      >
        <input
          type="number"
          value={userIdInput}
          onChange={(e) => setUserIdInput(e.target.value)}
          placeholder="이용자 ID (예: 1)"
          required
          className="flex-1 px-4 py-3 text-base text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
        />
        <button
          type="submit"
          className="px-6 py-3 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition-colors"
        >
          조회
        </button>
      </form>

      {/* Toast */}
      {toast && (
        <div
          className={`mb-4 px-4 py-3 rounded text-sm ${
            toast.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}
        >
          {toast.message}
        </div>
      )}

      {error && (
        <div className="mb-4 px-4 py-3 rounded bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && (
        <div className="py-16 text-center text-sm text-slate-400">
          불러오는 중…
        </div>
      )}

      {/* 2. 현재 대출 목록 */}
      {!loading && userId && !error && (
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
            <h2 className="text-lg font-semibold text-slate-900">
              이용자 #{userId} 대출 목록
            </h2>
            <div className="flex gap-3 text-xs text-slate-500">
              <span>총 {loans.length}건</span>
              <span>
                대출 중 <strong className="text-slate-900">{activeCount}</strong>
              </span>
              {overdueCount > 0 && (
                <span className="text-red-600">
                  연체 <strong>{overdueCount}</strong>
                </span>
              )}
            </div>
          </div>

          {loans.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              대출 이력이 없습니다.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="text-left py-2 px-2">제목</th>
                    <th className="text-left py-2 px-2">대출일</th>
                    <th className="text-left py-2 px-2">반납예정일</th>
                    <th className="text-left py-2 px-2">상태</th>
                    <th className="py-2 px-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {loans.map((loan) => {
                    const id = loanId(loan)
                    const overdue = isOverdue(loan)
                    const returned = isReturned(loan)
                    const rowCls = overdue
                      ? 'bg-red-50/40 text-red-700'
                      : returned
                      ? 'text-slate-400'
                      : 'text-slate-700'
                    return (
                      <tr
                        key={id}
                        className={`border-b border-slate-100 last:border-b-0 ${rowCls}`}
                      >
                        <td className="py-3 px-2">
                          <span className={overdue ? 'font-medium' : ''}>
                            {bibTitle(loan)}
                          </span>
                        </td>
                        <td className="py-3 px-2">{fmt(loanDate(loan))}</td>
                        <td className="py-3 px-2">
                          <span className={overdue ? 'font-semibold' : ''}>
                            {fmt(dueDate(loan))}
                          </span>
                        </td>
                        <td className="py-3 px-2">
                          <StatusBadge loan={loan} />
                        </td>
                        <td className="py-3 px-2 text-right">
                          {!returned && (
                            <button
                              onClick={() => handleReturn(loan)}
                              disabled={busyLoanId === id}
                              className="px-3 py-1.5 text-sm bg-slate-900 text-white rounded hover:bg-slate-800 disabled:opacity-50"
                            >
                              {busyLoanId === id ? '처리 중…' : '반납'}
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {!userId && !loading && (
        <p className="py-12 text-center text-sm text-slate-400">
          이용자 ID를 입력하고 조회 버튼을 눌러주세요.
        </p>
      )}
    </div>
  )
}
