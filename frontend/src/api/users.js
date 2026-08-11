import { apiClient } from './client'

// 이용자 조회
export function getUser(id) {
  return apiClient.get(`/api/users/${id}`).then((res) => res.data)
}

// 이용자 등록
export function createUser(data) {
  return apiClient.post('/api/users', data).then((res) => res.data)
}

// 이용자 목록 (페이징 + 키워드 검색)
export function getUsers({ page = 1, limit = 20, q = '' } = {}) {
  return apiClient
    .get('/api/v1/users', { params: { page, limit, q } })
    .then((res) => res.data)
}
