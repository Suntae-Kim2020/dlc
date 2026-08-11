import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getBibs } from '../../api/bibs';
import { getOverdue } from '../../api/loans';
import client from '../../api/client';

export default function DashboardPage() {
  const [stats, setStats] = useState({ totalBibs: 0, activeLoans: 0, overdueCount: 0 });
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [bibRes, overdueRes, loanRes] = await Promise.allSettled([
          getBibs(1, 1),
          getOverdue(),
          client.get('/api/loans', { params: { status: 'active', size: 1 } }).then((r) => r.data),
        ]);

        const totalBibs = bibRes.status === 'fulfilled' ? (bibRes.value.total ?? 0) : 0;
        const overdueData = overdueRes.status === 'fulfilled' ? overdueRes.value : [];
        const overdueCount = Array.isArray(overdueData) ? overdueData.length : (overdueData.total ?? 0);
        const activeLoans = loanRes.status === 'fulfilled' ? (loanRes.value.total ?? 0) : 0;

        setStats({ totalBibs, activeLoans, overdueCount });

        const recentRes = await getBibs(1, 5);
        setRecent(recentRes.data ?? []);
      } catch {
        /* 개별 실패는 기본값 유지 */
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const cards = [
    { label: '전체 서지', value: stats.totalBibs, color: 'blue', link: '/admin/bibs' },
    { label: '현재 대출', value: stats.activeLoans, color: 'green', link: '/admin/loans' },
    { label: '연체',      value: stats.overdueCount, color: 'red',  link: '/admin/loans' },
  ];

  const colorMap = {
    blue:  'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    red:   'bg-red-50 text-red-700 border-red-200',
  };

  if (loading) return <p className="text-center py-20 text-gray-400">불러오는 중...</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">대시보드</h1>

      {/* ── 통계 카드 ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {cards.map((c) => (
          <Link
            key={c.label}
            to={c.link}
            className={`rounded-xl border p-5 transition-shadow hover:shadow-md ${colorMap[c.color]}`}
          >
            <p className="text-sm font-medium opacity-80 mb-1">{c.label}</p>
            <p className="text-3xl font-bold">{c.value.toLocaleString()}</p>
          </Link>
        ))}
      </div>

      {/* ── 최근 입수 자료 ── */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">최근 입수 자료</h2>

        {recent.length === 0 ? (
          <p className="text-sm text-gray-400">자료가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 pr-4">제목</th>
                  <th className="pb-2 pr-4">저자</th>
                  <th className="pb-2 pr-4">출판년</th>
                  <th className="pb-2">청구기호</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((bib) => (
                  <tr key={bib.id} className="border-b last:border-0">
                    <td className="py-2.5 pr-4 text-gray-800 max-w-xs truncate">
                      <Link to={`/bib/${bib.id}`} className="hover:text-blue-600 hover:underline">
                        {bib.title}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-4 text-gray-600">{bib.main_entry ?? '-'}</td>
                    <td className="py-2.5 pr-4 text-gray-600">{bib.pub_year ?? '-'}</td>
                    <td className="py-2.5 text-gray-600 font-mono">{bib.call_number ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── 인증 안내 ── */}
      <p className="mt-6 text-xs text-gray-400 text-center">
        현재 인증 없이 접근 가능합니다. 운영 환경에서는 로그인 인증을 추가하세요.
      </p>
    </div>
  );
}
