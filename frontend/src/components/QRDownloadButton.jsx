import { useState } from 'react'
import QRCode from 'qrcode'

function slugifyForFilename(pathname) {
  const cleaned = pathname.replace(/^\/+|\/+$/g, '').replace(/\//g, '_')
  return cleaned || 'home'
}

export default function QRDownloadButton() {
  const [busy, setBusy] = useState(false)

  async function handleDownload() {
    if (busy) return
    setBusy(true)
    try {
      const url = window.location.href
      const dataUrl = await QRCode.toDataURL(url, {
        width: 1024,
        margin: 2,
        errorCorrectionLevel: 'M',
      })
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `qr_${slugifyForFilename(window.location.pathname)}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (err) {
      console.error('[QR] 생성 실패:', err)
      alert('QR 코드 생성에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={busy}
      title="이 화면의 QR 코드 다운로드"
      className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium px-3 py-1.5 rounded-md text-neutral-700 border border-neutral-200 hover:bg-neutral-100 disabled:opacity-50 transition-colors whitespace-nowrap"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-4 h-4"
        aria-hidden="true"
      >
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
        <path d="M14 14h3v3h-3zM20 14h1M14 20h1M20 20h1" />
      </svg>
      {busy ? '생성 중…' : 'QR 다운로드'}
    </button>
  )
}
