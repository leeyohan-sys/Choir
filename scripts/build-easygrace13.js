const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

const MI_URL = "https://www.miwansung.com/html/sub02_01_view.php?idx=344&part1_idx=2";
const YT_PLAYLIST = "https://www.youtube.com/playlist?list=PL-spM1EaTXzxuyDGPbtQyTpjBYyuNFbZS";
const LIST_ID = "PL-spM1EaTXzxuyDGPbtQyTpjBYyuNFbZS";

function toSearchable(text) {
  return String(text || "")
    .replace(/[^0-9a-zA-Z가-힣]/g, "")
    .toLowerCase();
}

function normalizeTitle(text) {
  return String(text || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function classifyPart(videoTitle) {
  const t = videoTitle.toLowerCase();
  if (/소프라노/.test(videoTitle)) return "soprano";
  if (/알토/.test(videoTitle)) return "alto";
  if (/테너/.test(videoTitle)) return "tenor";
  if (/베이스|바리톤/.test(videoTitle)) return "bass";
  if (/연속듣기/.test(videoTitle)) return "playlist";
  if (/쉽고\s*은혜로운\s*찬양곡집\s*13/.test(videoTitle)) return "full";
  // fallback: title without part suffix treated as full
  if (!/[\/｜]/.test(videoTitle)) return "full";
  return "other";
}

function songKeyFromVideoTitle(videoTitle) {
  // "곡명 / 파트" or "곡명 테너 MIDI"
  let base = videoTitle.split(/\s*[\/｜]\s*/)[0].trim();
  base = base
    .replace(/\s*(소프라노|알토|테너|베이스|바리톤)\s*(MIDI)?$/i, "")
    .replace(/\s*MIDI$/i, "")
    .trim();
  return toSearchable(base);
}

async function fetchMiwansungSongs() {
  const html = await (
    await fetch(MI_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
    })
  ).text();

  const $ = cheerio.load(html);
  const songs = [];

  $("table tr").each((_, tr) => {
    const cells = $(tr)
      .find("td")
      .map((__, td) => $(td).text().replace(/\s+/g, " ").trim())
      .get();
    if (cells.length < 4) return;
    // layout: '', number, music, title, composer, ...
    const number = Number(cells[1]);
    const title = cells[3];
    if (!Number.isFinite(number) || number < 1 || !title) return;
    if (title.includes("저작권")) return;
    songs.push({
      number,
      title,
      composer: cells[4] || "",
      category: cells[6] || "",
    });
  });

  return songs;
}

async function browse(body) {
  const res = await fetch("https://www.youtube.com/youtubei/v1/browse?prettyPrint=false", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

function extractPlaylistVideos(json) {
  const videos = [];
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.lockupViewModel) {
      const lockup = node.lockupViewModel;
      const title = lockup.metadata?.lockupMetadataViewModel?.title?.content || "";
      const dump = JSON.stringify(lockup);
      const m = dump.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
      if (m && title) videos.push({ videoId: m[1], title });
    }
    if (node.playlistVideoRenderer) {
      const r = node.playlistVideoRenderer;
      const title =
        r.title?.runs?.map((x) => x.text).join("") || r.title?.simpleText || "";
      if (r.videoId && title) videos.push({ videoId: r.videoId, title });
    }
    for (const value of Object.values(node)) visit(value);
  };
  visit(json);
  return videos;
}

function findContinuationToken(json) {
  let token = null;
  const visit = (node) => {
    if (!node || typeof node !== "object" || token) return;
    if (node.continuationItemRenderer) {
      const c = node.continuationItemRenderer;
      token = c.continuationEndpoint?.continuationCommand?.token || null;
    }
    for (const value of Object.values(node)) visit(value);
  };
  visit(json);
  return token;
}

async function fetchPlaylistVideos() {
  const context = {
    client: {
      clientName: "WEB",
      clientVersion: "2.20240101.00.00",
      hl: "ko",
      gl: "KR",
    },
  };

  let json = await browse({ context, browseId: `VL${LIST_ID}` });
  const all = [];
  const seen = new Set();

  for (let page = 0; page < 50; page += 1) {
    const batch = extractPlaylistVideos(json);
    let added = 0;
    for (const video of batch) {
      if (seen.has(video.videoId)) continue;
      seen.add(video.videoId);
      all.push(video);
      added += 1;
    }

    const token = findContinuationToken(json);
    if (!token || added === 0) break;
    json = await browse({ context, continuation: token });
  }

  return all;
}

function buildPartsMap(videos) {
  const bySong = new Map();

  for (const video of videos) {
    const part = classifyPart(video.title);
    if (part === "playlist" || part === "other") continue;
    const key = songKeyFromVideoTitle(video.title);
    if (!key) continue;
    if (!bySong.has(key)) bySong.set(key, {});
    const bucket = bySong.get(key);
    // keep first for each part
    if (!bucket[part]) {
      bucket[part] = {
        youtubeId: video.videoId,
        videoTitle: video.title,
      };
    }
  }

  return bySong;
}

function findPartsForSong(partsMap, songTitle) {
  const key = toSearchable(songTitle);
  if (partsMap.has(key)) return partsMap.get(key);

  const candidates = [
    key,
    key.replace(/주님을/g, "주를").replace(/주님/g, "주"),
    key.replace(/주를/g, "주님을").replace(/주(?!님)/g, "주님"),
  ];

  const merged = {};
  for (const candidate of candidates) {
    const parts = partsMap.get(candidate);
    if (!parts) continue;
    for (const [partKey, value] of Object.entries(parts)) {
      if (!merged[partKey] && value) merged[partKey] = value;
    }
  }

  if (Object.keys(merged).length) return merged;

  // 유사 제목(우리의 기도 vs 우리의 기도를) 혼동 방지: 가장 긴 정확 일치 우선
  let best = null;
  let bestScore = -1;
  for (const [k, parts] of partsMap.entries()) {
    if (k === key) return parts;
    if (k.startsWith(key) || key.startsWith(k)) {
      const score = Math.min(k.length, key.length);
      if (score > bestScore) {
        bestScore = score;
        best = parts;
      }
    }
  }

  return best || {};
}

async function main() {
  const [songs, videos] = await Promise.all([fetchMiwansungSongs(), fetchPlaylistVideos()]);
  const partsMap = buildPartsMap(videos);

  const items = songs.map((song) => {
    const parts = findPartsForSong(partsMap, song.title);
    const displayTitle = `${String(song.number).padStart(2, "0")} ${song.title}`;
    const fullId = parts.full?.youtubeId || null;
    return {
      number: song.number,
      title: displayTitle,
      songTitle: song.title,
      composer: song.composer,
      category: song.category,
      normalizedTitle: normalizeTitle(displayTitle),
      searchableTitle: toSearchable(displayTitle),
      youtubeId: fullId,
      detailUrl: `./practice-easygrace13.html?n=${song.number}`,
      sourceUrl: MI_URL,
      playlistUrl: YT_PLAYLIST,
      parts: {
        full: parts.full || null,
        soprano: parts.soprano || null,
        alto: parts.alto || null,
        tenor: parts.tenor || null,
        bass: parts.bass || null,
      },
    };
  });

  const payload = {
    title: "쉽고 은혜로운 찬양곡집 13집",
    source: MI_URL,
    playlist: YT_PLAYLIST,
    updatedAt: new Date().toISOString(),
    count: items.length,
    items,
  };

  const out = path.join(__dirname, "..", "public", "mapping-easygrace13.json");
  fs.writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`saved ${items.length} songs -> ${out}`);
  const withFull = items.filter((i) => i.parts.full).length;
  const withAny = items.filter((i) => Object.values(i.parts).some((p) => p?.youtubeId)).length;
  console.log(`playlist videos: ${videos.length}`);
  console.log(`with full mix: ${withFull}, with any part: ${withAny}`);
  for (const n of [34, 35, 36, 37, 38]) {
    const song = items.find((i) => i.number === n);
    if (!song) continue;
    const partCount = Object.values(song.parts).filter((p) => p?.youtubeId).length;
    console.log(`#${n} ${song.songTitle}: ${partCount} parts`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
