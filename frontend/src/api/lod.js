import { apiClient } from './client'

// Linked Data Content Negotiation
// type: 'bib' | 'work' | 'agent' | 'instance' | 'item' | 'organization'
// format: 'application/ld+json' | 'text/turtle' | 'application/rdf+xml'
export function getLinkedData(type, id, format = 'application/ld+json') {
  return apiClient
    .get(
      `/resource/${encodeURIComponent(type)}/${encodeURIComponent(id)}`,
      {
        headers: { Accept: format },
        responseType: 'text',
        // 기본 JSON 파싱 비활성화 — 우리가 원하는 시점에 직접 파싱
        transformResponse: [(data) => data],
      },
    )
    .then((res) => {
      if (format.endsWith('+json') || format.endsWith('/json')) {
        try {
          return typeof res.data === 'string' ? JSON.parse(res.data) : res.data
        } catch {
          return res.data
        }
      }
      return res.data
    })
}
