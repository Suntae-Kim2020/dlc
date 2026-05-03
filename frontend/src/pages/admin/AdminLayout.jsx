import { Link, NavLink, Outlet } from 'react-router-dom'

import { isReadOnly } from '../../config'
import ModeToggle from '../../components/ModeToggle'

const ADMIN_LINKS = [
  { to: '/admin', label: '대시보드', icon: '📊', end: true },
  { to: '/admin/bibs', label: '서지 관리', icon: '📚' },
  { to: '/admin/acquire', label: '수서 관리', icon: '🛒' },
  { to: '/admin/users', label: '이용자 관리', icon: '👤' },
  { to: '/admin/loans', label: '대출 관리', icon: '📖' },
]

function sidebarLinkClass({ isActive }) {
  return [
    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
    isActive
      ? 'bg-slate-900 text-white shadow-sm'
      : 'text-slate-700 hover:bg-slate-100',
  ].join(' ')
}

function mobileLinkClass({ isActive }) {
  return [
    'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
    isActive
      ? 'bg-slate-900 text-white'
      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50',
  ].join(' ')
}

export default function AdminLayout() {
  const readOnly = isReadOnly()

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* 1. 상단 헤더 — light theme로 일관성 */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
              <span className="text-sky-600">AI</span> Library
            </span>
            <span className="text-sm text-slate-400">/</span>
            <span className="text-sm font-medium text-slate-600">관리자</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            <ModeToggle />
            <Link
              to="/"
              className="text-xs sm:text-sm font-medium px-3 py-1.5 rounded-full text-slate-700 border border-slate-200 hover:bg-slate-100 transition-colors whitespace-nowrap"
            >
              ← 이용자 화면
            </Link>
          </div>
        </div>

        {/* 모바일용 가로 네비게이션 (md 미만) */}
        <nav className="md:hidden border-t border-slate-100 px-4 py-2 flex gap-2 overflow-x-auto">
          {ADMIN_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={mobileLinkClass}
            >
              <span className="mr-1">{link.icon}</span>
              {link.label}
            </NavLink>
          ))}
        </nav>
      </header>

      {/* 데모 모드 배너 (활성 모드면 사라짐) */}
      {readOnly && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 sm:px-6 py-3 text-sm text-amber-900">
          <strong>⚠ 데모 모드</strong> — 모든 변경 작업이 비활성화되어 있습니다.
          상단 <strong>[활성 모드 전환]</strong> 버튼으로 비밀번호를 입력하면
          모든 기능을 사용할 수 있습니다.
        </div>
      )}

      <div className="flex-1 flex">
        {/* 2. 좌측 사이드바 (데스크톱) */}
        <aside className="w-60 bg-white border-r border-slate-200 p-4 hidden md:block flex-shrink-0">
          <nav className="space-y-1">
            {ADMIN_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={sidebarLinkClass}
              >
                <span className="text-base" aria-hidden="true">
                  {link.icon}
                </span>
                <span>{link.label}</span>
              </NavLink>
            ))}
          </nav>

          {readOnly && (
            <div className="mt-8 px-3 py-3 text-xs leading-relaxed text-amber-800 bg-amber-50 border border-amber-200 rounded-lg">
              <strong className="block mb-1">⚠ 인증 미완료</strong>
              현재 데모 모드입니다. 헤더의 [활성 모드 전환] 버튼으로
              비밀번호를 입력해 모든 관리 기능을 활성화하세요.
            </div>
          )}
        </aside>

        {/* 3. 콘텐츠 영역 */}
        <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
