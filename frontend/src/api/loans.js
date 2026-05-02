import { apiClient } from './client'

// 특정 이용자의 대출 현황
export function getUserLoans(userId) {
  return apiClient.get(`/api/loans/user/${userId}`).then((res) => res.data)
}

// 대출 처리 — { item_id, user_id, due_date }
export function createLoan(data) {
  return apiClient.post('/api/loans', data).then((res) => res.data)
}

// 반납 처리
export function returnLoan(loanId) {
  return apiClient.put(`/api/loans/${loanId}/return`).then((res) => res.data)
}

// 연체 목록
export function getOverdue() {
  return apiClient.get('/api/loans/overdue').then((res) => res.data)
}
