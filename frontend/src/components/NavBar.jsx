import { NavLink } from 'react-router-dom'

import { READ_ONLY } from '../config'

const userLinks = [
  { to: '/', label: '검색', end: true },
  { to: '/loans', label: '대출현황' },
  { to: '/rag', label: '자연어검색' },
]

const adminLinks = [
  { to: '/admin', label: '대시보드', end: true },
  { to: '/admin/bibs', label: '서지' },
  { to: '/admin/acquire', label: '수서' },
  { to: '/admin/users', label: '이용자' },
  { to: '/admin/loans', label: '대출' },
]

function linkClass({ isActive }) {
  return [
    'px-3 py-2 rounded-md text-sm font-medium transition-colors',
    isActive
      ? 'bg-slate-900 text-white'
      : 'text-slate-700 hover:bg-slate-200',
  ].join(' ')
}

export default function NavBar() {
  return (
    <header className="border-b border-slate-200 bg-white sticky top-0 z-10">
      <nav className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-6">
        <NavLink to="/" className="text-lg font-semibold text-slate-900">
          AI Library
        </NavLink>

        <div className="flex items-center gap-1">
          {userLinks.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={linkClass}>
              {l.label}
            </NavLink>
          ))}
        </div>

        {READ_ONLY ? (
          <div className="ml-auto">
            <span className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-700">
              데모 모드
            </span>
          </div>
        ) : (
          <div className="ml-auto flex items-center gap-1">
            <span className="text-xs text-slate-400 mr-2">관리</span>
            {adminLinks.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={linkClass}>
                {l.label}
              </NavLink>
            ))}
          </div>
        )}
      </nav>
    </header>
  )
}
