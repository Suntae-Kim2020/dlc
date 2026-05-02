import { useEffect, useState } from 'react'

import {
  createBib,
  deleteBib,
  getBib,
  getBibs,
  updateBib,
} from '../../api/bibs'

const PAGE_SIZE = 10

const EMPTY_FORM = {
  control_number: '',
  title: '',
  main_entry: '',
  isbn: '',
  publisher: '',
  pub_year: '',
  call_number: '',
  ddc_number: '',
  abstract: '',
}

function Field({
  label,
  name,
  value,
  onChange,
  type = 'text',
  required,
  disabled,
  mono,
  colSpan,
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
        disabled={disabled}
        className={[
          'w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent',
          'disabled:bg-slate-50 disabled:text-slate-500',
          mono ? 'font-mono' : '',
        ].join(' ')}
      />
    </div>
  )
}

function FormModal({ mode, initial, busy, onCancel, onSubmit }) {
  const [form, setForm] = useState(initial || EMPTY_FORM)

  function handleChange(e) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    const payload = { ...form }

    // pub_year — 빈 값은 null, 그 외는 숫자
    if (payload.pub_year === '' || payload.pub_year == null) {
      payload.pub_year = null
    } else {
      const n = parseInt(payload.pub_year, 10)
      payload.pub_year = Number.isFinite(n) ? n : null
    }

    // 빈 문자열은 null로 정규화
    Object.keys(payload).forEach((k) => {
      if (payload[k] === '') payload[k] = null
    })

    onSubmit(payload)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-20 p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto"
      >
        <h3 className="text-lg font-semibold text-slate-900 mb-1">
          {mode === 'edit' ? '서지 수정' : '새 서지 등록'}
        </h3>
        <p className="text-sm text-slate-500 mb-4">
          {mode === 'edit'
            ? '제어번호는 식별자라 수정할 수 없습니다.'
            : '* 표시는 필수 입력 항목입니다.'}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field
            label="제어번호 *"
            name="control_number"
            value={form.control_number}
            onChange={handleChange}
            required
            disabled={mode === 'edit'}
            mono
          />
          <Field
            label="제목 *"
            name="title"
            value={form.title}
            onChange={handleChange}
            required
          />
          <Field
            label="저자 (main_entry)"
            name="main_entry"
            value={form.main_entry}
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
            label="출판년도"
            name="pub_year"
            type="number"
            value={form.pub_year}
            onChange={handleChange}
          />
          <Field
            label="청구기호"
            name="call_number"
            value={form.call_number}
            onChange={handleChange}
            mono
          />
          <Field
            label="DDC 분류기호"
            name="ddc_number"
            value={form.ddc_number}
            onChange={handleChange}
            mono
          />

          <div className="md:col-span-2">
            <label className="block text-sm text-slate-700 mb-1">초록</label>
            <textarea
              name="abstract"
              value={form.abstract ?? ''}
              onChange={handleChange}
              rows={4}
              className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
            />
          </div>
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
            {busy ? '저장 중…' : mode === 'edit' ? '수정' : '등록'}
          </button>
        </div>
      </form>
    </div>
  )
}

function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null
  const btn = (disabled) =>
    [
      'px-3 py-1.5 text-sm rounded border transition-colors',
      'bg-white border-slate-300 text-slate-700 hover:bg-slate-50',
      disabled ? 'opacity-40 cursor-not-allowed hover:bg-white' : '',
    ].join(' ')
  return (
    <nav className="flex items-center justify-center gap-3 mt-6">
      <button
        className={btn(page === 1)}
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
      >
        ← 이전
      </button>
      <span className="text-sm text-slate-600">
        <strong className="text-slate-900">{page}</strong> / {totalPages}
      </span>
      <button
        className={btn(page === totalPages)}
        disabled={page === totalPages}
        onClick={() => onChange(page + 1)}
      >
        다음 →
      </button>
    </nav>
  )
}

