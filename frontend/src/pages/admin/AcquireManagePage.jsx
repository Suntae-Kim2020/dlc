import { useEffect, useState } from 'react'

import {
  createAcquisition,
  getAcquisitions,
  receiveAcquisition,
} from '../../api/acquisitions'

const STATUS_META = {
  ordered: { label: '발주', color: 'bg-blue-100 text-blue-700' },
  received: { label: '수령', color: 'bg-emerald-100 text-emerald-700' },
  cataloged: { label: '편목완료', color: 'bg-slate-100 text-slate-600' },
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || {
    label: status || '미정',
    color: 'bg-slate-100 text-slate-600',
  }
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs ${meta.color}`}>
      {meta.label}
    </span>
  )
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10)
}

function fmtPrice(p) {
  if (p == null || p === '') return '-'
  const n = typeof p === 'number' ? p : Number(p)
  if (!Number.isFinite(n)) return '-'
  return `${n.toLocaleString()}원`
}

function fmtDate(d) {
  if (!d) return '-'
  return String(d).slice(0, 10)
}

const EMPTY_FORM = {
  title: '',
  author: '',
  isbn: '',
  publisher: '',
  quantity: 1,
  unit_price: '',
  order_date: '',
  fund_code: '',
}

function Field({
  label,
  name,
  value,
  onChange,
  type = 'text',
  required,
  mono,
  colSpan,
  min,
  step,
  placeholder,
}) {
  return (
    <div className={colSpan ? 'md:col-span-2' : ''}>
      <label className="block text-sm text-slate-700 mb-1">{label}</label>
      <input
        type={type}
        name={name}
        value={value ?? ''}
        onChange={onChange}
        required={required}
        min={min}
        step={step}
        placeholder={placeholder}
        className={[
          'w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent',
          mono ? 'font-mono' : '',
        ].join(' ')}
      />
    </div>
  )
}

function CreateModal({ busy, onCancel, onSubmit }) {
  // 모달 열릴 때마다 발주일 기본값 = 오늘
  const [form, setForm] = useState({
    ...EMPTY_FORM,
    order_date: todayISODate(),
  })

  function handleChange(e) {
    const { name, value } = e.target
    setForm((p) => ({ ...p, [name]: value }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    const payload = {
      title: form.title,
      author: form.author || null,
      isbn: form.isbn || null,
      publisher: form.publisher || null,
      quantity: parseInt(form.quantity, 10) || 1,
      unit_price:
        form.unit_price === '' || form.unit_price == null
          ? null
          : Number(form.unit_price),
      order_date: form.order_date || todayISODate(),
      fund_code: form.fund_code || null,
    }
    onSubmit(payload)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-20 p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto"
      >
        <h3 className="text-lg font-semibold text-slate-900 mb-1">구입 신청</h3>
        <p className="text-sm text-slate-500 mb-4">
          * 표시는 필수 입력 항목입니다.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field
            label="제목 *"
            name="title"
            value={form.title}
            onChange={handleChange}
            required
            colSpan
          />
          <Field
            label="저자"
            name="author"
            value={form.author}
            onChange={handleChange}
          />
          <Field
            label="ISBN"
            name="isbn"
            value={form.isbn}
            onChange={handleChange}
            mono
          />
          <Field
            label="출판사"
            name="publisher"
            value={form.publisher}
            onChange={handleChange}
          />
          <Field
            label="수량"
            name="quantity"
            type="number"
            value={form.quantity}
            onChange={handleChange}
            min={1}
          />
          <Field
            label="단가 (원)"
            name="unit_price"
            type="number"
            value={form.unit_price}
            onChange={handleChange}
            min={0}
            step={100}
            placeholder="예: 25000"
          />
          <Field
            label="발주일"
            name="order_date"
            type="date"
            value={form.order_date}
            onChange={handleChange}
          />
          <Field
            label="예산 코드 (fund_code)"
            name="fund_code"
            value={form.fund_code}
            onChange={handleChange}
            mono
            placeholder="예: LIB-2026-001"
          />
        </div>

        <div className="flex gap-2 mt-6 pt-4 border-t border-slate-100">
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
            {busy ? '저장 중…' : '신청'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default function AcquireManagePage() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [showCreate, setShowCreate] = useState(false)
  const [busy, setBusy] = useState(false) // 신청 모달
  const [busyRowId, setBusyRowId] = useState(null) // 행별 수령 처리
  const [toast, setToast] = useState(null)

  function flashToast(type, message) {
    setToast({ type, message })
    window.setTimeout(() => setToast(null), 4000)
  }

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const data = await getAcquisitions()
      const items = Array.isArray(data)
        ? data
        : Array.isArray(data?.data)
        ? data.data
        : []
      setList(items)
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    getAcquisitions()
      .then((data) => {
        if (cancelled) return
        const items = Array.isArray(data)
          ? data
          : Array.isArray(data?.data)
          ? data.data
          : []
        setList(items)
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
  }, [])

  async function handleCreate(payload) {
    setBusy(true)
    try {
      await createAcquisition(payload)
      flashToast('success', '구입 신청 완료')
      setShowCreate(false)
      await refresh()
    } catch (err) {
      const msg = err.response?.data?.error || err.message
      flashToast('error', `신청 실패: ${msg}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleReceive(item) {
    const ok = window.confirm(`'${item.title}' 자료를 수령 처리하시겠습니까?`)
    if (!ok) return
    setBusyRowId(item.id)
    try {
      await receiveAcquisition(item.id)
      flashToast('success', '수령 처리 완료')
      await refresh()
    } catch (err) {
      const msg = err.response?.data?.error || err.message
      flashToast('error', `수령 실패: ${msg}`)
    } finally {
      setBusyRowId(null)
    }
  }

  // 상태별 카운트
  const counts = list.reduce(
    (acc, it) => {
      acc[it.status] = (acc[it.status] || 0) + 1
      return acc
    },
    {},
  )

  return (
    <div>
      <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">수서 관리</h2>
          <p className="text-sm text-slate-500 mt-1 flex flex-wrap gap-x-3">
            <span>전체 {list.length.toLocaleString()}건</span>
            {counts.ordered > 0 && (
              <span className="text-blue-600">
                발주 <strong>{counts.ordered}</strong>
              </span>
            )}
            {counts.received > 0 && (
              <span className="text-emerald-600">
                수령 <strong>{counts.received}</strong>
              </span>
            )}
            {counts.cataloged > 0 && (
              <span className="text-slate-600">
                편목완료 <strong>{counts.cataloged}</strong>
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition-colors"
        >
          + 구입 신청
        </button>
      </div>

      {toast && (
        <div
          className={`mb-4 px-4 py-3 rounded text-sm ${
            toast.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}
        >
          {toast.message}
        </div>
      )}

      {error && (
        <div className="mb-4 px-4 py-3 rounded bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <p className="py-16 text-center text-sm text-slate-400">
            불러오는 중…
          </p>
        ) : list.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-500">
            수서 신청 내역이 없습니다.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500 bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left py-3 px-4">제목</th>
                  <th className="text-left py-3 px-4">저자</th>
                  <th className="text-left py-3 px-4">ISBN</th>
                  <th className="text-left py-3 px-4">출판사</th>
                  <th className="text-right py-3 px-4">수량</th>
                  <th className="text-right py-3 px-4">단가</th>
                  <th className="text-left py-3 px-4">발주일</th>
                  <th className="text-left py-3 px-4">상태</th>
                  <th className="text-right py-3 px-4">관리</th>
                </tr>
              </thead>
              <tbody>
                {list.map((it) => (
                  <tr
                    key={it.id}
                    className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                  >
                    <td className="py-3 px-4 text-slate-900">{it.title}</td>
                    <td className="py-3 px-4 text-slate-600">
                      {it.author || '-'}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">
                      {it.isbn || '-'}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {it.publisher || '-'}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-700">
                      {it.quantity ?? '-'}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-700">
                      {fmtPrice(it.unit_price)}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {fmtDate(it.order_date)}
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={it.status} />
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {it.status === 'ordered' ? (
                        <button
                          onClick={() => handleReceive(it)}
                          disabled={busyRowId === it.id}
                          className="px-3 py-1 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {busyRowId === it.id ? '처리 중…' : '수령 처리'}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateModal
          busy={busy}
          onCancel={() => setShowCreate(false)}
          onSubmit={handleCreate}
        />
      )}
    </div>
  )
}
