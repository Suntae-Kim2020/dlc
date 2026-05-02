import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { getBibs } from '../../api/bibs'
import { getOverdue } from '../../api/loans'

const COLOR = {
  slate: 'text-slate-900',
  emerald: 'text-emerald-600',
  amber: 'text-amber-600',
  red: 'text-red-600',
}

function StatCard({ label, value, hint, color = 'slate' }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className={`text-3xl font-bold ${COLOR[color] || COLOR.slate}`}>
        {value}
      </p>
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  )
}

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    totalBibs: '…',
    activeLoans: '—',
    overdueLoans: '…',
  })
  const [recent, setRecent] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.all([
      // 모든 호출을 catch로 감싸 한 곳이 실패해도 다른 통계는 보이게
      getBibs(1, 20).catch(() => null),
      getOverdue().catch(() => null),
    ])
      .then(([bibs, overdue]) => {
        if (cancelled) return

        setStats({
          totalBibs: bibs?.total ?? '—',
          activeLoans: '—', // 활성 대출 목록 엔드포인트가 백엔드에 없음
          overdueLoans: overdue?.total ?? '—',
        })

        // 최근 입수 자료 5건 — created_at 기준 내림차순, 없으면 id 내림차순
        const list = bibs?.data || []
        const sorted = [...list]
          .sort((a, b) => {
            const ad = a.created_at || a.id || 0
            const bd = b.created_at || b.id || 0
            if (ad < bd) return 1
            if (ad > bd) return -1
            return 0
          })
          .slice(0, 5)
        setRecent(sorted)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const overdueColor =
    typeof stats.overdueLoans === 'number' && stats.overdueLoans > 0
      ? 'red'
      : 'slate'

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">대시보드</h2>
        <p className="text-sm text-slate-500 mt-1">
          시스템 현황을 한눈에 확인합니다.
        </p>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 통계 카드 */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          label="전체 서지"
          value={
            typeof stats.totalBibs === 'number'
              ? stats.totalBibs.toLocaleString()
              : stats.totalBibs
          }
          hint="record_status = active"
        />
        <StatCard
          label="현재 대출 중"
          value={stats.activeLoans}
          hint="GET /api/loans 미구현 — 백엔드 추가 필요"
          color="emerald"
        />
        <StatCard
          label="연체 건수"
          value={
            typeof stats.overdueLoans === 'number'
              ? stats.overdueLoans.toLocaleString()
              : stats.overdueLoans
          }
          hint="due_date 경과 + 미반납"
          color={overdueColor}
        />
      </section>

      {/* 최근 입수 자료 5건 */}
      <section>
        <div className="flex justify-between items-end mb-3">
          <h3 className="text-lg font-semibold text-slate-900">
            최근 입수 자료
          </h3>
          <Link
            to="/admin/bibs"
            className="text-xs text-slate-500 hover:text-slate-900"
          >
            전체 서지 관리 →
          </Link>
        </div>

        {loading ? (
          <p className="py-12 text-center text-sm text-slate-400">
            불러오는 중…
          </p>
        ) : recent.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">
            등록된 자료가 없습니다.
          </p>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
            {recent.map((b) => (
              <Link
                key={b.control_number}
                to={`/bib/${encodeURIComponent(b.control_number)}`}
                className="flex justify-between items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {b.title}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">
                    {b.main_entry || '저자 미상'}
                    {b.publisher && ` · ${b.publisher}`}
                    {b.pub_year && ` · ${b.pub_year}`}
                  </p>
                </div>
                <span className="text-xs text-slate-400 font-mono flex-shrink-0">
                  {b.control_number}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
