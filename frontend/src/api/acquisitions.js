import { apiClient } from './client'

// 수서(구입 신청) 목록
export function getAcquisitions() {
  return apiClient.get('/api/acquisitions').then((res) => res.data)
}

// 구입 신청 등록
export function createAcquisition(data) {
  return apiClient.post('/api/acquisitions', data).then((res) => res.data)
}

// 수서 수령 처리
export function receiveAcquisition(id) {
  return apiClient
    .put(`/api/acquisitions/${id}/receive`)
    .then((res) => res.data)
}
