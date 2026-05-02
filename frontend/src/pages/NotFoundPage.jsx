import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <section>
      <h1 className="text-3xl font-bold text-slate-900 mb-4">404</h1>
      <p className="text-slate-600 mb-4">요청한 페이지를 찾을 수 없습니다.</p>
      <Link to="/" className="text-blue-600 underline">
        메인으로 돌아가기
      </Link>
    </section>
  )
}
