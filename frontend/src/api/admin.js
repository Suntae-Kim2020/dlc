import { apiClient } from './client'
import { getAdminToken } from '../config'

// 활성 모드 전환을 위한 비밀번호 검증
export function unlock(password) {
  return apiClient
    .post('/api/v1/admin/unlock', { password })
    .then((res) => res.data)
}

// 토큰 유효성 확인 (선택)
export function verify() {
  return apiClient.post('/api/v1/admin/verify').then((res) => res.data)
}

// =====================================================
// OAI 수확
// =====================================================

export function getHarvestState() {
  return apiClient.get('/api/v1/admin/harvest/state').then((r) => r.data)
}

export function getHarvestHistory(limit = 20) {
  return apiClient
    .get('/api/v1/admin/harvest/history', { params: { limit } })
    .then((r) => r.data)
}

export function startHarvest() {
  return apiClient.post('/api/v1/admin/harvest/run').then((r) => r.data)
}

// SSE 스트림 — EventSource 는 커스텀 헤더를 못 보내므로 토큰을 쿼리스트링으로 전달
// (백엔드가 query.token 도 받도록 별도 처리 — 또는 같은 origin 이면 쿠키 사용)
// 단순화: requireAdmin 이 헤더만 검증하므로 fetch + ReadableStream 으로 직접 SSE 파싱
export function openHarvestStream(jobId, { onEvent, onClose, onError }) {
  const baseURL =
    import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'
  const token = getAdminToken()

  const controller = new AbortController()

  fetch(`${baseURL}/api/v1/admin/harvest/stream/${jobId}`, {
    method: 'GET',
    headers: {
      Accept: 'text/event-stream',
      ...(token ? { 'X-Admin-Token': token } : {}),
    },
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok || !res.body) {
        throw new Error(`SSE 연결 실패: HTTP ${res.status}`)
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        // SSE 프레임은 빈 줄(\n\n)로 구분
        let idx
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const frame = buf.slice(0, idx)
          buf = buf.slice(idx + 2)
          // data: 라인 추출 (주석 ': keepalive' 등은 무시)
          const dataLine = frame
            .split('\n')
            .find((l) => l.startsWith('data:'))
          if (!dataLine) continue
          const json = dataLine.slice('data:'.length).trim()
          try {
            const event = JSON.parse(json)
            onEvent?.(event)
          } catch {
            /* malformed frame — ignore */
          }
        }
      }
      onClose?.()
    })
    .catch((err) => {
      if (err.name === 'AbortError') return
      onError?.(err)
    })

  return () => controller.abort()
}
