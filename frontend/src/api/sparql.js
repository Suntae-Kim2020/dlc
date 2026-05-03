import { apiClient } from './client'

// SPARQL SELECT/ASK/DESCRIBE/CONSTRUCT
export function sparqlQuery(query, accept = 'application/sparql-results+json') {
  return apiClient
    .post('/api/v1/sparql/query', { query }, {
      headers: { Accept: accept },
      // 응답이 JSON이 아닐 수 있어 (Turtle/RDF-XML) raw text로 받음
      responseType: 'text',
      transformResponse: [(data) => data],
    })
    .then((res) => ({
      contentType: res.headers['content-type'] || '',
      body: res.data,
    }))
}
