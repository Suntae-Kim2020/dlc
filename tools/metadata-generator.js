const Anthropic = require("@anthropic-ai/sdk");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../backend/.env") });

const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

async function generateMetadata(title, creator) {
  const prompt = `아래 책의 Dublin Core 메타데이터를 JSON으로 생성해줘.
title, creator, subject(3개), description(2문장), language, type 항목을 포함해줘.

책 제목: ${title}
저자: ${creator}

반드시 아래 JSON 형식만 출력하고, 다른 텍스트는 포함하지 마.
{
  "dc:title": "",
  "dc:creator": "",
  "dc:subject": ["", "", ""],
  "dc:description": "",
  "dc:language": "",
  "dc:type": ""
}`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].text.trim();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Claude 응답에서 JSON을 추출할 수 없습니다:\n" + text);
  }

  return JSON.parse(jsonMatch[0]);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error("사용법: node metadata-generator.js <책제목> <저자>");
    console.error('예시:  node metadata-generator.js "정보검색론" "정영미"');
    process.exit(1);
  }

  const [title, creator] = args;

  if (!process.env.CLAUDE_API_KEY || process.env.CLAUDE_API_KEY === "your_api_key_here") {
    console.error("오류: backend/.env의 CLAUDE_API_KEY를 설정해주세요.");
    process.exit(1);
  }

  console.log(`\n도서 정보: "${title}" / ${creator}`);
  console.log("Dublin Core 메타데이터 생성 중...\n");

  const metadata = await generateMetadata(title, creator);

  console.log("========== Dublin Core 메타데이터 ==========");
  console.log(JSON.stringify(metadata, null, 2));
  console.log("=============================================");
  console.log(
    "\n⚠ 주의: AI가 생성한 메타데이터입니다. " +
    "정확성을 보장하지 않으므로 반드시 사서의 검수를 거친 후 사용하시기 바랍니다.\n"
  );
}

main().catch((err) => {
  console.error("오류 발생:", err.message);
  process.exit(1);
});
