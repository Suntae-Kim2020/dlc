// 운영(데모) 환경에선 .env.production에 VITE_READ_ONLY=true 설정
// 빌드 시점에 인라인 치환됨 (런타임 변경 불가)
export const READ_ONLY = import.meta.env.VITE_READ_ONLY === 'true'
