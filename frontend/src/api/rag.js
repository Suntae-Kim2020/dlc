import { apiClient } from './client'

// Claude RAG 자연어 검색 — { question }
export function ragSearch(question) {
  return apiClient
    .post('/api/v1/rag/search', { question })
    .then((res) => res.data)
}
