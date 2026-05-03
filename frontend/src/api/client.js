import axios from 'axios'

import { getAdminToken } from '../config'

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'

export const apiClient = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
})

// 활성 모드 토큰이 있으면 모든 요청에 자동 첨부
apiClient.interceptors.request.use((config) => {
  const token = getAdminToken()
  if (token) {
    config.headers['X-Admin-Token'] = token
  }
  return config
})

export default apiClient
