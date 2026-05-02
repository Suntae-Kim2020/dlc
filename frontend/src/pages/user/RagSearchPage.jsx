export default function RagSearchPage() {
  return (
    <section>
      <h1 className="text-3xl font-bold text-slate-900 mb-4">AI 자연어 검색</h1>
      <p className="text-slate-600">
        Claude RAG 엔드포인트(<code className="font-mono">/api/v1/rag/search</code>)에
        질문을 던져 답변과 참고자료를 얻는 화면이 들어갑니다.
      </p>
    </section>
  )
}
