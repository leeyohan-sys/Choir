const fs = require("fs/promises");
const path = require("path");
const cheerio = require("cheerio");
const iconv = require("iconv-lite");

const BASE_LIST_URL = "https://www.vitnara.co.kr/part/thegrace9/thegrace9.html";
const BASE_DETAIL_ROOT = "https://www.vitnara.co.kr/part/thegrace9/thegrace9/";
const DETAIL_LINK_REGEX = /(?:^|\/)\d{2}\.html$/i;
const YOUTUBE_ID_REGEX =
  /(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`요청 실패: ${url} (${response.status})`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const head = buffer.toString("ascii");
  const charsetMatch = head.match(/charset\s*=\s*["']?([\w-]+)/i);
  const charset = (charsetMatch?.[1] || "utf-8").toLowerCase();

  if (charset === "euc-kr" || charset === "euc_kr") {
    return iconv.decode(buffer, "euc-kr");
  }

  return buffer.toString("utf8");
}

function normalizeTitle(inputValue) {
  return inputValue.trim().replace(/\s+/g, " ").toLowerCase();
}

function toSearchableText(inputValue) {
  return inputValue.replace(/[^0-9a-zA-Z가-힣]/g, "").toLowerCase();
}

function normalizeDetailUrl(url) {
  return url.replace("https://www.vitnara.co.kr//", "https://www.vitnara.co.kr/");
}

async function collectDetailLinks() {
  const html = await fetchText(BASE_LIST_URL);
  const $ = cheerio.load(html);
  const links = new Map();

  $("a[href]").each((_idx, el) => {
    const href = ($(el).attr("href") || "").trim();
    if (!DETAIL_LINK_REGEX.test(href)) return;

    const absolute = normalizeDetailUrl(new URL(href, BASE_DETAIL_ROOT).toString());
    if (!absolute.includes("/part/thegrace9/thegrace9/")) return;

    const title = $(el).text().replace(/\s+/g, " ").trim();
    if (title) {
      links.set(absolute, title);
    }
  });

  return [...links.entries()].map(([detailUrl, title]) => ({ detailUrl, title }));
}

async function extractYoutubeId(detailUrl) {
  const html = await fetchText(detailUrl);
  const $ = cheerio.load(html);
  let foundId = null;

  $("a[href], iframe[src], img[src]").each((_idx, el) => {
    if (foundId) return;
    const candidate = $(el).attr("href") || $(el).attr("src") || "";
    const match = candidate.match(YOUTUBE_ID_REGEX);
    if (match) {
      foundId = match[1];
    }
  });

  return foundId;
}

async function main() {
  const detailLinks = await collectDetailLinks();
  const items = [];

  for (const { detailUrl, title } of detailLinks) {
    try {
      const youtubeId = await extractYoutubeId(detailUrl);
      if (youtubeId) {
        items.push({
          youtubeId,
          detailUrl,
          title,
          normalizedTitle: normalizeTitle(title),
          searchableTitle: toSearchableText(title),
        });
      }
    } catch (_error) {
      // 일부 페이지 실패는 전체 인덱스 생성 실패로 보지 않고 건너뜀
    }
  }

  const payload = {
    source: BASE_LIST_URL,
    updatedAt: new Date().toISOString(),
    count: items.length,
    items,
  };

  const outputPath = path.join(__dirname, "..", "public", "mapping.json");
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`mapping.json 생성 완료: ${items.length}건`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
