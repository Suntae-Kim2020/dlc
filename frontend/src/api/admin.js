import { apiClient } from './client'

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
