import { apiClient } from './client'

// Claude RAG 자연어 검색 — { question, password? }
// password는 운영 환경에서만 필요 (READ_ONLY 모드 + RAG_PASSWORD 설정 시)
export function ragSearch(question, password) {
  const headers = password ? { 'X-RAG-Password': password } : undefined
  return apiClient
    .post('/api/v1/rag/search', { question }, { headers })
    .then((res) => res.data)
}
