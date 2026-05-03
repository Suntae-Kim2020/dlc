import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { getBib, getBibItems } from '../../api/bibs'
import { createLoan } from '../../api/loans'
import { getLinkedData } from '../../api/lod'
import { isReadOnly } from '../../config'

const SAME_AS = 'http://www.w3.org/2002/07/owl#sameAs'

// JSON-LD에서 owl:sameAs 모두 추출 — 평면/그래프 형태 모두 대응
function extractSameAs(jsonld) {
  if (!jsonld) return []
  const items = Array.isArray(jsonld)
    ? jsonld
    : Array.isArray(jsonld['@graph'])
    ? jsonld['@graph']
    : [jsonld]

  const links = []
  for (const item of items) {
    let v = item[SAME_AS] || item['owl:sameAs']
    if (!v) continue
    if (!Array.isArray(v)) v = [v]
    for (const elem of v) {
      const uri = typeof elem === 'string' ? elem : elem?.['@id']
      if (uri) links.push({ from: item['@id'], to: uri })
    }
  }
  return links
}

// 외부 URI의 호스트로 라벨 결정
function labelForUri(uri) {
  try {
    const u = new URL(uri)
    if (u.host.includes('wikidata.org')) return 'Wikidata'
    if (u.host.includes('worldcat.org')) return 'WorldCat'
    if (u.host.includes('orcid.org')) return 'ORCID'
    if (u.host.includes('wikipedia.org')) return 'Wikipedia'
    return u.host
  } catch {
    return '외부'
  }
}

// 다양한 백엔드 스키마를 받아들임 (status / item_status / availability 등)
function isAvailable(item) {
  if (!item) return false
  const s =
    item.status ?? item.item_status ?? item.availability ?? item.is_available
  if (typeof s === 'boolean') return s
  if (s == null) return true // 상태 정보 없으면 일단 가능으로 가정
  return ['available', 'AVAILABLE', '가능', 'on_shelf'].includes(s)
}

function defaultDueDate() {
  const d = new Date()
  d.setDate(d.getDate() + 14)
  return d.toISOString().slice(0, 10)
}

function InfoRow({ label, value, mono }) {
  if (value == null || value === '') return null
  return (
    <div className="grid grid-cols-3 gap-2 py-2 border-b border-slate-100 last:border-b-0">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd
        className={`col-span-2 text-sm text-slate-900 ${mono ? 'font-mono' : ''}`}
      >
        {value}
      </dd>
    </div>
  )
}

