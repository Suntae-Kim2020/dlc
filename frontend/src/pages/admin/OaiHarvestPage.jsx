import { useEffect, useRef, useState } from 'react'

import {
  getHarvestHistory,
  getHarvestState,
  openHarvestStream,
  startHarvest,
} from '../../api/admin'

const STATUS_BADGE = {
  running: 'bg-amber-100 text-amber-800 border-amber-200',
  success: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  partial: 'bg-amber-100 text-amber-800 border-amber-200',
  failed: 'bg-red-100 text-red-800 border-red-200',
}

const STATUS_LABEL = {
  running: '실행 중',
  success: '성공',
  partial: '일부 오류',
  failed: '실패',
}

const TRIGGER_LABEL = {
  manual: '수동',
  cron: '자동',
  dev_migration: '개발 마이그레이션',
}

function fmt(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function ProgressBar({ percent, label, sublabel }) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)))
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-sm font-medium text-neutral-900">{label}</p>
        <p className="text-sm font-mono text-neutral-600">{pct}%</p>
      </div>
      <div className="h-2 w-full bg-neutral-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-emerald-500 transition-all duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      {sublabel && (
        <p className="text-xs text-neutral-500 mt-1.5 truncate font-mono">
          {sublabel}
        </p>
      )}
    </div>
  )
}