export default function BibManagePage() {
  const [page, setPage] = useState(1)
  const [list, setList] = useState({ total: 0, data: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [editing, setEditing] = useState(null) // null | { mode, initial }
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)

  const totalPages = Math.max(1, Math.ceil(list.total / PAGE_SIZE))

  function flashToast(type, message) {
    setToast({ type, message })
    window.setTimeout(() => setToast(null), 4000)
  }

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const data = await getBibs(page, PAGE_SIZE)
      setList({ total: data.total || 0, data: data.data || [] })
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
    getBibs(page, PAGE_SIZE)
      .then((data) => {
        if (cancelled) return
        setList({ total: data.total || 0, data: data.data || [] })
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
  }, [page])

  function openNew() {
    setEditing({ mode: 'new', initial: { ...EMPTY_FORM } })
  }

  async function openEdit(bib) {
    setBusy(true)
    try {
      const detail = await getBib(bib.control_number)
      setEditing({
        mode: 'edit',
        initial: {
          control_number: detail.control_number || '',
          title: detail.title || '',
          main_entry: detail.main_entry || '',
          isbn: detail.isbn || '',
          publisher: detail.publisher || '',
          pub_year: detail.pub_year ?? '',
          call_number: detail.call_number || '',
          ddc_number: detail.ddc_number || '',
          abstract: detail.abstract || '',
        },
      })
    } catch (err) {
      flashToast(
        'error',
        `상세 조회 실패: ${err.response?.data?.error || err.message}`,
      )
    } finally {
      setBusy(false)
    }
  }

  async function handleSave(payload) {
    setBusy(true)
    try {
      if (editing.mode === 'new') {
        await createBib(payload)
        flashToast('success', '새 서지 등록 완료')
      } else {
        // 수정 시 control_number는 식별자이므로 본문에서 제외
        const { control_number, ...rest } = payload
        await updateBib(editing.initial.control_number, rest)
        flashToast('success', '서지 수정 완료')
      }
      setEditing(null)
      await refresh()
    } catch (err) {
      const msg = err.response?.data?.error || err.message
      flashToast('error', `저장 실패: ${msg}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(bib) {
    const ok = window.confirm(
      `'${bib.title}' (${bib.control_number}) 서지를 삭제하시겠습니까?\n` +
        '논리 삭제이므로 데이터는 보존됩니다.',
    )
    if (!ok) return
    setBusy(true)
    try {
      await deleteBib(bib.control_number)
      flashToast('success', '서지 삭제 완료')

      // 페이지 마지막 항목을 지웠다면 한 페이지 앞으로 이동
      const newTotal = Math.max(0, list.total - 1)
      const newLastPage = Math.max(1, Math.ceil(newTotal / PAGE_SIZE))
      if (page > newLastPage) {
        setPage(newLastPage) // useEffect가 fetch 트리거
      } else {
        await refresh()
      }
    } catch (err) {
      flashToast(
        'error',
        `삭제 실패: ${err.response?.data?.error || err.message}`,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">서지 관리</h2>
          <p className="text-sm text-slate-500 mt-1">
            전체 {list.total.toLocaleString()}건
          </p>
        </div>
        <button
          onClick={openNew}
          className="px-4 py-2 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition-colors"
        >
          + 새 서지 등록
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
        ) : list.data.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-500">
            등록된 서지가 없습니다.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500 bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left py-3 px-4">제어번호</th>
                  <th className="text-left py-3 px-4">제목</th>
                  <th className="text-left py-3 px-4">저자</th>
                  <th className="text-left py-3 px-4">출판년도</th>
                  <th className="text-left py-3 px-4">청구기호</th>
                  <th className="text-right py-3 px-4">관리</th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((b) => (
                  <tr
                    key={b.control_number}
                    className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                  >
                    <td className="py-3 px-4 font-mono text-slate-700">
                      {b.control_number}
                    </td>
                    <td className="py-3 px-4 text-slate-900">{b.title}</td>
                    <td className="py-3 px-4 text-slate-600">
                      {b.main_entry || '-'}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {b.pub_year || '-'}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">
                      {b.call_number || '-'}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        onClick={() => openEdit(b)}
                        disabled={busy}
                        className="px-3 py-1 text-xs border border-slate-300 rounded text-slate-700 hover:bg-slate-100 disabled:opacity-50 mr-1"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => handleDelete(b)}
                        disabled={busy}
                        className="px-3 py-1 text-xs border border-red-300 rounded text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />

      {editing && (
        <FormModal
          mode={editing.mode}
          initial={editing.initial}
          busy={busy}
          onCancel={() => setEditing(null)}
          onSubmit={handleSave}
        />
      )}
    </div>
  )
}
