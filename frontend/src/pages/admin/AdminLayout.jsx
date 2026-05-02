import { Link, NavLink, Outlet } from 'react-router-dom'

import { READ_ONLY } from '../../config'

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
      ? 'bg-slate-900 text-white'
      : 'text-slate-700 hover:bg-slate-100',
  ].join(' ')
}

function mobileLinkClass({ isActive }) {
  return [
    'flex-shrink-0 px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors',
    isActive
      ? 'bg-slate-900 text-white'
      : 'text-slate-600 hover:bg-slate-100',
  ].join(' ')
}

export default function AdminLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* 1. 상단 헤더 */}
      <header className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">AI Library 관리자</h1>
        <Link
          to="/"
          className="text-sm text-slate-300 hover:text-white transition-colors"
        >
          ← 이용자 화면으로 돌아가기
        </Link>
      </header>

      {READ_ONLY && (
        <div className="bg-amber-100 border-b border-amber-200 px-6 py-3 text-sm text-amber-900">
          <strong>⚠ 데모 모드</strong> — 모든 변경 작업(등록·수정·삭제·반납·수령)이
          비활성화되어 있습니다. 화면 구성과 데이터 흐름만 살펴볼 수 있습니다.
        </div>
      )}

      {/* 모바일용 가로 네비게이션 (md 미만) */}
      <nav className="md:hidden bg-white border-b border-slate-200 px-4 py-2 flex gap-1 overflow-x-auto">
        {ADMIN_LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={mobileLinkClass}
          >
            {link.icon} {link.label}
          </NavLink>
        ))}
      </nav>

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

          {/* 인증 미구현 경고 — 학습 환경에서 항상 노출 */}
          <p className="mt-8 px-3 py-3 text-xs leading-relaxed text-amber-800 bg-amber-50 border border-amber-200 rounded-lg">
            <strong className="block mb-1">⚠ 인증 미구현</strong>
            현재 관리자 페이지는 누구나 접근할 수 있습니다. 운영 환경에서는
            반드시 로그인·권한 검증을 추가하세요.
          </p>
        </aside>

        {/* 3. 콘텐츠 영역 */}
        <main className="flex-1 p-6 md:p-8 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
