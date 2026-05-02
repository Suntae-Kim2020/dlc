import { apiClient } from './client'

// 서지 목록 — /api/bibs (페이지네이션)
export function getBibs(page = 1, size = 20) {
  return apiClient
    .get('/api/bibs', { params: { page, limit: size } })
    .then((res) => res.data)
}

// 서지 상세 (MARC 필드, 저자, 주제 포함)
export function getBib(id) {
  return apiClient.get(`/api/bibs/${id}`).then((res) => res.data)
}

// 통합 검색 — Elasticsearch 기반
export function searchBibs(q, params = {}) {
  return apiClient
    .get('/api/v1/search', { params: { q, ...params } })
    .then((res) => res.data)
}

// 신규 등록
export function createBib(data) {
  return apiClient.post('/api/bibs', data).then((res) => res.data)
}

// 수정
export function updateBib(id, data) {
  return apiClient.put(`/api/bibs/${id}`, data).then((res) => res.data)
}

// 논리 삭제
export function deleteBib(id) {
  return apiClient.delete(`/api/bibs/${id}`).then((res) => res.data)
}

// 서지의 소장 항목(items) — 백엔드에 미구현일 경우 빈 배열로 graceful degrade
export function getBibItems(id) {
  return apiClient
    .get(`/api/bibs/${id}/items`)
    .then((res) => res.data)
    .catch((err) => {
      if (err.response && [404, 501].includes(err.response.status)) return []
      throw err
    })
}
