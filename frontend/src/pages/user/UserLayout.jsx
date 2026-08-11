import { Outlet, NavLink } from 'react-router-dom';

const userNav = [
  { to: '/', label: '검색' },
  { to: '/loans', label: '대출현황' },
  { to: '/rag', label: '자연어검색' },
];

export default function UserLayout() {
  const linkClass = ({ isActive }) =>
    `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
      isActive
        ? 'bg-blue-600 text-white'
        : 'text-gray-700 hover:bg-gray-200'
    }`;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-14">
          <NavLink to="/" className="text-lg font-bold text-blue-700">
            AI Library
          </NavLink>
          <nav className="flex items-center gap-1">
            {userNav.map((n) => (
              <NavLink key={n.to} to={n.to} end className={linkClass}>
                {n.label}
              </NavLink>
            ))}
            <span className="mx-2 text-gray-300">|</span>
            <NavLink to="/admin" className={linkClass}>
              관리자
            </NavLink>
          </nav>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
