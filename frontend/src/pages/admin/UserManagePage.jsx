import { useEffect, useState } from 'react'

import { createUser, getUser, getUsers } from '../../api/users'

const USER_TYPES = [
  { value: 'student', label: '학생' },
  { value: 'faculty', label: '교원' },
  { value: 'staff', label: '직원' },
]

const STATUS_META = {
  active: { label: '활성', color: 'bg-emerald-100 text-emerald-700' },
  suspended: { label: '정지', color: 'bg-red-100 text-red-700' },
  inactive: { label: '비활성', color: 'bg-slate-100 text-slate-600' },
}

const EMPTY_FORM = {
  user_number: '',
  name: '',
  email: '',
  phone: '',
  affiliation: '',
  user_type: 'student',
}

function Field({
  label,
  name,
  value,
  onChange,
  type = 'text',
  required,
  mono,
  placeholder,
}) {
  return (
    <div>
      <label className="block text-sm text-slate-700 mb-1">{label}</label>
      <input
        type={type}
        name={name}
        value={value ?? ''}
        onChange={onChange}
        required={required}
        placeholder={placeholder}
        className={[
          'w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent',
          mono ? 'font-mono' : '',
        ].join(' ')}
      />
    </div>
  )
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

function UserTypeBadge({ type }) {
  const meta = USER_TYPES.find((t) => t.value === type)
  return (
    <span className="inline-block px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-700">
      {meta ? meta.label : type || '-'}
    </span>
  )
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

export default function UserManagePage() {
  // 조회
  const [searchId, setSearchId] = useState('')
  const [user, setUser] = useState(null)
  const [searchLoading, setSearchLoading] = useState(false)

  // 목록
  const [list, setList] = useState([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState(null)
  const [listQuery, setListQuery] = useState('')
  const [listTotal, setListTotal] = useState(0)

  // 등록
  const [form, setForm] = useState(EMPTY_FORM)
  const [createBusy, setCreateBusy] = useState(false)

  const [toast, setToast] = useState(null)

  async function loadList(q = '') {
    setListLoading(true)
    setListError(null)
    try {
      const data = await getUsers({ q, limit: 20 })
      setList(data.data || [])
      setListTotal(data.total || 0)
    } catch (err) {
      setListError(err.response?.data?.error || err.message)
    } finally {
      setListLoading(false)
    }
  }

  useEffect(() => {
    loadList('')
  }, [])

  function flashToast(type, message) {
    setToast({ type, message })
    window.setTimeout(() => setToast(null), 4000)
  }

  async function handleSearch(e) {
    e.preventDefault()
    const id = searchId.trim()
    if (!id) return
    setSearchLoading(true)
    setUser(null)
    try {
      const data = await getUser(id)
      setUser(data)
    } catch (err) {
      const status = err.response?.status
      if (status === 404) {
        flashToast('error', `이용자 #${id}를 찾을 수 없습니다.`)
      } else {
        flashToast('error', err.response?.data?.error || err.message)
      }
    } finally {
      setSearchLoading(false)
    }
  }

  function handleFormChange(e) {
    const { name, value } = e.target
    setForm((p) => ({ ...p, [name]: value }))
  }

  async function handleCreate(e) {
    e.preventDefault()
    setCreateBusy(true)
    try {
      const payload = {
        user_number: form.user_number,
        name: form.name,
        email: form.email,
        phone: form.phone || null,
        affiliation: form.affiliation || null,
        user_type: form.user_type,
      }
      const result = await createUser(payload)
      flashToast(
        'success',
        `이용자 등록 완료${result?.id ? ` (#${result.id})` : ''}`,
      )
      setForm(EMPTY_FORM)
      loadList(listQuery)
    } catch (err) {
      flashToast('error', err.response?.data?.error || err.message)
    } finally {
      setCreateBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">이용자 관리</h2>
        <p className="text-sm text-slate-500 mt-1">
          이용자 조회와 등록을 처리합니다.
        </p>
      </div>

      {toast && (
        <div
          className={`px-4 py-3 rounded text-sm ${
            toast.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* 0. 이용자 목록 */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900">
            이용자 목록{' '}
            <span className="text-sm font-normal text-slate-500">
              (총 {listTotal}명)
            </span>
          </h3>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              loadList(listQuery)
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={listQuery}
              onChange={(e) => setListQuery(e.target.value)}
              placeholder="이름·학번·이메일"
              className="px-3 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
            />
            <button
              type="submit"
              className="px-3 py-1.5 text-sm bg-slate-900 text-white rounded hover:bg-slate-800"
            >
              검색
            </button>
          </form>
        </div>

        {listError && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded">
            {listError}
          </p>
        )}

        {listLoading ? (
          <p className="text-sm text-slate-400 py-6 text-center">
            불러오는 중…
          </p>
        ) : list.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center">
            이용자가 없습니다.
          </p>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500 bg-slate-50 border-y border-slate-200">
                <tr>
                  <th className="text-left py-2 px-3 font-medium">#</th>
                  <th className="text-left py-2 px-3 font-medium">학번/번호</th>
                  <th className="text-left py-2 px-3 font-medium">이름</th>
                  <th className="text-left py-2 px-3 font-medium">소속</th>
                  <th className="text-left py-2 px-3 font-medium">유형</th>
                  <th className="text-left py-2 px-3 font-medium">상태</th>
                  <th className="text-left py-2 px-3 font-medium">가입일</th>
                </tr>
              </thead>
              <tbody>
                {list.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50 cursor-pointer"
                    onClick={() => {
                      setSearchId(String(u.id))
                      getUser(u.id).then(setUser).catch(() => {})
                    }}
                  >
                    <td className="py-2 px-3 font-mono text-xs text-slate-400">
                      {u.id}
                    </td>
                    <td className="py-2 px-3 font-mono text-slate-700">
                      {u.user_number}
                    </td>
                    <td className="py-2 px-3 font-medium text-slate-900">
                      {u.name}
                    </td>
                    <td className="py-2 px-3 text-slate-600">
                      {u.affiliation || '-'}
                    </td>
                    <td className="py-2 px-3">
                      <UserTypeBadge type={u.user_type} />
                    </td>
                    <td className="py-2 px-3">
                      <StatusBadge status={u.status} />
                    </td>
                    <td className="py-2 px-3 font-mono text-xs text-slate-500">
                      {u.join_date && String(u.join_date).slice(0, 10)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 1. 이용자 조회 */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">이용자 조회</h3>

        <form onSubmit={handleSearch} className="flex gap-2 mb-4">
          <input
            type="number"
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            placeholder="이용자 ID (예: 1)"
            required
            className="flex-1 px-4 py-2 text-base text-slate-900 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
          />
          <button
            type="submit"
            disabled={searchLoading}
            className="px-6 py-2 bg-slate-900 text-white rounded font-medium hover:bg-slate-800 disabled:opacity-50"
          >
            {searchLoading ? '조회 중…' : '조회'}
          </button>
        </form>

        {user && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-lg font-semibold text-slate-900">
                  {user.name}
                </p>
                <p className="text-sm text-slate-500 font-mono">
                  #{user.id} · {user.user_number || '-'}
                </p>
              </div>
              <div className="flex gap-2">
                <UserTypeBadge type={user.user_type} />
                <StatusBadge status={user.status} />
              </div>
            </div>

            <dl>
              <InfoRow label="이메일" value={user.email} />
              <InfoRow label="전화번호" value={user.phone} />
              <InfoRow label="소속" value={user.affiliation} />
              <InfoRow
                label="가입일"
                value={user.created_at && String(user.created_at).slice(0, 10)}
                mono
              />
            </dl>
          </div>
        )}
      </section>

      {/* 2. 이용자 등록 */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">이용자 등록</h3>

        <form onSubmit={handleCreate}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field
              label="이용자번호 *"
              name="user_number"
              value={form.user_number}
              onChange={handleFormChange}
              required
              mono
              placeholder="예: 2026010001"
            />
            <Field
              label="이름 *"
              name="name"
              value={form.name}
              onChange={handleFormChange}
              required
            />
            <Field
              label="이메일 *"
              name="email"
              type="email"
              value={form.email}
              onChange={handleFormChange}
              required
              placeholder="example@univ.ac.kr"
            />
            <Field
              label="전화번호"
              name="phone"
              value={form.phone}
              onChange={handleFormChange}
              placeholder="010-1234-5678"
            />
            <Field
              label="소속"
              name="affiliation"
              value={form.affiliation}
              onChange={handleFormChange}
              placeholder="문헌정보학과"
            />
            <div>
              <label className="block text-sm text-slate-700 mb-1">
                이용자유형
              </label>
              <select
                name="user_type"
                value={form.user_type}
                onChange={handleFormChange}
                className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent bg-white"
              >
                {USER_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label} ({t.value})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end mt-6 pt-4 border-t border-slate-100">
            <button
              type="submit"
              disabled={createBusy}
              className="px-6 py-2 bg-slate-900 text-white rounded font-medium hover:bg-slate-800 disabled:opacity-50"
            >
              {createBusy ? '등록 중…' : '등록'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
