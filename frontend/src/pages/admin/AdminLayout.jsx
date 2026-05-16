import { Link, NavLink, Outlet } from 'react-router-dom'

import { isReadOnly } from '../../config'
import ModeToggle from '../../components/ModeToggle'
import QRDownloadButton from '../../components/QRDownloadButton'

const ADMIN_LINKS = [
  { to: '/admin', label: '대시보드', icon: '📊', end: true },
  { to: '/admin/bibs', label: '서지 관리', icon: '📚' },
  { to: '/admin/acquire', label: '수서 관리', icon: '🛒' },
  { to: '/admin/users', label: '이용자 관리', icon: '👤' },
  { to: '/admin/loans', label: '대출 관리', icon: '📖' },
  { to: '/admin/harvest', label: 'OAI 수확', icon: '🌾' },
]

function sidebarLinkClass({ isActive }) {
  return [
    'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
    isActive
      ? 'bg-neutral-900 text-white'
      : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100',
  ].join(' ')
}

function mobileLinkClass({ isActive }) {
  return [
    'flex-shrink-0 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors',
    isActive
      ? 'bg-neutral-900 text-white'
      : 'bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-50',
  ].join(' ')
}

export default function AdminLayout() {
  const readOnly = isReadOnly()

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* 1. 상단 헤더 — 미니멀 라이트 */}
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-20">
        <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-base sm:text-lg font-semibold text-neutral-900 tracking-tight">
              AI Library<span className="text-indigo-600">.</span>
            </span>
            <span className="text-sm text-neutral-300">/</span>
            <span className="text-sm font-medium text-neutral-500">관리자</span>
          </div>

          <div className="flex items-center gap-3 flex-wrap justify-end">
            <ModeToggle />
            <QRDownloadButton />
            <Link
              to="/"
              className="text-xs sm:text-sm font-medium px-3 py-1.5 rounded-md text-neutral-700 border border-neutral-200 hover:bg-neutral-100 transition-colors whitespace-nowrap"
            >
              ← 이용자 화면
            </Link>
          </div>
        </div>

        {/* 모바일용 가로 네비게이션 */}
        <nav className="md:hidden border-t border-neutral-100 px-4 py-2 flex gap-2 overflow-x-auto">
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

      {/* 데모 모드 배너 */}
      {readOnly && (
        <div className="bg-neutral-900 text-neutral-100 px-4 sm:px-6 py-2.5 text-xs sm:text-sm">
          <strong className="text-white">데모 모드</strong>
          <span className="text-neutral-400 mx-2">·</span>
          모든 변경 작업이 비활성화됨. 상단 토글로 활성 모드 전환 시 모든 기능 사용 가능.
        </div>
      )}

      <div className="flex-1 flex">
        {/* 2. 좌측 사이드바 (데스크톱) */}
        <aside className="w-60 bg-neutral-50 border-r border-neutral-200 p-4 hidden md:block flex-shrink-0">
          <nav className="space-y-0.5">
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
            <div className="mt-8 px-3 py-3 text-xs leading-relaxed text-neutral-600 bg-white border border-neutral-200 rounded-md">
              <strong className="block mb-1 text-neutral-900">인증 미완료</strong>
              현재 데모 모드입니다. 헤더의 토글로 활성 모드 전환 시 모든 관리 기능이
              사용 가능합니다.
            </div>
          )}
        </aside>

        {/* 3. 콘텐츠 영역 */}
        <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-x-hidden bg-white">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
