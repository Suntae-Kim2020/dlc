import { NavLink } from 'react-router-dom'

import { isDemoBuild } from '../config'
import ModeToggle from './ModeToggle'
import QRDownloadButton from './QRDownloadButton'

const userLinks = [
  { to: '/', label: '검색', end: true },
  { to: '/loans', label: '대출현황' },
  { to: '/rag', label: 'AI 검색' },
  { to: '/sparql', label: 'SPARQL' },
  { to: '/about', label: '소개' },
]

const adminSubLinks = [
  { to: '/admin/bibs', label: '서지' },
  { to: '/admin/acquire', label: '수서' },
  { to: '/admin/users', label: '이용자' },
  { to: '/admin/loans', label: '대출' },
]

function linkClass({ isActive }) {
  return [
    'px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap',
    isActive
      ? 'bg-neutral-900 text-white'
      : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100',
  ].join(' ')
}

export default function NavBar() {
  const demoBuild = isDemoBuild()

  return (
    <header className="border-b border-neutral-200 bg-white/90 backdrop-blur sticky top-0 z-20">
      <nav className="max-w-6xl mx-auto px-4 py-3">
        {/* 첫 줄 — 로고 + 우측 도구 */}
        <div className="flex items-center justify-between gap-3">
          <NavLink
            to="/"
            className="text-base sm:text-lg font-semibold text-neutral-900 tracking-tight whitespace-nowrap"
          >
            AI Library<span className="text-indigo-600">.</span>
          </NavLink>

          <div className="flex items-center gap-3 flex-wrap justify-end">
            <ModeToggle />
            <QRDownloadButton />
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                [
                  'text-xs sm:text-sm font-medium px-3 py-1.5 rounded-md whitespace-nowrap transition-colors',
                  isActive
                    ? 'bg-neutral-900 text-white'
                    : 'text-neutral-700 border border-neutral-200 hover:bg-neutral-100',
                ].join(' ')
              }
            >
              관리자 →
            </NavLink>
          </div>
        </div>

        {/* 둘째 줄 — 사용자 메뉴 */}
        <div className="flex items-center gap-1 mt-2 -mx-1 overflow-x-auto px-1">
          {userLinks.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={linkClass}>
              {l.label}
            </NavLink>
          ))}

          {!demoBuild && (
            <div className="ml-auto flex items-center gap-1">
              <span className="text-xs text-neutral-400 px-2 hidden sm:inline">
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
