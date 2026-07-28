const express = require("express");
const cheerio = require("cheerio");

const app = express();
const PORT = process.env.PORT || 3000;

const BASE_LIST_URL = "https://www.vitnara.co.kr/part/thegrace9/thegrace9.html";
const BASE_DETAIL_ROOT = "https://www.vitnara.co.kr/part/thegrace9/thegrace9/";
const DETAIL_LINK_REGEX = /(?:^|\/)\d{2}\.html$/i;
const YOUTUBE_ID_REGEX =
  /(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;

let cache = {
  updatedAt: 0,
  items: [],
};
const CACHE_TTL_MS = 10 * 60 * 1000;

function normalizeYoutubeId(input) {
  if (!input || typeof input !== "string") {
    return null;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  // 이미 ID(11자리)만 입력한 경우도 허용
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);

    if (url.hostname.includes("youtu.be")) {
      return url.pathname.replace("/", "").slice(0, 11) || null;
    }

    if (url.hostname.includes("youtube.com")) {
      const v = url.searchParams.get("v");
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) {
        return v;
      }

      const embedMatch = url.pathname.match(/\/embed\/([a-zA-Z0-9_-]{11})/i);
      if (embedMatch) {
        return embedMatch[1];
      }
    }
  } catch (_error) {
    // URL 파싱 실패 시 정규식 기반 추출로 폴백
  }

  const match = trimmed.match(YOUTUBE_ID_REGEX);
  return match ? match[1] : null;
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`요청 실패: ${url} (${response.status})`);
  }
  return response.text();
}

async function collectDetailLinks() {
  const html = await fetchText(BASE_LIST_URL);
  const $ = cheerio.load(html);
  const links = new Set();

  $("a[href]").each((_idx, el) => {
    const href = $(el).attr("href");
    if (!href) return;

    const normalized = href.trim();
    if (DETAIL_LINK_REGEX.test(normalized)) {
      const absolute = new URL(normalized, BASE_DETAIL_ROOT).toString();
      if (absolute.includes("/part/thegrace9/thegrace9/")) {
        links.add(absolute);
      }
    }
  });

  return [...links];
}

async function extractYoutubeIdFromDetail(detailUrl) {
  const html = await fetchText(detailUrl);
  const $ = cheerio.load(html);

  let foundId = null;

  $("a[href], iframe[src], img[src]").each((_idx, el) => {
    if (foundId) return;

    const href = $(el).attr("href");
    const src = $(el).attr("src");
    const candidate = href || src || "";
    const match = candidate.match(YOUTUBE_ID_REGEX);
    if (match) {
      foundId = match[1];
    }
  });

  return foundId;
}

async function buildIndex() {
  const detailUrls = await collectDetailLinks();
  const items = [];

  for (const detailUrl of detailUrls) {
    try {
      const youtubeId = await extractYoutubeIdFromDetail(detailUrl);
      if (youtubeId) {
        items.push({ youtubeId, detailUrl });
      }
    } catch (_error) {
      // 일부 페이지 실패는 전체 매칭 기능에 치명적이지 않으므로 건너뜀
    }
  }

  cache = {
    updatedAt: Date.now(),
    items,
  };

  return items;
}

async function getIndex() {
  const isExpired = Date.now() - cache.updatedAt > CACHE_TTL_MS;
  if (!cache.items.length || isExpired) {
    return buildIndex();
  }
  return cache.items;
}

app.use(express.static("public"));

app.get("/api/match", async (req, res) => {
  try {
    const youtubeUrl = req.query.youtubeUrl;
    const youtubeId = normalizeYoutubeId(youtubeUrl);

    if (!youtubeId) {
      return res.status(400).json({
        ok: false,
        message: "유효한 유튜브 주소(또는 영상 ID)를 입력해 주세요.",
      });
    }

    const items = await getIndex();
    const found = items.find((item) => item.youtubeId === youtubeId);

    if (!found) {
      return res.status(404).json({
        ok: false,
        message: "일치하는 파트연습 상세페이지를 찾지 못했습니다.",
      });
    }

    return res.json({
      ok: true,
      youtubeId: found.youtubeId,
      detailUrl: found.detailUrl,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "매칭 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