function PhasePill({ active, done, label }) {
  const cls = done
    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
    : active
      ? 'bg-indigo-100 text-indigo-800 border-indigo-300 animate-pulse'
      : 'bg-neutral-50 text-neutral-400 border-neutral-200'
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${cls}`}
    >
      {label}
    </span>
  )
}

export default function OaiHarvestPage() {
  const [state, setState] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(null) // { phase, current, total, identifier, counts }

  const closeStreamRef = useRef(null)

  async function refresh() {
    setError(null)
    try {
      const [s, h] = await Promise.all([
        getHarvestState(),
        getHarvestHistory(20),
      ])
      setState(s)
      setHistory(h.data || [])
      // 새로고침 시 활성 작업 있으면 자동 구독
      if (s.activeJobId && !running) {
        attachStream(s.activeJobId)
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    return () => {
      closeStreamRef.current?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function attachStream(jobId) {
    setRunning(true)
    setProgress({ phase: 'connecting', jobId })
    closeStreamRef.current?.()
    closeStreamRef.current = openHarvestStream(jobId, {
      onEvent: (ev) => {
        setProgress((prev) => ({ ...prev, ...ev }))
        if (ev.phase === 'exit' || ev.phase === 'closed') {
          setRunning(false)
          // 종료 후 이력/상태 갱신
          refresh()
        }
      },
      onClose: () => {
        setRunning(false)
        refresh()
      },
      onError: (err) => {
        setError(`스트림 오류: ${err.message}`)
        setRunning(false)
      },
    })
  }

  async function handleStart() {
    setError(null)
    try {
      const { jobId } = await startHarvest()
      attachStream(jobId)
    } catch (err) {
      const status = err.response?.status
      if (status === 409) {
        setError('이미 다른 수확 작업이 실행 중입니다. 잠시 후 다시 시도하세요.')
      } else if (status === 403) {
        setError('활성 모드 인증이 필요합니다 (헤더의 토글로 전환).')
      } else {
        setError(err.response?.data?.error || err.message)
      }
    }
  }

  // 진행률 계산
  const current = progress?.current ?? 0
  const total = progress?.total ?? state?.lastFinished?.total ?? 20
  const percent = total > 0 ? (current / total) * 100 : 0

  const phase = progress?.phase
  const phaseLabel =
    {
      starting: '준비',
      basex_ready: 'BaseX 연결됨',
      page_received: 'OAI 페이지 수신',
      record_start: '레코드 처리 중',
      record_done: '레코드 저장 완료',
      finished: '완료',
      failed: '실패',
      exit: progress?.ok ? '완료' : '실패',
      closed: '종료',
      connecting: '연결 중',
    }[phase] || '대기'

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-neutral-900">OAI 수확</h2>
        <p className="text-sm text-neutral-500 mt-1">
          arXiv OAI-PMH (cs 카테고리) → PostgreSQL · Elasticsearch · BaseX 동시 적재
        </p>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 1. 상태 + 시작 버튼 */}
      <section className="grid gap-4 md:grid-cols-3">
        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <p className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
            마지막 수확 시작일
          </p>
          <p className="text-xl font-semibold text-neutral-900">
            {state?.lastHarvestDate || '—'}
          </p>
          <p className="text-xs text-neutral-400 mt-1">
            다음 수확은 이 날짜 이후 변경분만
          </p>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <p className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
            마지막 실행 결과
          </p>
          {state?.lastFinished ? (
            <>
              <p className="text-xl font-semibold text-neutral-900">
                {state.lastFinished.harvested ?? 0}건
                {state.lastFinished.errors > 0 && (
                  <span className="text-sm text-red-600 ml-2">
                    오류 {state.lastFinished.errors}
                  </span>
                )}
              </p>
              <p className="text-xs text-neutral-400 mt-1">
                {fmt(state.lastFinished.finished_at)}
              </p>
            </>
          ) : (
            <p className="text-xl font-semibold text-neutral-400">—</p>
          )}
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-5 flex flex-col">
          <p className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
            자동 스케줄
          </p>
          <p className="text-base font-semibold text-neutral-900 flex-1">
            {state?.schedule || '매일 03:00 KST'}
          </p>
          <button
            type="button"
            onClick={handleStart}
            disabled={running || loading}
            className="mt-3 px-4 py-2 bg-neutral-900 text-white text-sm font-medium rounded-md hover:bg-neutral-800 disabled:opacity-50 transition-colors"
          >
            {running ? '수확 중…' : '지금 수확 시작'}
          </button>
        </div>
      </section>

      {/* 2. 진행 상황 */}
      {(running || progress) && (
        <section className="bg-white border border-neutral-200 rounded-xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-neutral-900">
              진행 상황 (작업 #{progress?.jobId})
            </h3>
            <span
              className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium border ${
                running
                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : phase === 'failed' || progress?.ok === false
                    ? 'bg-red-50 text-red-700 border-red-200'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}
            >
              {phaseLabel}
            </span>
          </div>

          <ProgressBar
            percent={percent}
            label={`레코드 ${current} / ${total}`}
            sublabel={
              progress?.identifier
                ? `처리 중: ${progress.identifier}${
                    progress.title ? ` — ${progress.title}` : ''
                  }`
                : null
            }
          />

          {/* 단계 표시 */}
          <div className="flex flex-wrap gap-2">
            <PhasePill
              done={!!progress && progress.phase !== 'starting'}
              active={phase === 'starting'}
              label="시작"
            />
            <PhasePill
              done={['page_received', 'record_start', 'record_done', 'finished'].includes(
                phase,
              )}
              active={phase === 'basex_ready'}
              label="BaseX 준비"
            />
            <PhasePill
              done={['record_start', 'record_done', 'finished'].includes(phase)}
              active={phase === 'page_received'}
              label="OAI 페이지"
            />
            <PhasePill
              done={phase === 'finished'}
              active={['record_start', 'record_done'].includes(phase)}
              label="레코드 저장"
            />
            <PhasePill
              done={phase === 'finished' || phase === 'exit'}
              active={false}
              label="완료"
            />
          </div>

          {/* 적재 카운트 */}
          {progress?.counts && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-neutral-100">
              <Counter label="PG 적재" value={progress.counts.pg} color="emerald" />
              <Counter label="ES 색인" value={progress.counts.es} color="emerald" />
              <Counter
                label="BaseX 저장"
                value={progress.counts.basex}
                color="emerald"
              />
              <Counter
                label="오류"
                value={progress.counts.errors}
                color={progress.counts.errors > 0 ? 'red' : 'neutral'}
              />
            </div>
          )}
        </section>
      )}

      {/* 3. 수확 이력 */}
      <section>
        <h3 className="text-lg font-semibold text-neutral-900 mb-3">최근 이력</h3>
        {loading ? (
          <p className="text-sm text-neutral-400 py-8 text-center">
            불러오는 중…
          </p>
        ) : history.length === 0 ? (
          <p className="text-sm text-neutral-500 py-8 text-center">
            아직 수확 이력이 없습니다.
          </p>
        ) : (
          <div className="overflow-x-auto bg-white border border-neutral-200 rounded-xl">
            <table className="w-full text-sm">
              <thead className="text-xs text-neutral-500 bg-neutral-50 border-b border-neutral-200">
                <tr>
                  <th className="text-left py-2.5 px-4 font-medium">#</th>
                  <th className="text-left py-2.5 px-4 font-medium">시작</th>
                  <th className="text-left py-2.5 px-4 font-medium">완료</th>
                  <th className="text-left py-2.5 px-4 font-medium">트리거</th>
                  <th className="text-left py-2.5 px-4 font-medium">상태</th>
                  <th className="text-right py-2.5 px-4 font-medium">건수</th>
                  <th className="text-right py-2.5 px-4 font-medium">PG</th>
                  <th className="text-right py-2.5 px-4 font-medium">ES</th>
                  <th className="text-right py-2.5 px-4 font-medium">BaseX</th>
                  <th className="text-right py-2.5 px-4 font-medium">오류</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr
                    key={h.id}
                    className="border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50"
                  >
                    <td className="py-2.5 px-4 font-mono text-xs text-neutral-400">
                      {h.id}
                    </td>
                    <td className="py-2.5 px-4 text-neutral-700 whitespace-nowrap">
                      {fmt(h.started_at)}
                    </td>
                    <td className="py-2.5 px-4 text-neutral-700 whitespace-nowrap">
                      {fmt(h.finished_at)}
                    </td>
                    <td className="py-2.5 px-4 text-neutral-600">
                      {TRIGGER_LABEL[h.triggered_by] || h.triggered_by}
                    </td>
                    <td className="py-2.5 px-4">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${
                          STATUS_BADGE[h.status] ||
                          'bg-neutral-100 text-neutral-700 border-neutral-200'
                        }`}
                      >
                        {STATUS_LABEL[h.status] || h.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono">
                      {h.harvested}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-neutral-600">
                      {h.pg_ok}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-neutral-600">
                      {h.es_ok}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-neutral-600">
                      {h.basex_ok}
                    </td>
                    <td
                      className={`py-2.5 px-4 text-right font-mono ${
                        h.errors > 0 ? 'text-red-600' : 'text-neutral-400'
                      }`}
                    >
                      {h.errors}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function Counter({ label, value, color }) {
  const cls =
    color === 'emerald'
      ? 'text-emerald-700'
      : color === 'red'
        ? 'text-red-600'
        : 'text-neutral-700'
  return (
    <div>
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={`text-2xl font-bold ${cls}`}>{value ?? 0}</p>
    </div>
  )
}