function LoanModal({ bibTitle, item, busy, onCancel, onSubmit }) {
  const [userId, setUserId] = useState('')
  const [dueDate, setDueDate] = useState(defaultDueDate())

  function handleSubmit(e) {
    e.preventDefault()
    const trimmed = userId.trim()
    if (!trimmed) return
    onSubmit({
      item_id: item.id,
      user_id: parseInt(trimmed, 10),
      due_date: dueDate,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-20 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-1">대출 신청</h3>
        <p className="text-sm text-slate-500 mb-4 truncate">{bibTitle}</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-700 mb-1">자료 항목</label>
            <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded text-sm text-slate-700 font-mono">
              #{item.id} {item.barcode || item.item_barcode || ''}
            </div>
          </div>

          <div>
            <label className="block text-sm text-slate-700 mb-1">이용자 ID</label>
            <input
              type="number"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              required
              autoFocus
              placeholder="예: 1"
              className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
            />
            <p className="mt-1 text-xs text-slate-400">
              로그인 기능 미구현 — 직접 입력
            </p>
          </div>

          <div>
            <label className="block text-sm text-slate-700 mb-1">반납 예정일</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              required
              className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="flex-1 px-4 py-2 border border-slate-300 rounded text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={busy}
              className="flex-1 px-4 py-2 bg-slate-900 text-white rounded font-medium hover:bg-slate-800 disabled:opacity-50"
            >
              {busy ? '신청 중…' : '신청'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function BibDetailPage() {
  const { id } = useParams()

  const [bib, setBib] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // 대출 신청 모달 상태
  const [loanItem, setLoanItem] = useState(null)
  const [loanBusy, setLoanBusy] = useState(false)
  const [loanResult, setLoanResult] = useState(null)

  // LOD 패널 상태
  const [lodOpen, setLodOpen] = useState(false)
  const [lodLoading, setLodLoading] = useState(false)
  const [lodError, setLodError] = useState(null)
  const [lodData, setLodData] = useState(null)
  const [sameAsLinks, setSameAsLinks] = useState([])

  // 서지 + 소장 데이터 로딩
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setBib(null)
    setItems([])

    Promise.all([getBib(id), getBibItems(id).catch(() => [])])
      .then(([bibData, itemsData]) => {
        if (cancelled) return
        setBib(bibData)
        const list = Array.isArray(itemsData)
          ? itemsData
          : Array.isArray(itemsData?.data)
          ? itemsData.data
          : []
        setItems(list)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err.response?.data?.error || err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [id])

  async function handleSubmitLoan(payload) {
    setLoanBusy(true)
    setLoanResult(null)
    try {
      const result = await createLoan(payload)
      const loanId = result?.id || result?.loan_id || ''
      setLoanResult({
        type: 'success',
        message: `대출 신청 완료${loanId ? ` (대출 #${loanId})` : ''}`,
      })
      setLoanItem(null)
      // 화면 갱신: 그 항목의 상태를 대출 중으로
      setItems((prev) =>
        prev.map((it) =>
          it.id === payload.item_id ? { ...it, status: 'on_loan' } : it,
        ),
      )
    } catch (err) {
      const msg = err.response?.data?.error || err.message
      setLoanResult({ type: 'error', message: `대출 신청 실패: ${msg}` })
    } finally {
      setLoanBusy(false)
    }
  }

  async function handleToggleLod() {
    if (lodOpen) {
      setLodOpen(false)
      return
    }
    setLodOpen(true)
    if (lodData) return
    setLodLoading(true)
    setLodError(null)
    try {
      const data = await getLinkedData('bib', id, 'application/ld+json')
      setLodData(data)
      setSameAsLinks(extractSameAs(data))
    } catch (err) {
      setLodError(err.response?.data?.error || err.message)
    } finally {
      setLodLoading(false)
    }
  }

  if (loading) {
    return <div className="py-16 text-center text-sm text-slate-400">불러오는 중…</div>
  }
  if (error) {
    return (
      <div className="py-16 text-center text-sm text-red-600">
        {error}
        <div className="mt-4">
          <Link to="/" className="text-slate-500 hover:text-slate-900">
            ← 검색으로 돌아가기
          </Link>
        </div>
      </div>
    )
  }
  if (!bib) {
    return <div className="py-16 text-center text-slate-500">서지 정보가 없습니다.</div>
  }

  const author =
    bib.main_entry ||
    (Array.isArray(bib.authors) && bib.authors[0]?.name) ||
    '저자 미상'
  const subjectLabels =
    Array.isArray(bib.subjects) && bib.subjects.length > 0
      ? bib.subjects.map((s) => s.term || s).filter(Boolean).join(' · ')
      : null
  const availableCount = items.filter(isAvailable).length

  return (
    <div className="space-y-6">
      <Link
        to="/"
        className="inline-block text-sm text-slate-500 hover:text-slate-900"
      >
        ← 검색으로 돌아가기
      </Link>

      {/* 1. 서지 기본 정보 */}
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">{bib.title}</h1>
        <p className="text-base text-slate-700 mb-4">{author}</p>

        <dl>
          <InfoRow label="제목" value={bib.title} />
          <InfoRow label="저자" value={author} />
          <InfoRow label="출판사" value={bib.publisher} />
          <InfoRow label="출판년도" value={bib.pub_year} />
          <InfoRow label="ISBN" value={bib.isbn} mono />
          <InfoRow label="청구기호" value={bib.call_number} mono />
          <InfoRow label="제어번호" value={bib.control_number} mono />
          <InfoRow label="주제" value={subjectLabels} />
        </dl>

        {bib.abstract && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <h3 className="text-sm font-medium text-slate-500 mb-2">초록</h3>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
              {bib.abstract}
            </p>
          </div>
        )}
      </section>

      {/* 2. 소장 현황 */}
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-slate-900">소장 현황</h2>
          {items.length > 0 && (
            <span className="text-xs text-slate-500">
              총 {items.length}권 · 대출 가능 {availableCount}권
            </span>
          )}
        </div>

        {items.length === 0 ? (
          <p className="text-sm text-slate-500">
            소장 정보가 없거나 items API가 아직 구현되지 않았습니다.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="text-left py-2 px-2">바코드</th>
                  <th className="text-left py-2 px-2">위치</th>
                  <th className="text-left py-2 px-2">상태</th>
                  <th className="py-2 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const avail = isAvailable(it)
                  return (
                    <tr
                      key={it.id}
                      className="border-b border-slate-100 last:border-b-0"
                    >
                      <td className="py-3 px-2 font-mono text-slate-700">
                        {it.barcode || it.item_barcode || `#${it.id}`}
                      </td>
                      <td className="py-3 px-2 text-slate-600">
                        {it.location || it.shelf_location || '-'}
                      </td>
                      <td className="py-3 px-2">
                        {avail ? (
                          <span className="inline-block px-2 py-0.5 rounded text-xs bg-emerald-100 text-emerald-700">
                            대출 가능
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-600">
                            대출 중
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-right">
                        {avail && !isReadOnly() && (
                          <button
                            onClick={() => setLoanItem(it)}
                            className="px-3 py-1.5 text-sm bg-slate-900 text-white rounded hover:bg-slate-800"
                          >
                            대출 신청
                          </button>
                        )}
                        {avail && isReadOnly() && (
                          <span className="text-xs text-slate-400">
                            데모 — 대출 비활성
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {loanResult && (
          <div
            className={`mt-4 px-4 py-3 rounded text-sm ${
              loanResult.type === 'success'
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                : 'bg-red-50 border border-red-200 text-red-700'
            }`}
          >
            {loanResult.message}
          </div>
        )}
      </section>

      {/* 4. LOD 외부 연결 */}
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-slate-900">링크드 데이터</h2>
          <button
            onClick={handleToggleLod}
            className="px-4 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
          >
            {lodOpen ? '닫기' : '링크드 데이터로 보기'}
          </button>
        </div>

        {lodOpen && (
          <>
            {lodLoading && (
              <p className="text-sm text-slate-400">불러오는 중…</p>
            )}
            {lodError && (
              <p className="text-sm text-red-600">{lodError}</p>
            )}

            {!lodLoading && !lodError && (
              <>
                {sameAsLinks.length > 0 ? (
                  <div className="mb-4">
                    <h3 className="text-sm font-medium text-slate-700 mb-2">
                      외부 연결 (owl:sameAs)
                    </h3>
                    <ul className="space-y-1.5">
                      {sameAsLinks.map((link, i) => (
                        <li key={i}>
                          <a
                            href={link.to}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline"
                          >
                            <span className="font-medium">
                              {labelForUri(link.to)} 페이지 →
                            </span>
                            <span className="text-xs text-slate-400 font-mono break-all">
                              {link.to}
                            </span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 mb-4">
                    이 자원에는 외부 owl:sameAs 연결이 등록되어 있지 않습니다.
                  </p>
                )}

                {lodData && (
                  <details className="mt-4">
                    <summary className="text-sm text-slate-500 cursor-pointer hover:text-slate-700">
                      JSON-LD 원본 보기
                    </summary>
                    <pre className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded text-xs text-slate-700 overflow-x-auto max-h-96">
                      {JSON.stringify(lodData, null, 2)}
                    </pre>
                  </details>
                )}
              </>
            )}
          </>
        )}
      </section>

      {/* 3. 대출 신청 모달 */}
      {loanItem && (
        <LoanModal
          bibTitle={bib.title}
          item={loanItem}
          busy={loanBusy}
          onCancel={() => setLoanItem(null)}
          onSubmit={handleSubmitLoan}
        />
      )}
    </div>
  )
}
