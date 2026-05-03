// 빌드 시점에 박힌 데모 모드 플래그
const DEMO_BUILD = import.meta.env.VITE_READ_ONLY === 'true'

const TOKEN_KEY = 'adminToken'

// 활성 모드 인증 여부 — sessionStorage의 admin 토큰으로 판단
export function isAdmin() {
  return Boolean(sessionStorage.getItem(TOKEN_KEY))
}

// 현재 데모 모드인지 — 빌드가 데모 + 활성 인증 안 됨
export function isReadOnly() {
  return DEMO_BUILD && !isAdmin()
}

// 빌드 자체가 데모 빌드인지 (배지 표시용)
export function isDemoBuild() {
  return DEMO_BUILD
}

export function getAdminToken() {
  return sessionStorage.getItem(TOKEN_KEY) || null
}

export function setAdminToken(token) {
  sessionStorage.setItem(TOKEN_KEY, token)
}

export function clearAdminToken() {
  sessionStorage.removeItem(TOKEN_KEY)
}

// 호환성 — 일부 코드가 아직 import { READ_ONLY } 형태로 쓸 경우
// (런타임 호출 결과 — true/false 값으로 export)
export const READ_ONLY = isReadOnly()
