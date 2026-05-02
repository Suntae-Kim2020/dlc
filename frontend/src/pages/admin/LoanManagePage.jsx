import { useEffect, useState } from 'react'

import {
  getOverdue,
  getUserLoans,
  returnLoan,
} from '../../api/loans'

// 다양한 백엔드 컬럼명을 받아들이는 헬퍼 (유저 페이지와 동일 패턴)
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
  return (
    l.book_title ||
    l.title ||
    l.bib_title ||
    `항목 #${l.item_id ?? loanId(l)}`
  )
}

function fmtDate(d) {
  if (!d) return '-'
  return String(d).slice(0, 10)
}

function daysOverdue(due) {
  if (!due) return 0
  const dueDay = new Date(String(due).slice(0, 10) + 'T00:00:00')
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00')
  const diffMs = today.getTime() - dueDay.getTime()
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
}

export default function LoanManagePage() {
  // 연체 목록
  const [overdue, setOverdue] = useState([])
  const [overdueLoading, setOverdueLoading] = useState(true)
  const [overdueError, setOverdueError] = useState(null)

  // 이용자별 대출
  const [searchInput, setSearchInput] = useState('')
  const [searchedUserId, setSearchedUserId] = useState(null)
  const [userLoans, setUserLoans] = useState([])
  const [userLoading, setUserLoading] = useState(false)
  const [userError, setUserError] = useState(null)

  // 공통
  const [busyLoanId, setBusyLoanId] = useState(null)
  const [toast, setToast] = useState(null)

  function flashToast(type, message) {
    setToast({ type, message })
    window.setTimeout(() => setToast(null), 4000)
  }

  async function refreshOverdue() {
    setOverdueLoading(true)
    setOverdueError(null)
    try {
      const data = await getOverdue()
      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.data)
        ? data.data
        : []
      setOverdue(list)
    } catch (err) {
      setOverdueError(err.response?.data?.error || err.message)
    } finally {
      setOverdueLoading(false)
    }
  }

  async function refreshUserLoans(uid = searchedUserId) {
    if (!uid) return
    setUserLoading(true)
    setUserError(null)
    try {
      const data = await getUserLoans(uid)
      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.data)
        ? data.data
        : []
      setUserLoans(list)
    } catch (err) {
      setUserError(err.response?.data?.error || err.message)
    } finally {
      setUserLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    setOverdueLoading(true)
    setOverdueError(null)
    getOverdue()
      .then((data) => {
        if (cancelled) return
        const list = Array.isArray(data)
          ? data
          : Array.isArray(data?.data)
          ? data.data
          : []
        setOverdue(list)
      })
      .catch((err) => {
        if (cancelled) return
        setOverdueError(err.response?.data?.error || err.message)
      })
      .finally(() => {
        if (!cancelled) setOverdueLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function handleSearchUser(e) {
    e.preventDefault()
    const uid = searchInput.trim()
    if (!uid) return
    setSearchedUserId(uid)
    refreshUserLoans(uid)
  }

  async function handleReturn(loan, source) {
    const id = loanId(loan)
    const ok = window.confirm(`'${bibTitle(loan)}' 자료를 반납 처리하시겠습니까?`)
    if (!ok) return
    setBusyLoanId(id)
    try {
      await returnLoan(id)
      flashToast('success', '반납 처리 완료')
      // 두 목록 모두 갱신 — 이 항목이 어느 쪽에 있을지 모름
      await Promise.all([
        refreshOverdue(),
        searchedUserId ? refreshUserLoans(searchedUserId) : Promise.resolve(),
      ])
    } catch (err) {
      flashToast('error', err.response?.data?.error || err.message)
    } finally {
      setBusyLoanId(null)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">대출 관리</h2>
        <p className="text-sm text-slate-500 mt-1">
          전체 연체 현황과 이용자별 대출 내역을 관리합니다.
        </p>
      </div>

      {toast && (
        <div
          className={`px-4 py-3 rounded text-sm ${
            toast.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* 1. 연체 목록 */}
      <section>
        <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
          <h3 className="text-lg font-semibold text-slate-900">
            연체 목록
            {!overdueLoading && (
              <span className="ml-2 text-sm font-normal text-red-600">
                {overdue.length}건
              </span>
            )}
          </h3>
          <button
            onClick={refreshOverdue}
            className="text-xs text-slate-500 hover:text-slate-900"
          >
            ↻ 새로고침
          </button>
        </div>

        {overdueError && (
          <div className="mb-3 px-4 py-3 rounded bg-red-50 border border-red-200 text-sm text-red-700">
            {overdueError}
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {overdueLoading ? (
            <p className="py-12 text-center text-sm text-slate-400">
              불러오는 중…
            </p>
          ) : overdue.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-500">
              연체 자료가 없습니다.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-slate-500 bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left py-3 px-4">이용자</th>
                    <th className="text-left py-3 px-4">자료명</th>
                    <th className="text-left py-3 px-4">대출일</th>
                    <th className="text-left py-3 px-4">반납예정일</th>
                    <th className="text-right py-3 px-4">연체일수</th>
                    <th className="text-right py-3 px-4">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {overdue.map((l) => {
                    const id = loanId(l)
                    const days = daysOverdue(dueDate(l))
                    return (
                      <tr
                        key={id}
                        className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50 text-red-700"
                      >
                        <td className="py-3 px-4 font-mono">
                          {l.user_number ? (
                            <>
                              {l.user_number}
                              <span className="text-xs text-slate-400 ml-1">
                                (#{l.user_id})
                              </span>
                            </>
                          ) : (
                            `#${l.user_id ?? '-'}`
                          )}
                          {l.user_name && (
                            <div className="text-xs text-slate-500 mt-0.5 font-sans">
                              {l.user_name}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">{bibTitle(l)}</td>
                        <td className="py-3 px-4">{fmtDate(loanDate(l))}</td>
                        <td className="py-3 px-4 font-semibold">
                          {fmtDate(dueDate(l))}
                        </td>
                        <td className="py-3 px-4 text-right font-bold">
                          {days}일
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <button
                            onClick={() => handleReturn(l, 'overdue')}
                            disabled={busyLoanId === id}
                            className="px-3 py-1 text-xs bg-slate-900 text-white rounded hover:bg-slate-800 disabled:opacity-50"
                          >
                            {busyLoanId === id ? '처리 중…' : '반납 처리'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* 2. 이용자별 대출 조회 */}
      <section>
        <h3 className="text-lg font-semibold text-slate-900 mb-3">
          이용자별 대출 조회
        </h3>

        <form onSubmit={handleSearchUser} className="flex gap-2 mb-4">
          <input
            type="number"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="이용자 ID (예: 1)"
            required
            className="flex-1 px-4 py-2 text-base text-slate-900 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
          />
          <button
            type="submit"
            disabled={userLoading}
            className="px-6 py-2 bg-slate-900 text-white rounded font-medium hover:bg-slate-800 disabled:opacity-50"
          >
            {userLoading ? '조회 중…' : '조회'}
          </button>
        </form>

        {userError && (
          <div className="mb-3 px-4 py-3 rounded bg-red-50 border border-red-200 text-sm text-red-700">
            {userError}
          </div>
        )}

        {searchedUserId && !userLoading && !userError && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 text-sm text-slate-600">
              이용자 #{searchedUserId} · 총 {userLoans.length}건
            </div>
            {userLoans.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">
                이용자의 대출 이력이 없습니다.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-slate-500 bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left py-3 px-4">자료명</th>
                      <th className="text-left py-3 px-4">대출일</th>
                      <th className="text-left py-3 px-4">반납예정일</th>
                      <th className="text-left py-3 px-4">상태</th>
                      <th className="text-right py-3 px-4">관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userLoans.map((l) => {
                      const id = loanId(l)
                      const returned = isReturned(l)
                      const overdueDays = !returned
                        ? daysOverdue(dueDate(l))
                        : 0
                      return (
                        <tr
                          key={id}
                          className={`border-b border-slate-100 last:border-b-0 hover:bg-slate-50 ${
                            !returned && overdueDays > 0
                              ? 'text-red-700'
                              : returned
                              ? 'text-slate-400'
                              : 'text-slate-700'
                          }`}
                        >
                          <td className="py-3 px-4">{bibTitle(l)}</td>
                          <td className="py-3 px-4">{fmtDate(loanDate(l))}</td>
                          <td className="py-3 px-4">{fmtDate(dueDate(l))}</td>
                          <td className="py-3 px-4">
                            {returned ? (
                              <span className="inline-block px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-600">
                                반납완료
                              </span>
                            ) : overdueDays > 0 ? (
                              <span className="inline-block px-2 py-0.5 rounded text-xs bg-red-100 text-red-700">
                                연체 {overdueDays}일
                              </span>
                            ) : (
                              <span className="inline-block px-2 py-0.5 rounded text-xs bg-emerald-100 text-emerald-700">
                                대출중
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            {!returned && (
                              <button
                                onClick={() => handleReturn(l, 'user')}
                                disabled={busyLoanId === id}
                                className="px-3 py-1 text-xs bg-slate-900 text-white rounded hover:bg-slate-800 disabled:opacity-50"
                              >
                                {busyLoanId === id ? '처리 중…' : '반납 처리'}
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
          </div>
        )}
      </section>
    </div>
  )
}
