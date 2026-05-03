import { apiClient } from './client'

// Claude RAG — 활성 모드일 때만 동작
// (X-Admin-Token 헤더는 client.js의 인터셉터가 자동 첨부)
export function ragSearch(question) {
  return apiClient
    .post('/api/v1/rag/search', { question })
    .then((res) => res.data)
}
