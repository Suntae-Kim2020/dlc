import { NavLink } from 'react-router-dom'

import { isDemoBuild } from '../config'
import ModeToggle from './ModeToggle'

const userLinks = [
  { to: '/', label: '검색', end: true },
  { to: '/loans', label: '대출현황' },
  { to: '/rag', label: 'AI 검색' },
]

const adminSubLinks = [
  { to: '/admin/bibs', label: '서지' },
  { to: '/admin/acquire', label: '수서' },
  { to: '/admin/users', label: '이용자' },
  { to: '/admin/loans', label: '대출' },
]

function linkClass({ isActive }) {
  return [
    'px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
    isActive
      ? 'bg-slate-900 text-white shadow-sm'
      : 'text-slate-700 hover:bg-slate-100',
  ].join(' ')
}

export default function NavBar() {
  const demoBuild = isDemoBuild()

  return (
    <header className="border-b border-slate-200 bg-white/80 backdrop-blur sticky top-0 z-20">
      <nav className="max-w-6xl mx-auto px-4 py-3">
        {/* 첫 줄 — 로고 + 우측 도구 (모바일에선 한 줄에 압축) */}
        <div className="flex items-center justify-between gap-3">
          <NavLink
            to="/"
            className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight whitespace-nowrap"
          >
            <span className="text-sky-600">AI</span> Library
          </NavLink>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            <ModeToggle />
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                [
                  'text-xs sm:text-sm font-medium px-3 py-1.5 rounded-full whitespace-nowrap transition-colors',
                  isActive
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-700 border border-slate-200 hover:bg-slate-100',
                ].join(' ')
              }
            >
              관리자 →
            </NavLink>
          </div>
        </div>

        {/* 둘째 줄 — 사용자 메뉴 (모바일에서도 한 줄에 가로 스크롤 없이 fit) */}
        <div className="flex items-center gap-1 mt-2 -mx-1 overflow-x-auto">
          {userLinks.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={linkClass}>
              {l.label}
            </NavLink>
          ))}

          {/* dev 빌드(=데모 빌드 아님)인 경우에만 NavBar에 관리자 sublinks 표시 */}
          {!demoBuild && (
            <div className="ml-auto flex items-center gap-1">
              <span className="text-xs text-slate-400 px-2 hidden sm:inline">
                관리
              </span>
              {adminSubLinks.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end={l.end}
                  className={linkClass}
                >
                  {l.label}
                </NavLink>
              ))}
            </div>
          )}
        </div>
      </nav>
    </header>
  )
}
