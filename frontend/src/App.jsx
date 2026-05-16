import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom'

import NavBar from './components/NavBar'
import SearchPage from './pages/user/SearchPage'
import BibDetailPage from './pages/user/BibDetailPage'
import LoanPage from './pages/user/LoanPage'
import RagPage from './pages/user/RagPage'
import SparqlPage from './pages/user/SparqlPage'

import AdminLayout from './pages/admin/AdminLayout'
import AdminDashboard from './pages/admin/AdminDashboard'
import BibManagePage from './pages/admin/BibManagePage'
import AcquireManagePage from './pages/admin/AcquireManagePage'
import UserManagePage from './pages/admin/UserManagePage'
import LoanManagePage from './pages/admin/LoanManagePage'
import OaiHarvestPage from './pages/admin/OaiHarvestPage'

import NotFoundPage from './pages/NotFoundPage'

// 이용자 영역 — 전역 NavBar + 본문 컨테이너
function UserShell() {
  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <NavBar />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 이용자 화면 */}
        <Route element={<UserShell />}>
          <Route path="/" element={<SearchPage />} />
          <Route path="/bib/:id" element={<BibDetailPage />} />
          <Route path="/loans" element={<LoanPage />} />
          <Route path="/rag" element={<RagPage />} />
          <Route path="/sparql" element={<SparqlPage />} />
        </Route>

        {/* 관리자 화면 — 자체 헤더 + 사이드바 */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="bibs" element={<BibManagePage />} />
          <Route path="acquire" element={<AcquireManagePage />} />
          <Route path="users" element={<UserManagePage />} />
          <Route path="loans" element={<LoanManagePage />} />
          <Route path="harvest" element={<OaiHarvestPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
